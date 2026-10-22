// -----------------------------------------------------------------------------
// The Icecast client on the real answers of Icecast 2.4.4 in Docker
// (test/fixtures/icecast): one mount point (an object), several (an array),
// none (no `source`), MP3 titles "Artist - Title", Ogg artist and title apart,
// and the errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ERROR_KINDS,
  IcecastClient,
  IcecastError,
  mountOf,
  normalizeSong,
  normalizeStatus,
} from '../src/icecast/client.js';

const fixture = async (name) =>
  readFile(new URL(`./fixtures/icecast/${name}.json`, import.meta.url), 'utf8');

const clientFor = (answer) =>
  new IcecastClient({
    url: 'http://192.0.2.10:8000',
    request: async (url, options) => {
      if (typeof answer === 'function') {
        return answer(url, options);
      }
      return { status: 200, body: answer };
    },
  });

test('two mount points: an MP3 stream and an Ogg stream', async () => {
  const status = await clientFor(await fixture('two-mounts')).status();
  assert.equal(status.server, 'Icecast 2.4.4');
  assert.deepEqual(status.mounts, [
    {
      mount: '/lounge.ogg',
      name: 'Lounge',
      listeners: 1,
      listenerPeak: 1,
      song: { artist: 'Miles Davis', title: 'Blue in Green' },
      bitrate: 96,
      since: Date.parse('2026-10-22T21:03:07+0000'),
      genre: 'various',
    },
    {
      mount: '/radio.mp3',
      name: 'Radio Gladys',
      listeners: 3,
      listenerPeak: 3,
      song: { artist: 'Daft Punk', title: 'Get Lucky (feat. "Pharrell") été' },
      bitrate: null,
      since: Date.parse('2026-10-22T21:03:05+0000'),
      genre: 'Jazz',
    },
  ]);
});

test('one mount point is an object, none is no `source` at all', async () => {
  const one = await clientFor(await fixture('one-mount')).status();
  assert.deepEqual(
    one.mounts.map((m) => m.mount),
    ['/radio.mp3'],
  );
  const none = await clientFor(await fixture('no-source')).status();
  assert.deepEqual(none.mounts, []);
});

test('the requested address and headers', async () => {
  const seen = [];
  await clientFor((url, options) => {
    seen.push([url, options.headers]);
    return { status: 200, body: '{"icestats":{}}' };
  }).status();
  assert.deepEqual(seen, [
    ['http://192.0.2.10:8000/status-json.xsl', { accept: 'application/json' }],
  ]);
});

test('songs, mounts, bitrates, default names', () => {
  assert.deepEqual(normalizeSong({ title: 'Jingle' }), { artist: '', title: 'Jingle' });
  assert.deepEqual(normalizeSong({ title: ' A  -  B - C ' }), { artist: 'A', title: 'B - C' });
  assert.equal(normalizeSong({}), null);
  assert.equal(mountOf('http://localhost:8000/my%20radio'), '/my radio');
  assert.equal(mountOf('http://localhost:8000/'), null);
  assert.equal(mountOf(42), null);
  const status = normalizeStatus({
    icestats: {
      source: [
        {
          listenurl: 'http://h/a',
          server_name: 'Unspecified name',
          bitrate: '128',
          listeners: '-1',
        },
        {
          listenurl: 'http://h/b',
          audio_bitrate: 64000,
          listeners: 'x',
          stream_start_iso8601: 'nope',
        },
        { listenurl: 'http://h/a', server_name: 'duplicate' },
        { server_name: 'no mount' },
        'junk',
      ],
    },
  });
  assert.deepEqual(
    status.mounts.map((m) => [m.mount, m.name, m.bitrate, m.listeners, m.since]),
    [
      ['/a', '', 128, 0, null],
      ['/b', '', 64, 0, null],
    ],
  );
});

test('errors: down, certificate, password, redirect, not Icecast, not JSON, other', async () => {
  const kindOf = async (answer) => {
    try {
      await clientFor(answer).status();
    } catch (err) {
      assert.ok(err instanceof IcecastError);
      return err.kind;
    }
    return null;
  };
  const thrower = (cause) => async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause });
  };
  assert.equal(await kindOf(thrower({ code: 'ECONNREFUSED' })), ERROR_KINDS.UNREACHABLE);
  assert.equal(await kindOf(thrower({ code: 'CERT_HAS_EXPIRED' })), ERROR_KINDS.TLS);
  assert.equal(await kindOf(() => ({ status: 401, body: '' })), ERROR_KINDS.AUTH);
  assert.equal(await kindOf(() => ({ status: 302, body: '' })), ERROR_KINDS.REDIRECT);
  assert.equal(await kindOf(() => ({ status: 404, body: '' })), ERROR_KINDS.NOT_ICECAST);
  assert.equal(await kindOf(() => ({ status: 500, body: '' })), ERROR_KINDS.HTTP);
  assert.equal(await kindOf('<html></html>'), ERROR_KINDS.NOT_ICECAST);
  assert.equal(await kindOf('{"other":1}'), ERROR_KINDS.NOT_ICECAST);
});
