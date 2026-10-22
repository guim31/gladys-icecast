// -----------------------------------------------------------------------------
// The Gladys devices, proposed in the Discovery tab: one per mount point of
// the Icecast server (its id is the mount path, "/radio.mp3", which the
// Icecast configuration and the sources fix, not the stream name, which every
// source sends as it likes):
//
//   online         input/binary            1 a source streams, 0 not
//   listeners      counter-sensor/integer  listeners right now
//   listeners_peak counter-sensor/integer  peak of listeners today (local day)
//   now_playing    text/text               "Artist – Title" ("—" when none)
//   bitrate        datarate/rate           kb/s, when the source tells it
//   uptime         duration/integer        minutes since the stream started
//
// A mount point is listed by Icecast only while a source streams: the
// integration remembers the ones it has seen (src/store.js), so a stopped
// stream stays a device, off air.
//
// Published with should_poll: false: the integration reads Icecast on its own
// timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { songText } from './icecast/client.js';

export const DEVICE_TYPE = 'mount';
export const MODEL = 'Icecast';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  LISTENERS: 'listeners',
  LISTENERS_PEAK: 'listeners_peak',
  NOW_PLAYING: 'now_playing',
  BITRATE: 'bitrate',
  UPTIME: 'uptime',
});

// A text state is never empty, or Gladys ignores it.
export const NONE = '—';

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ONLINE]: 'On air',
    [FEATURE_KEYS.LISTENERS]: 'Listeners',
    [FEATURE_KEYS.LISTENERS_PEAK]: 'Peak listeners today',
    [FEATURE_KEYS.NOW_PLAYING]: 'Now playing',
    [FEATURE_KEYS.BITRATE]: 'Bitrate',
    [FEATURE_KEYS.UPTIME]: 'On air for',
  },
  fr: {
    [FEATURE_KEYS.ONLINE]: "À l'antenne",
    [FEATURE_KEYS.LISTENERS]: 'Auditeurs',
    [FEATURE_KEYS.LISTENERS_PEAK]: "Pic d'auditeurs du jour",
    [FEATURE_KEYS.NOW_PLAYING]: 'Titre en cours',
    [FEATURE_KEYS.BITRATE]: 'Débit',
    [FEATURE_KEYS.UPTIME]: "Durée d'antenne",
  },
  de: {
    [FEATURE_KEYS.ONLINE]: 'Auf Sendung',
    [FEATURE_KEYS.LISTENERS]: 'Zuhörer',
    [FEATURE_KEYS.LISTENERS_PEAK]: 'Zuhörerspitze heute',
    [FEATURE_KEYS.NOW_PLAYING]: 'Aktueller Titel',
    [FEATURE_KEYS.BITRATE]: 'Bitrate',
    [FEATURE_KEYS.UPTIME]: 'Auf Sendung seit',
  },
  es: {
    [FEATURE_KEYS.ONLINE]: 'En antena',
    [FEATURE_KEYS.LISTENERS]: 'Oyentes',
    [FEATURE_KEYS.LISTENERS_PEAK]: 'Pico de oyentes de hoy',
    [FEATURE_KEYS.NOW_PLAYING]: 'Canción actual',
    [FEATURE_KEYS.BITRATE]: 'Tasa de bits',
    [FEATURE_KEYS.UPTIME]: 'En antena desde hace',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_LISTENERS = 100_000;
export const MAX_BITRATE = 10_000;
export const MAX_UPTIME_MINUTES = 525_600; // a year

/**
 * The platform id of a mount point: its path without the leading slash, the
 * characters an external id cannot hold replaced ("/radio.mp3" → "radio.mp3").
 */
export const mountSlug = (mount) => mount.replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]/g, '_');

export const mountIds = (gladys, mount) => gladys.externalIds(DEVICE_TYPE, mountSlug(mount));

/** The slug of a device external id, null when not one of ours. */
export function slugOf(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (!externalId.startsWith(prefix)) {
    return null;
  }
  const slug = externalId.slice(prefix.length);
  return slug && !slug.includes(':') ? slug : null;
}

/** The device name: the stream name with its mount, or the mount alone. */
export const deviceName = (mount, name) => (name ? `${name} (${mount})` : mount);

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const binary = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.INPUT, DEVICE_FEATURE_TYPES.SENSOR.BINARY, {
    keep_history: true,
    min: 0,
    max: 1,
  });

const counter = (name, externalId) =>
  sensor(
    name,
    externalId,
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max: MAX_LISTENERS },
  );

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    // NOT NULL in the core, even for a text: 422 on "Add to Gladys" without them.
    min: 0,
    max: 0,
  });

/**
 * The discovery payload of a mount point.
 * @param {object} gladys
 * @param {{ mount: string, name: string }} mount
 * @param {string} [language]
 */
export function buildMountDevice(gladys, { mount, name }, language = 'en') {
  const ids = mountIds(gladys, mount);
  const names = NAMES[language] ?? NAMES.en;
  const id = (key) => ids.feature(key);
  return {
    name: deviceName(mount, name),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [{ name: 'MOUNT', value: mount.slice(0, 255) }],
    features: [
      binary(names[FEATURE_KEYS.ONLINE], id(FEATURE_KEYS.ONLINE)),
      counter(names[FEATURE_KEYS.LISTENERS], id(FEATURE_KEYS.LISTENERS)),
      counter(names[FEATURE_KEYS.LISTENERS_PEAK], id(FEATURE_KEYS.LISTENERS_PEAK)),
      text(names[FEATURE_KEYS.NOW_PLAYING], id(FEATURE_KEYS.NOW_PLAYING)),
      sensor(
        names[FEATURE_KEYS.BITRATE],
        id(FEATURE_KEYS.BITRATE),
        DEVICE_FEATURE_CATEGORIES.DATARATE,
        DEVICE_FEATURE_TYPES.DATARATE.RATE,
        { keep_history: false, unit: 'kilobits-per-second', min: 0, max: MAX_BITRATE },
      ),
      sensor(
        names[FEATURE_KEYS.UPTIME],
        id(FEATURE_KEYS.UPTIME),
        DEVICE_FEATURE_CATEGORIES.DURATION,
        DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        // Grows every minute: no history.
        { keep_history: false, unit: 'minutes', min: 0, max: MAX_UPTIME_MINUTES },
      ),
    ],
  };
}

/**
 * The value of every feature of a mount point:
 * `{ key, device_feature_external_id, state | text }`.
 * @param {object} gladys
 * @param {object} view the mount point as the hub sees it (src/hub.js `mountView()`)
 */
export function mountValues(gladys, view) {
  const ids = mountIds(gladys, view.mount);
  const values = [{ key: FEATURE_KEYS.ONLINE, state: view.online ? 1 : 0 }];
  if (view.fresh) {
    values.push(
      { key: FEATURE_KEYS.LISTENERS, state: Math.min(view.listeners, MAX_LISTENERS) },
      { key: FEATURE_KEYS.LISTENERS_PEAK, state: Math.min(view.peak, MAX_LISTENERS) },
      { key: FEATURE_KEYS.NOW_PLAYING, text: (view.online && songText(view.song)) || NONE },
      { key: FEATURE_KEYS.UPTIME, state: Math.min(view.uptimeMinutes, MAX_UPTIME_MINUTES) },
    );
    // Unknown (a source that does not tell it): no value rather than a false 0.
    if (view.online && view.bitrate !== null) {
      values.push({ key: FEATURE_KEYS.BITRATE, state: Math.min(view.bitrate, MAX_BITRATE) });
    }
  }
  return values.map(({ key, ...value }) => ({
    key,
    device_feature_external_id: ids.feature(key),
    ...value,
  }));
}
