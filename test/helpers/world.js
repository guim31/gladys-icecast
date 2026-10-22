// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Icecast, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read Icecast with
// `world.hub.pollNow()`. (Adapted from guim31/gladys-azuracast.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { mountIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { BASE, FakeIcecast } from './fakeIcecast.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock, shared by the hub, the fake Icecast and the tests. */
export function createClock(start = new Date(2026, 9, 22, 18, 0, 0).getTime()) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  clock = createClock(),
  icecast,
  config = { url: BASE, language: 'en' },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-icecast-')),
  timings = {},
  timers = false,
} = {}) {
  const server = icecast ?? new FakeIcecast({ now: clock.now });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: server.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, icecast: server, app, hub: app.hub, clock, dataDir };
}

/** The external ids of a mount device (/radio.mp3 by default). */
export const idsOf = (world, mount = '/radio.mp3') => mountIds(world.gladys, mount);

/** Add the discovered devices in Gladys, as the user would. */
export async function createDevices(world) {
  for (const device of world.fake.discoveredDevices) {
    if (!world.gladys.devices.some((d) => d.external_id === device.external_id)) {
      await world.fake.deviceCreated(device);
    }
  }
}

export { BASE, FakeIcecast };
