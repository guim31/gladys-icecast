// -----------------------------------------------------------------------------
// The Icecast hub: /status-json.xsl read on a timer of the container (the
// interval chosen in the configuration), one request for every mount point;
// the states of the mount devices published when they change, the scene
// events fired on transitions, and the views the widget and the scene actions
// read. (Adapted from guim31/gladys-azuracast.)
//
// Gladys never polls the devices (should_poll: false, see the CLAUDE.md
// polling trap of the 5.2 core): the timer of the container does.
//
// Icecast lists a mount point only while a source streams to it. One rule on
// top, so that a hiccup fires nothing: a stream is stopped once its mount
// point has been missing (or Icecast silent) for GRACE_MS — a source whose
// connection drops for a few seconds neither stops the stream nor starts a
// new one. What each mount point was (on air, the title, the start of the
// stream, the peak of the day and the listener thresholds reached) is kept in
// /data (src/store.js): a restart of the integration or of Gladys neither
// fires a transition twice nor misses one, and a stopped stream stays known.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  buildMountDevice,
  deviceName,
  mountIds,
  mountSlug,
  mountValues,
  slugOf,
} from './devices.js';
import { IcecastClient, IcecastError, songText } from './icecast/client.js';
import { hostOf, isLocalAddress, normalizeConfig as normalizeIntegrationConfig } from './config.js';
import { ProblemLog } from './problems.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  STATE_TEXT,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'icecast-hub' });

export const WIDGET_KEY = 'mounts';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  STARTED: 'stream_started',
  STOPPED: 'stream_stopped',
  TRACK: 'track_changed',
  LISTENERS: 'listeners_reached',
});

// The listener counts the "listeners reached" trigger offers (manifest
// options of its `threshold` field): each one fires at most once a day.
export const LISTENER_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

export const HUB_TIMINGS = {
  // Missing for this long before a stream counts as stopped.
  graceMs: 60_000,
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // A scene action reads Icecast again when the last read is older.
  freshMs: 5_000,
  // A mount point neither seen nor added in Gladys for this long is forgotten.
  forgetMs: 30 * 24 * 3600_000,
};

const MINUTE = 60_000;

const emptySaved = () => ({ known: false, mounts: {} });

/** The local day (the supervisor sets TZ to the time zone of Gladys). */
export function dayOf(time) {
  const date = new Date(time);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export class IcecastHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/icecast/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    // Defaults until start(): a handler reached after a failed start still
    // answers with a readable message.
    this.config = normalizeIntegrationConfig({});
    this.client = null;
    this.signature = null;
    /** @type {Map<string, object>} the live mount points of the last successful read */
    this.mounts = new Map();
    this.server = '';
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.saved = emptySaved();
    this.pollTimer = null;
    this.stopped = false;
    // What fails again at every cycle (Gladys refusing, the reading loop):
    // one line when it starts, one when it ends.
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved =
      saved && saved.known === true && saved.mounts && typeof saved.mounts === 'object'
        ? saved
        : emptySaved();
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const signature = config.url;
    if (signature !== this.signature) {
      this.signature = signature;
      this.client = config.url
        ? new IcecastClient({ url: config.url, request: this.request })
        : null;
      this.mounts = new Map();
      this.server = '';
      this.readAt = 0;
      this.error = null;
      this.polling = null;
      this.transports.clear();
    }
    // A new language: new names for Discovery.
    this.discovered = null;
    try {
      if (this.client) {
        await this.pollNow({ publish: true });
      } else {
        await this.afterChanges(true, { publish: true });
      }
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  /** The next read by the timer, after `delayMs` (the refresh interval by default). */
  schedulePoll(delayMs = this.config.pollIntervalMs) {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    const timer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading Icecast works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      if (this.pollTimer === timer) {
        this.schedulePoll();
      }
    }, delayMs);
    this.pollTimer = timer;
  }

  // --- Reading Icecast -------------------------------------------------------

  /** Read the server now and publish what changed. */
  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  /** Read again when the last read is older than `freshMs` (scene actions). */
  async refreshIfStale() {
    if (this.client && this.now() - this.readAt >= this.timings.freshMs) {
      await this.pollNow();
    }
  }

  /**
   * Read the server and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll() {
    if (!this.client) {
      return Promise.resolve(false);
    }
    if (!this.polling) {
      const polling = this.read(this.client).finally(() => {
        // A read of a previous client must not drop the promise of the current one.
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    return this.polling;
  }

  async read(client) {
    let status;
    try {
      status = await client.status();
    } catch (err) {
      if (!(err instanceof IcecastError)) {
        throw err;
      }
      // Checked after the await: a read of a previous client never lands.
      return client === this.client && this.applyFailure(err);
    }
    if (client !== this.client) {
      return false;
    }
    return this.applySuccess(status);
  }

  async applySuccess({ server, mounts }) {
    if (this.error) {
      logger.info('Icecast answers again');
    }
    if (this.readAt === 0) {
      logger.info(
        `${server || 'Icecast'} (${hostOf(this.config.url)}): ${mounts.length} mount point(s) on air`,
      );
    }
    const before = JSON.stringify(this.views());
    const wasError = this.error !== null || this.readAt === 0;
    this.error = null;
    this.readAt = this.now();
    this.server = server;
    this.mounts = new Map(mounts.map((source) => [source.mount, source]));
    await this.observeAll();
    return wasError || JSON.stringify(this.views()) !== before;
  }

  async applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`Icecast: ${err.message}`);
    }
    // Icecast silent: its streams stop after the grace.
    await this.observeAll();
    return wasError !== err.kind;
  }

  /** Compare every mount point with what was saved; fire the events, publish the states. */
  async observeAll() {
    const now = this.now();
    const events = [];
    let dirty = false;
    // The first read of a server only sets the states: no event.
    const firstRead = !this.saved.known || this.saved.url !== this.config.url;
    if (firstRead) {
      this.saved = { known: true, url: this.config.url, mounts: {} };
      dirty = true;
    }
    const mounts = new Set([...this.mounts.keys(), ...Object.keys(this.saved.mounts)]);
    for (const mount of mounts) {
      const source = this.error ? null : (this.mounts.get(mount) ?? null);
      dirty = this.transition(mount, source, now, events, firstRead) || dirty;
    }
    dirty = this.forgetOld(now) || dirty;
    if (dirty) {
      this.store.save(this.saved);
    }
    for (const [key, data] of events) {
      await this.fire(key, data);
    }
    await this.publishStates();
  }

  /** Drop the mount points gone for a month that are not devices in Gladys. */
  forgetOld(now) {
    if (this.error) {
      return false;
    }
    let dirty = false;
    for (const [mount, saved] of Object.entries(this.saved.mounts)) {
      if (
        !saved.online &&
        now - (saved.seenAt ?? 0) >= this.timings.forgetMs &&
        !this.isCreated(mountIds(this.gladys, mount).device)
      ) {
        delete this.saved.mounts[mount];
        dirty = true;
      }
    }
    return dirty;
  }

  /**
   * One mount point: the saved state against what Icecast says (null: not
   * listed now, or Icecast silent); queue the scene events. Synchronous: a
   * concurrent read cannot interleave.
   * @returns {boolean} whether the saved state changed
   */
  transition(mount, source, now, events, firstRead) {
    const day = dayOf(now);
    let saved = this.saved.mounts[mount];
    const base = () => ({
      mount: mountIds(this.gladys, mount).device,
      mount_name: deviceName(mount, saved.name),
    });
    if (!saved) {
      if (!source) {
        return false;
      }
      saved = {
        name: source.name,
        online: true,
        title: songText(source.song),
        since: Math.min(now, source.since ?? now),
        seenAt: now,
        day,
        peak: source.listeners,
        milestones: LISTENER_MILESTONES.filter((m) => source.listeners >= m),
      };
      this.saved.mounts[mount] = saved;
      if (!firstRead) {
        // A new mount point on a server already watched: a stream starts.
        logger.info(`${mount}: on air`);
        events.push([TRIGGERS.STARTED, { ...base(), text: saved.title }]);
        this.milestoneEvents(saved, source, events, base, []);
      }
      return true;
    }
    let dirty = false;
    const set = (key, value) => {
      if (saved[key] !== value) {
        saved[key] = value;
        dirty = true;
      }
    };
    if (source) {
      set('name', source.name || saved.name);
      // Not saved at every read (a write per cycle): a day is precise enough
      // to forget a mount point after a month.
      if (now - (saved.seenAt ?? 0) >= 24 * 3600_000) {
        set('seenAt', now);
      }
    }

    // On air or not.
    if (source) {
      if (saved.missingSince !== undefined) {
        // Back within the grace: the same stream goes on.
        delete saved.missingSince;
        dirty = true;
      }
      if (!saved.online) {
        saved.online = true;
        saved.since = Math.min(now, source.since ?? now);
        saved.seenAt = now;
        dirty = true;
        logger.info(`${mount}: on air`);
        events.push([TRIGGERS.STARTED, { ...base(), text: songText(source.song) }]);
      }
    } else if (saved.online) {
      if (saved.missingSince === undefined) {
        saved.missingSince = now;
        dirty = true;
      }
      if (now - saved.missingSince >= this.timings.graceMs) {
        const minutes = Math.max(
          0,
          Math.round((saved.missingSince - (saved.since ?? saved.missingSince)) / MINUTE),
        );
        delete saved.missingSince;
        saved.online = false;
        saved.seenAt = now;
        dirty = true;
        logger.info(`${mount}: off air after ${minutes} min`);
        events.push([TRIGGERS.STOPPED, { ...base(), duration_minutes: minutes }]);
      }
    }

    // The listeners of the day. Only on a reading of the mount point: a failed
    // reading at midnight would forget the thresholds already reached.
    if (saved.day !== day && source) {
      saved.day = day;
      saved.peak = source.listeners;
      // Already reached at midnight: nothing to announce.
      saved.milestones = LISTENER_MILESTONES.filter((m) => saved.peak >= m);
      dirty = true;
    }
    if (source) {
      if (source.listeners > saved.peak) {
        saved.peak = source.listeners;
        dirty = true;
      }
      dirty = this.milestoneEvents(saved, source, events, base, saved.milestones) || dirty;
    }

    // The title: a change while on air (an empty title is no song).
    const title = source ? songText(source.song) : '';
    if (title && title !== saved.title) {
      saved.title = title;
      dirty = true;
      events.push([
        TRIGGERS.TRACK,
        {
          ...base(),
          text: title,
          artist: source.song.artist,
          title: source.song.title,
        },
      ]);
    }
    return dirty;
  }

  /** The thresholds newly reached by a mount point. */
  milestoneEvents(saved, source, events, base, reached) {
    let dirty = false;
    for (const milestone of LISTENER_MILESTONES) {
      if (source.listeners >= milestone && !reached.includes(milestone)) {
        if (!saved.milestones.includes(milestone)) {
          saved.milestones.push(milestone);
        }
        dirty = true;
        events.push([
          TRIGGERS.LISTENERS,
          { ...base(), threshold: milestone, listeners: source.listeners },
        ]);
      }
    }
    return dirty;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Views -----------------------------------------------------------------

  /** A mount point as the device, the widget and the scene actions see it. */
  mountView(mount) {
    const saved = this.saved.mounts[mount];
    const source = this.error ? null : (this.mounts.get(mount) ?? null);
    if (!saved && !source) {
      return null;
    }
    const online = saved ? saved.online === true : true;
    const since = saved?.since ?? source?.since ?? null;
    return {
      mount,
      name: deviceName(mount, source?.name || saved?.name || ''),
      // Icecast answered just now (else only "online" is known).
      fresh: this.error === null && this.readAt !== 0,
      online,
      listeners: source?.listeners ?? 0,
      peak: saved?.peak ?? source?.listeners ?? 0,
      song: source?.song ?? null,
      bitrate: source?.bitrate ?? null,
      uptimeMinutes:
        online && since !== null ? Math.max(0, Math.floor((this.now() - since) / MINUTE)) : 0,
      genre: source?.genre ?? '',
    };
  }

  /** Every known mount point, by path. */
  views() {
    const mounts = new Set([...this.mounts.keys(), ...Object.keys(this.saved.mounts)]);
    return [...mounts].sort((a, b) => a.localeCompare(b)).map((mount) => this.mountView(mount));
  }

  /** The device external id of a mount point. */
  mountExternalId(mount) {
    return mountIds(this.gladys, mount).device;
  }

  /**
   * The mount point of a device external id (a widget setting, a scene field).
   * @returns {string|null}
   */
  mountFor(externalId) {
    const slug = slugOf(this.gladys, externalId);
    if (slug === null) {
      return null;
    }
    const mounts = new Set([...this.mounts.keys(), ...Object.keys(this.saved.mounts)]);
    return [...mounts].find((mount) => mountSlug(mount) === slug) ?? null;
  }

  // --- Publishing to Gladys --------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  discoveredDevices() {
    if (!this.client) {
      return [];
    }
    // Nothing read, or Icecast silent: keep the list Gladys has.
    if (this.readAt === 0 || this.error) {
      return null;
    }
    return this.views().map((view) =>
      buildMountDevice(
        this.gladys,
        {
          mount: view.mount,
          name: this.mounts.get(view.mount)?.name || this.saved.mounts[view.mount]?.name || '',
        },
        this.config.language,
      ),
    );
  }

  /** Publish the Discovery list when it changed (a new mount point, a new name…). */
  async publishDevices({ force = false } = {}) {
    const devices = this.discoveredDevices();
    if (devices === null) {
      return;
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Icecast, publish the mount points again. */
  async rediscover() {
    await this.poll();
    await this.afterChanges(true, { publish: true });
  }

  /**
   * The user added (or updated) a device: its states sent before were
   * dropped by Gladys (the SDK already forgot them), and it needs its badge.
   */
  async onDeviceCreated() {
    this.transports.clear();
    await this.publishStates();
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll, only if it polls anyway). */
  async pollDevice() {
    await this.pollNow();
  }

  /** The states of the added devices. The SDK skips the unchanged values. */
  async publishStates() {
    if (this.readAt === 0) {
      return;
    }
    const states = this.views()
      .filter((view) => this.isCreated(this.mountExternalId(view.mount)))
      .flatMap((view) => mountValues(this.gladys, view))
      .map(({ key: _key, ...state }) => state);
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of each device: local or cloud (from the address), or unreachable. */
  async publishTransports() {
    if (!this.client || this.readAt === 0) {
      return;
    }
    const transport = this.error
      ? DEVICE_TRANSPORTS.UNREACHABLE
      : isLocalAddress(this.config.url)
        ? DEVICE_TRANSPORTS.LOCAL
        : DEVICE_TRANSPORTS.CLOUD;
    const changes = [];
    for (const view of this.views()) {
      const externalId = this.mountExternalId(view.mount);
      if (this.isCreated(externalId) && this.transports.get(externalId) !== transport) {
        changes.push({ external_id: externalId, transport });
      }
    }
    if (changes.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(changes);
      for (const { external_id: externalId } of changes) {
        this.transports.set(externalId, transport);
      }
      this.problems.recover('transports', 'Transports accepted again');
    } catch (err) {
      this.problems.fail('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (this.config.url === '') {
      return { connected: false, message: CONNECTION_TEXT.noUrl };
    }
    if (!this.config.url) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands (scene actions, report) --------------------------------------

  /** Throws the reason Icecast cannot answer, if any. */
  assertReadable() {
    if (!this.config.url || this.error) {
      throw new Error(pick(this.connectionStatus().message, this.config.language));
    }
  }

  /**
   * The mount point a command targets, read just now.
   * @param {string} [externalId] the device chosen in the scene
   */
  async commandMount(externalId) {
    if (!this.client) {
      this.assertReadable();
    }
    await this.refreshIfStale();
    this.assertReadable();
    const mount = this.mountFor(externalId);
    if (mount === null) {
      throw new Error(pick(ACTION_TEXT.unknownMount, this.config.language));
    }
    return this.mountView(mount);
  }

  /** One line about a mount point, in a language. */
  sentence(view, language) {
    const text = REPORT_TEXT[language] ?? REPORT_TEXT.en;
    const parts = [pick(view.online ? STATE_TEXT.online : STATE_TEXT.offline, language)];
    if (view.online) {
      const song = songText(view.song);
      if (song) {
        parts.push(song);
      }
      parts.push(text.listeners(view.listeners));
    }
    return labelled(view.name, parts.join(', '), language);
  }

  /** "Test the connection": read Icecast now, one line. */
  async testConnection() {
    await this.pollNow({ publish: true });
    const status = this.connectionStatus();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!status.connected) {
        message[language] = pick(status.message, language);
        continue;
      }
      const parts = [text.ok];
      if (this.server) {
        parts.push(this.server);
      }
      parts.push(text.mounts(this.mounts.size));
      for (const view of this.views()
        .filter((v) => v.online)
        .slice(0, 3)) {
        parts.push(this.sentence(view, language));
      }
      message[language] = parts.join(' · ');
    }
    return message;
  }
}
