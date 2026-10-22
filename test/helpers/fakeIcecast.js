// -----------------------------------------------------------------------------
// An in-memory Icecast, rendering /status-json.xsl like Icecast 2.4.4 in
// Docker (test/fixtures/icecast/two-mounts.json): one `source` entry per
// mount point a source streams to — an object for one, an array for several,
// no `source` for none — with `listeners`, `listener_peak`, `server_name`,
// `title` (and `artist` for an Ogg stream), the bitrate and the start of the
// stream.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const BASE = 'http://192.0.2.10:8000';

const fixture = (name) => new URL(`../fixtures/icecast/${name}`, import.meta.url);
const REAL = JSON.parse(readFileSync(fixture('two-mounts.json'), 'utf8')).icestats;
// The MP3 entry (title "Artist - Title") and the Ogg entry (artist and title apart).
const MP3 = REAL.source.find((entry) => entry.server_type === 'audio/mpeg');
const OGG = REAL.source.find((entry) => entry.server_type === 'application/ogg');

const clone = (value) => JSON.parse(JSON.stringify(value));
const iso = (time) => new Date(time).toISOString().replace(/\.\d+Z$/, '+0000');

export class FakeIcecast {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    /** @type {Map<string, object>} the mount points a source streams to */
    this.sources = new Map();
    this.start('/radio.mp3', { name: 'Radio Gladys', title: 'Artist 1 - Title 1' });
    /** 'down': the server does not answer; a number: that HTTP status; a string: that body. */
    this.failure = null;
    this.requests = [];
    this.request = this.request.bind(this);
  }

  /** A source connects to a mount point (MP3, or Ogg with `ogg: true`). */
  start(mount, { name = '', title = '', artist = '', ogg = false, listeners = 0 } = {}) {
    const source = {
      mount,
      name,
      title,
      artist,
      ogg,
      listeners,
      peak: listeners,
      since: this.now(),
    };
    this.sources.set(mount, source);
    return source;
  }

  /** The source disconnects: the mount point is no longer listed. */
  stop(mount = '/radio.mp3') {
    this.sources.delete(mount);
  }

  source(mount = '/radio.mp3') {
    return this.sources.get(mount);
  }

  setListeners(count, mount = '/radio.mp3') {
    const source = this.source(mount);
    source.listeners = count;
    source.peak = Math.max(source.peak, count);
  }

  entry(source) {
    const out = clone(source.ogg ? OGG : MP3);
    out.listenurl = `http://localhost:8000${source.mount}`;
    out.listeners = source.listeners;
    out.listener_peak = source.peak;
    out.server_name = source.name || 'Unspecified name';
    out.stream_start_iso8601 = iso(source.since);
    out.stream_start = new Date(source.since).toUTCString().replace('GMT', '+0000');
    delete out.title;
    delete out.artist;
    if (source.title) {
      out.title = source.title;
    }
    if (source.artist) {
      out.artist = source.artist;
    }
    return out;
  }

  status() {
    const stats = { ...REAL };
    delete stats.source;
    delete stats.dummy;
    const entries = [...this.sources.values()]
      .sort((a, b) => a.mount.localeCompare(b.mount))
      .map((source) => this.entry(source));
    if (entries.length === 1) {
      stats.source = entries[0];
    } else if (entries.length > 1) {
      stats.source = entries;
    }
    stats.dummy = null;
    return { icestats: stats };
  }

  async request(url, { headers = {} } = {}) {
    const { pathname } = new URL(url);
    this.requests.push({ path: pathname, headers });
    if (this.failure === 'down') {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (typeof this.failure === 'number') {
      return { status: this.failure, body: '' };
    }
    if (typeof this.failure === 'string') {
      return { status: 200, body: this.failure };
    }
    if (pathname === '/status-json.xsl') {
      return { status: 200, body: JSON.stringify(this.status()) };
    }
    return { status: 404, body: '<html><body><b>404 File Not Found</b></body></html>' };
  }
}
