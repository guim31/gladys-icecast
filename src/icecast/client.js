// -----------------------------------------------------------------------------
// Icecast client: the public status of an Icecast server (GPL-2.0,
// https://icecast.org), checked against Icecast 2.4.4 in Docker
// (test/fixtures/icecast):
//
//   GET /status-json.xsl   public, no password: `icestats` with `server_id`
//       and `source`, one entry per mount point a source is connected to — an
//       object for one mount, an array for several, absent for none. Each
//       entry: `listenurl`, `listeners`, `listener_peak`, `server_name`,
//       `title`, `artist` (Ogg/Opus streams carry them apart, MP3 streams
//       write "Artist - Title" in `title`), `bitrate` or `ice-bitrate` (kb/s)
//       or `audio_bitrate` (b/s), `stream_start_iso8601`.
//
// A mount point without source is not listed: "off air" is its absence.
// Redirects are not followed (an http:// address redirected to https:// is
// reported, so the user types the right one).
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // a password is asked (a reverse proxy in front)
  NOT_ICECAST: 'not_icecast', // something answers, not the Icecast status
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  HTTP: 'http', // any other HTTP error
});

export class IcecastError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'IcecastError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// A few KB per mount point: 1 MB is a server with hundreds of them.
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory Icecast
 * (test/helpers/fakeIcecast.js).
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpRequest(url, { headers = {}, timeoutMs = 10_000 } = {}) {
  const response = await fetch(url, {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BODY_BYTES) {
    throw new Error('Response too large');
  }
  return { status: response.status, body: bytes.toString('utf8') };
}

const clean = (value, max) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, max)
    : '';

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
};

// What Icecast writes when the source sent no name.
const DEFAULT_NAMES = new Set(['', 'unspecified name', 'no name']);

/** "Artist – Title", or the title alone. */
export function songText(song) {
  if (!song) {
    return '';
  }
  if (song.artist && song.title) {
    return `${song.artist} – ${song.title}`;
  }
  return song.title || song.artist || '';
}

/**
 * The song of a source. Ogg and Opus streams send the artist and the title
 * apart; MP3 and AAC streams send one "Artist - Title" text, split here on
 * its first " - ".
 * @returns {{ artist: string, title: string }|null}
 */
export function normalizeSong(raw) {
  let artist = clean(raw?.artist, 150);
  let title = clean(raw?.title, 255);
  if (!artist && title.includes(' - ')) {
    const at = title.indexOf(' - ');
    artist = title.slice(0, at).trim();
    title = title.slice(at + 3).trim();
  }
  if (!artist && !title) {
    return null;
  }
  return { artist, title };
}

/** The bitrate in kb/s: `bitrate` and `ice-bitrate` are in kb/s, `audio_bitrate` in b/s. */
function bitrateOf(raw) {
  for (const value of [raw.bitrate, raw['ice-bitrate']]) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) {
      return Math.round(number);
    }
  }
  const bits = Number(raw.audio_bitrate);
  return Number.isFinite(bits) && bits > 0 ? Math.round(bits / 1000) : null;
}

/** The mount point of a listen URL: its path ("/radio.mp3"). */
export function mountOf(listenUrl) {
  if (typeof listenUrl !== 'string' || !listenUrl) {
    return null;
  }
  let path;
  try {
    // The host is the <hostname> of the Icecast configuration, often
    // "localhost": only the path matters.
    path = new URL(listenUrl, 'http://icecast').pathname;
  } catch {
    return null;
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // Kept as written.
  }
  return path.length > 1 && path.length <= 200 ? path : null;
}

/**
 * One entry of `icestats.source`, normalized; null when it has no mount.
 * @returns {{ mount: string, name: string, listeners: number, listenerPeak: number,
 *   song: object|null, bitrate: number|null, since: number|null, genre: string }|null}
 */
export function normalizeSource(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const mount = mountOf(raw.listenurl);
  if (!mount) {
    return null;
  }
  const name = clean(raw.server_name, 100);
  const since = Date.parse(raw.stream_start_iso8601 ?? '');
  return {
    mount,
    name: DEFAULT_NAMES.has(name.toLowerCase()) ? '' : name,
    listeners: count(raw.listeners),
    listenerPeak: count(raw.listener_peak),
    song: normalizeSong(raw),
    bitrate: bitrateOf(raw),
    since: Number.isFinite(since) ? since : null,
    genre: clean(raw.genre, 100),
  };
}

/** The whole /status-json.xsl answer: the server and its live mount points. */
export function normalizeStatus(raw) {
  const stats = raw?.icestats;
  if (!stats || typeof stats !== 'object') {
    throw new IcecastError(ERROR_KINDS.NOT_ICECAST, 'The answer is not an Icecast status');
  }
  const list = Array.isArray(stats.source) ? stats.source : stats.source ? [stats.source] : [];
  const mounts = new Map();
  for (const entry of list) {
    const source = normalizeSource(entry);
    if (source && !mounts.has(source.mount)) {
      mounts.set(source.mount, source);
    }
  }
  return {
    server: clean(stats.server_id, 100),
    mounts: [...mounts.values()].sort((a, b) => a.mount.localeCompare(b.mount)),
  };
}

export class IcecastClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, request = httpRequest, timeoutMs }) {
    this.url = url;
    this.request = request;
    this.timeoutMs = timeoutMs ?? 10_000;
  }

  /**
   * The server and the mount points a source streams to now.
   * @throws {IcecastError}
   */
  async status() {
    let response;
    try {
      response = await this.request(`${this.url}/status-json.xsl`, {
        headers: { accept: 'application/json' },
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new IcecastError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      const reason = code ?? (/too large/i.test(err.message) ? 'Response too large' : err.name);
      throw new IcecastError(ERROR_KINDS.UNREACHABLE, reason || 'Request failed');
    }
    const { status } = response;
    if (status === 401 || status === 403) {
      throw new IcecastError(ERROR_KINDS.AUTH, `Refused (HTTP ${status})`, { status });
    }
    if (status >= 300 && status < 400) {
      throw new IcecastError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404) {
      throw new IcecastError(ERROR_KINDS.NOT_ICECAST, 'Not found: /status-json.xsl (HTTP 404)', {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      throw new IcecastError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
    }
    let raw;
    try {
      raw = JSON.parse(response.body);
    } catch {
      // Old Icecast versions could write invalid JSON (an unescaped title).
      throw new IcecastError(ERROR_KINDS.NOT_ICECAST, 'The answer of /status-json.xsl is not JSON');
    }
    return normalizeStatus(raw);
  }
}
