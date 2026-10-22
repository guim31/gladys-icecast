// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake Icecast: discovery, states,
// titles, streams starting and stopping (with the grace for a reconnection),
// listener thresholds and the peak of the day, Icecast silent, persistence
// across restarts, errors, the scene action, the widget, quiet logs, and the
// reading timer of the container.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS, NONE } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { FakeIcecast, createClock, createDevices, createWorld, idsOf } from './helpers/world.js';

const MINUTE = 60_000;
const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const state = (world, key, mount) => world.fake.lastState(idsOf(world, mount).feature(key));
const text = (world, key, mount) => {
  const id = idsOf(world, mount).feature(key);
  return world.fake.states.filter((entry) => entry.device_feature_external_id === id).at(-1)?.text;
};
const contentOf = (ack) => ack.data.content ?? ack.data;

async function captureLogs(t, level, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines;
}

/** A world whose mount devices are added. */
async function addedWorld(t, options = {}) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  await createDevices(world);
  return world;
}

test('one device per mount point, named after the stream, nothing polled by Gladys', async (t) => {
  const icecast = new FakeIcecast();
  icecast.start('/lounge.ogg', { ogg: true });
  const world = await createWorld({ icecast });
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => [device.name, device.external_id]),
    [
      ['/lounge.ogg', idsOf(world, '/lounge.ogg').device],
      ['Radio Gladys (/radio.mp3)', idsOf(world).device],
    ],
  );
  assert.match(idsOf(world).device, /:mount:radio\.mp3$/);
  assert.equal(devices[1].should_poll, false);
  assert.equal(devices[1].poll_frequency, undefined);
  assert.deepEqual(
    devices[1].features.map((feature) => feature.external_id.split(':').at(-1)),
    Object.values(FEATURE_KEYS),
  );
  assert.deepEqual(devices[1].params, [{ name: 'MOUNT', value: '/radio.mp3' }]);
  assert.equal(world.fake.states.length, 0, 'nothing published for a device not added');
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.deepEqual(world.fake.sceneEvents, [], 'first read: no event');
});

test('the states of the added device at once, then only the changes', async (t) => {
  const world = await addedWorld(t);
  assert.equal(state(world, FEATURE_KEYS.ONLINE), 1);
  assert.equal(state(world, FEATURE_KEYS.LISTENERS), 0);
  assert.equal(text(world, FEATURE_KEYS.NOW_PLAYING), 'Artist 1 – Title 1');
  assert.equal(state(world, FEATURE_KEYS.UPTIME), 0);
  assert.equal(state(world, FEATURE_KEYS.BITRATE), undefined, 'the MP3 source tells no bitrate');
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: idsOf(world).device,
    transport: 'local',
  });
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));
  const before = world.fake.states.length;
  await world.hub.pollNow();
  assert.equal(world.fake.states.length, before, 'nothing changed, nothing sent');
  world.clock.advance(5 * MINUTE);
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.UPTIME), 5);
});

test('an Ogg stream: artist and title apart, the bitrate', async (t) => {
  const icecast = new FakeIcecast();
  icecast.start('/lounge.ogg', {
    name: 'Lounge',
    ogg: true,
    artist: 'Miles Davis',
    title: 'So What',
  });
  const world = await addedWorld(t, { icecast });
  assert.equal(text(world, FEATURE_KEYS.NOW_PLAYING, '/lounge.ogg'), 'Miles Davis – So What');
  assert.equal(state(world, FEATURE_KEYS.BITRATE, '/lounge.ogg'), 96);
});

test('a new title: the state and "A new song plays", once per change', async (t) => {
  const world = await addedWorld(t);
  world.icecast.source().title = 'Daft Punk - Get Lucky (feat. "Pharrell")';
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.equal(text(world, FEATURE_KEYS.NOW_PLAYING), 'Daft Punk – Get Lucky (feat. "Pharrell")');
  assert.deepEqual(
    events(world, TRIGGERS.TRACK).map((event) => event.data),
    [
      {
        mount: idsOf(world).device,
        mount_name: 'Radio Gladys (/radio.mp3)',
        text: 'Daft Punk – Get Lucky (feat. "Pharrell")',
        artist: 'Daft Punk',
        title: 'Get Lucky (feat. "Pharrell")',
      },
    ],
  );
  // A title without artist.
  world.icecast.source().title = 'Jingle';
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.TRACK).at(-1).data.artist, '');
  assert.equal(text(world, FEATURE_KEYS.NOW_PLAYING), 'Jingle');
});

test('a stream stops after a minute missing, with its length, and starts again', async (t) => {
  const world = await addedWorld(t);
  world.clock.advance(30 * MINUTE);
  world.icecast.stop();
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.ONLINE), 1, 'a hiccup is not a stop');
  // Back within the grace: the same stream goes on.
  world.clock.advance(30_000);
  world.icecast.start('/radio.mp3', { name: 'Radio Gladys', title: 'Artist 1 - Title 1' });
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.STOPPED).length, 0);
  assert.equal(events(world, TRIGGERS.STARTED).length, 0);
  assert.equal(events(world, TRIGGERS.TRACK).length, 0);

  world.clock.advance(10 * MINUTE);
  world.icecast.stop();
  await world.hub.pollNow();
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.ONLINE), 0);
  assert.equal(state(world, FEATURE_KEYS.LISTENERS), 0);
  assert.equal(state(world, FEATURE_KEYS.UPTIME), 0);
  assert.equal(text(world, FEATURE_KEYS.NOW_PLAYING), NONE);
  assert.deepEqual(
    events(world, TRIGGERS.STOPPED).map((event) => event.data),
    [{ mount: idsOf(world).device, mount_name: 'Radio Gladys (/radio.mp3)', duration_minutes: 41 }],
  );
  assert.equal(world.fake.discoveredDevices.length, 1, 'a stopped stream stays a device');
  assert.equal(world.fake.transports.at(-1).transport, 'local', 'Icecast still answers');

  world.icecast.start('/radio.mp3', { name: 'Radio Gladys', title: 'Artist 2 - Title 2' });
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.ONLINE), 1);
  assert.deepEqual(
    events(world, TRIGGERS.STARTED).map((event) => event.data),
    [
      {
        mount: idsOf(world).device,
        mount_name: 'Radio Gladys (/radio.mp3)',
        text: 'Artist 2 – Title 2',
      },
    ],
  );
  assert.equal(events(world, TRIGGERS.TRACK).length, 1);
});

test('a new mount point on a server already watched: "A stream starts"', async (t) => {
  const world = await addedWorld(t);
  world.icecast.start('/live', { name: 'Live', listeners: 6 });
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.STARTED).map((event) => event.data),
    [{ mount: idsOf(world, '/live').device, mount_name: 'Live (/live)', text: '' }],
  );
  assert.deepEqual(
    events(world, TRIGGERS.LISTENERS).map((event) => event.data.threshold),
    [1, 5],
  );
  assert.equal(world.fake.discoveredDevices.length, 2);
});

test('listener thresholds: once a day each, the peak of the day, reset at midnight', async (t) => {
  const world = await addedWorld(t);
  world.icecast.setListeners(12);
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.LISTENERS).map((event) => [event.data.threshold, event.data.listeners]),
    [
      [1, 12],
      [5, 12],
      [10, 12],
    ],
  );
  assert.equal(events(world, TRIGGERS.LISTENERS)[0].data.mount_name, 'Radio Gladys (/radio.mp3)');
  world.icecast.setListeners(3);
  await world.hub.pollNow();
  world.icecast.setListeners(11);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.LISTENERS).length, 3, 'once a day');
  assert.equal(state(world, FEATURE_KEYS.LISTENERS), 11);
  assert.equal(state(world, FEATURE_KEYS.LISTENERS_PEAK), 12);

  // The next day (18:00 + 7 h): the peak starts again; already reached, no event.
  world.clock.advance(7 * 60 * MINUTE);
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.LISTENERS_PEAK), 11);
  assert.equal(events(world, TRIGGERS.LISTENERS).length, 3);
  world.icecast.setListeners(30);
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.LISTENERS)
      .slice(3)
      .map((event) => event.data.threshold),
    [25],
  );
});

test('Icecast silent: unreachable badge, streams stopped after the grace, back again', async (t) => {
  const world = await addedWorld(t);
  world.icecast.failure = 'down';
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(world.fake.connectionStatus.message.en, 'Icecast does not answer');
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.ONLINE), 0);
  assert.equal(events(world, TRIGGERS.STOPPED).length, 1);
  assert.equal(world.fake.discoveredDevices.length, 1, 'the Discovery list is kept');
  world.icecast.failure = null;
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.transports.at(-1).transport, 'local');
  assert.equal(state(world, FEATURE_KEYS.ONLINE), 1);
  assert.equal(events(world, TRIGGERS.STARTED).length, 1);
});

test('a server without source: connected, no device; errors in words', async (t) => {
  const icecast = new FakeIcecast();
  icecast.stop();
  const world = await createWorld({ icecast });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.deepEqual(world.fake.discoveredDevices, []);
  const widget = contentOf(
    await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' }),
  );
  assert.match(widget.components[0].text, /No stream seen/);

  icecast.failure = 404;
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.message.en, 'no Icecast 2.4 status at this address');
  icecast.failure = '<html>not json</html>';
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.message.en, 'no Icecast 2.4 status at this address');
  icecast.failure = 401;
  await world.hub.pollNow();
  assert.match(world.fake.connectionStatus.message.en, /asks for a password/);
  icecast.failure = 301;
  await world.hub.pollNow();
  assert.match(world.fake.connectionStatus.message.en, /redirects/);
});

test('a failed reading at midnight announces no threshold again', async (t) => {
  const world = await addedWorld(t);
  world.icecast.setListeners(30);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.LISTENERS).length, 4);
  world.icecast.failure = 'down';
  world.clock.advance(6 * 60 * MINUTE + 30_000); // past midnight
  await world.hub.pollNow();
  world.icecast.failure = null;
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.LISTENERS).length, 4);
  assert.equal(state(world, FEATURE_KEYS.LISTENERS_PEAK), 30);
});

test('a restart of the integration fires nothing twice, and misses nothing', async (t) => {
  const clock = createClock();
  const icecast = new FakeIcecast({ now: clock.now });
  const first = await addedWorld(t, { clock, icecast });
  icecast.setListeners(6);
  await first.hub.pollNow();
  await first.app.stop();

  // Back 10 minutes later: same stream, a new title since.
  clock.advance(10 * MINUTE);
  icecast.source().title = 'Artist 7 - Title 7';
  const second = await createWorld({ clock, icecast, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.equal(events(second, TRIGGERS.STARTED).length, 0);
  assert.equal(events(second, TRIGGERS.LISTENERS).length, 0);
  assert.equal(events(second, TRIGGERS.TRACK).length, 1, 'the title changed meanwhile');
  icecast.stop();
  await second.hub.pollNow();
  clock.advance(MINUTE);
  await second.hub.pollNow();
  assert.equal(events(second, TRIGGERS.STOPPED)[0].data.duration_minutes, 10);
});

test('another server: what was saved about the previous one is dropped', async (t) => {
  const world = await addedWorld(t);
  await world.fake.configUpdated({ url: 'http://192.0.2.20:8000', language: 'en' });
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(world.hub.saved.url, 'http://192.0.2.20:8000');
});

test('a mount point gone for a month is forgotten, unless it is a device', async (t) => {
  const icecast = new FakeIcecast();
  icecast.start('/old', {});
  const world = await createWorld({ icecast });
  t.after(() => world.app.stop());
  await world.fake.deviceCreated(world.fake.discoveredDevices.find((d) => d.name === '/old'));
  icecast.stop('/old');
  icecast.stop('/radio.mp3');
  await world.hub.pollNow();
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  world.clock.advance(31 * 24 * 60 * MINUTE);
  await world.hub.pollNow();
  assert.deepEqual(Object.keys(world.hub.saved.mounts), ['/old']);
  assert.deepEqual(
    world.fake.discoveredDevices.map((device) => device.name),
    ['/old'],
  );
});

test('no address, a wrong address', async (t) => {
  const empty = await createWorld({ config: {} });
  t.after(() => empty.app.stop());
  assert.equal(empty.fake.connectionStatus.connected, false);
  assert.match(empty.fake.connectionStatus.message.fr, /Saisissez l'adresse/);
  const wrong = await createWorld({ config: { url: 'ftp://x' } });
  t.after(() => wrong.app.stop());
  assert.match(wrong.fake.connectionStatus.message.en, /Address not understood/);
});

test('"Test the connection": the server, the mount points on air', async (t) => {
  const world = await addedWorld(t);
  world.icecast.setListeners(2);
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  const message = ack.data?.message ?? ack.data;
  assert.equal(
    message.en,
    'Connected · Icecast 2.4.4 · 1 mount point(s) on air · Radio Gladys (/radio.mp3): On air, Artist 1 – Title 1, 2 listener(s)',
  );
  assert.match(message.fr, /Radio Gladys \(\/radio\.mp3\) : À l'antenne/);
  world.icecast.failure = 'down';
  const down = await world.fake.action('test_connection', {});
  assert.equal((down.data?.message ?? down.data).en, 'Icecast does not answer');
});

test('scene action "Now playing": the outputs and a sentence', async (t) => {
  const world = await addedWorld(t);
  world.icecast.setListeners(3);
  world.clock.advance(10 * MINUTE);
  const ack = await world.fake.sceneAction('get_now_playing', { mount: idsOf(world).device });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    online: true,
    text: 'Artist 1 – Title 1',
    artist: 'Artist 1',
    title: 'Title 1',
    listeners: 3,
    peak: 3,
    bitrate: 0,
    duration_minutes: 10,
    sentence: 'Radio Gladys (/radio.mp3): On air, Artist 1 – Title 1, 3 listener(s)',
  });
  const unknown = await world.fake.sceneAction('get_now_playing', { mount: 'other:mount:9' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /Mount point unknown/);

  // Stopped: still answered, off air.
  world.icecast.stop();
  await world.hub.pollNow();
  world.clock.advance(MINUTE);
  const off = await world.fake.sceneAction('get_now_playing', { mount: idsOf(world).device });
  assert.equal(off.success, true, off.error);
  assert.equal(off.data.outputs.online, false);
  assert.equal(off.data.outputs.text, '');
  assert.equal(off.data.outputs.sentence, 'Radio Gladys (/radio.mp3): Off air');
});

test('the widget, every mount point: total listeners, rows, in the budget', async (t) => {
  const icecast = new FakeIcecast();
  icecast.start('/lounge.ogg', {
    name: 'Lounge',
    ogg: true,
    artist: 'Miles Davis',
    title: 'So What',
    listeners: 2,
  });
  icecast.start('/live', {});
  const world = await addedWorld(t, { icecast });
  icecast.setListeners(4);
  icecast.stop('/live');
  await world.hub.pollNow();
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'de' });
  assert.equal(ack.success, true, ack.error);
  const content = contentOf(ack);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    content.components.map((component) => component.type),
    ['text', 'text', 'value', 'value', 'status'],
  );
  assert.equal(content.components[0].text, 'So What');
  assert.equal(content.components[1].text, 'Miles Davis · Lounge (/lounge.ogg)');
  assert.equal(content.components[2].value, 6);
  assert.equal(content.components[3].value, 2);
  assert.deepEqual(
    content.components[4].items.map((item) => [item.label, item.value]),
    [
      ['Lounge (/lounge.ogg)', '2 Zuhörer'],
      ['Radio Gladys (/radio.mp3)', '4 Zuhörer'],
      ['/live', 'Nicht auf Sendung'],
    ],
  );
});

test('the widget, one mount point: bitrate, time on air, Listen over https', async (t) => {
  const icecast = new FakeIcecast();
  icecast.start('/lounge.ogg', {
    name: 'Lounge',
    ogg: true,
    artist: 'Miles Davis',
    title: 'So What',
  });
  const world = await addedWorld(t, {
    icecast,
    config: { url: 'https://radio.example.org', language: 'fr' },
  });
  world.clock.advance(65 * MINUTE);
  await world.hub.pollNow();
  const ack = await world.fake.widgetGet(WIDGET_KEY, {
    settings: { mount: idsOf(world, '/lounge.ogg').device },
    language: 'fr',
  });
  const content = contentOf(ack);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    content.components.map((component) => component.type),
    ['text', 'text', 'value', 'value', 'status', 'button'],
  );
  assert.deepEqual(
    content.components[4].items.map((item) => [item.label, item.value]),
    [
      ['Lounge (/lounge.ogg)', "À l'antenne"],
      ['Débit', '96 kb/s'],
      ["À l'antenne depuis", '1 h 05'],
    ],
  );
  assert.deepEqual(content.components[5].link, { url: 'https://radio.example.org/lounge.ogg' });
  assert.equal(world.fake.transports.at(-1).transport, 'cloud');

  const unknown = contentOf(
    await world.fake.widgetGet(WIDGET_KEY, { settings: { mount: 'nope' }, language: 'en' }),
  );
  assert.match(unknown.components[0].text, /Mount point unknown/);

  icecast.failure = 'down';
  await world.hub.pollNow();
  const down = contentOf(
    await world.fake.widgetGet(WIDGET_KEY, {
      settings: { mount: idsOf(world, '/lounge.ogg').device },
      language: 'en',
    }),
  );
  assert.deepEqual(validateWidgetContent(down), []);
  assert.ok(down.components.some((c) => c.text === 'Icecast does not answer'));
});

test('quiet logs: a normal cycle writes nothing at info level', async (t) => {
  const world = await addedWorld(t);
  const lines = await captureLogs(t, 'info', async () => {
    world.icecast.source().title = 'Artist 3 - Title 3';
    world.icecast.setListeners(2);
    await world.hub.pollNow();
    world.clock.advance(MINUTE);
    await world.hub.pollNow();
  });
  assert.deepEqual(lines, []);
});

test('the timer of the container reads Icecast, Gladys never has to poll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await addedWorld(t, { timers: true });
  const reads = () =>
    world.icecast.requests.filter((request) => request.path === '/status-json.xsl').length;
  const before = reads();
  world.icecast.source().title = 'Artist 9 - Title 9';
  t.mock.timers.tick(15_000);
  // Let the read and its publication settle.
  for (let i = 0; i < 20; i += 1) {
    await new Promise(setImmediate);
  }
  assert.equal(reads(), before + 1);
  assert.equal(text(world, FEATURE_KEYS.NOW_PLAYING), 'Artist 9 – Title 9');
});

test('Gladys restarts: everything is sent again', async (t) => {
  const world = await addedWorld(t);
  const before = world.fake.states.length;
  await world.hub.resync(world.hub.config);
  assert.ok(world.fake.states.length > before);
});

test('a first reading that fails announces nothing once Icecast answers', async (t) => {
  const icecast = new FakeIcecast();
  icecast.setListeners(12);
  icecast.failure = 'down';
  const world = await createWorld({ icecast });
  t.after(() => world.app.stop());
  icecast.failure = null;
  await world.hub.pollNow();
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(world.fake.discoveredDevices.length, 1);
});

test('a stream off air at midnight starts the day from zero', async (t) => {
  const world = await addedWorld(t);
  world.icecast.setListeners(30);
  await world.hub.pollNow();
  world.icecast.stop();
  await world.hub.pollNow();
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  // The next morning (18:00 + 15 h): no peak of yesterday, then back with 12.
  world.clock.advance(15 * 60 * MINUTE);
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.LISTENERS_PEAK), 0);
  const before = events(world, TRIGGERS.LISTENERS).length;
  world.icecast.start('/radio.mp3', { name: 'Radio Gladys', listeners: 12 });
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.LISTENERS)
      .slice(before)
      .map((event) => event.data.threshold),
    [1, 5, 10],
  );
  assert.equal(state(world, FEATURE_KEYS.LISTENERS_PEAK), 12);
});

test('a stream restarted while the integration was stopped: stopped, then started', async (t) => {
  const clock = createClock();
  const icecast = new FakeIcecast({ now: clock.now });
  const first = await addedWorld(t, { clock, icecast });
  await first.app.stop();
  clock.advance(2 * 60 * MINUTE);
  icecast.start('/radio.mp3', { name: 'Radio Gladys', title: 'Artist 1 - Title 1' });
  clock.advance(MINUTE);
  const second = await createWorld({ clock, icecast, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => event.key),
    [TRIGGERS.STOPPED, TRIGGERS.STARTED],
  );
  assert.equal(events(second, TRIGGERS.STOPPED)[0].data.duration_minutes, 120);
  assert.equal(second.hub.mountView('/radio.mp3').uptimeMinutes, 1);
});

test('a new mount point with a title: started, then the song', async (t) => {
  const world = await addedWorld(t);
  world.icecast.start('/jazz', { title: 'Artist 5 - Title 5' });
  await world.hub.pollNow();
  assert.deepEqual(
    world.fake.sceneEvents.map((event) => event.key),
    [TRIGGERS.STARTED, TRIGGERS.TRACK],
  );
});

test('two mount points never share an external id', async (t) => {
  const icecast = new FakeIcecast();
  icecast.start('/live/a b', {});
  icecast.start('/live_a_b', {});
  const world = await createWorld({ icecast });
  t.after(() => world.app.stop());
  const ids = world.fake.discoveredDevices.map((device) => device.external_id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.some((id) => id.endsWith(':mount:live_2fa_20b')));
  assert.equal(world.hub.mountFor(idsOf(world, '/live_a_b').device), '/live_a_b');
});
