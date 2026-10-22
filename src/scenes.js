// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Is the stream on air?" is already a scene condition on the device feature.
// The action is about what a condition cannot do: put what plays in a
// message or a spoken sentence ("Radio (/radio.mp3): On air, Artist – Title,
// 3 listener(s)"), with the figures for the next conditions. It takes the
// mount device chosen in the scene.
// -----------------------------------------------------------------------------

import { songText } from './icecast/client.js';

export const SCENE_ACTIONS = {
  async get_now_playing(hub, { fields = {} }) {
    const view = await hub.commandMount(fields.mount);
    return {
      online: view.online,
      text: view.online ? songText(view.song) : '',
      artist: (view.online && view.song?.artist) || '',
      title: (view.online && view.song?.title) || '',
      listeners: view.listeners,
      peak: view.peak,
      bitrate: view.bitrate ?? 0,
      duration_minutes: view.uptimeMinutes,
      sentence: hub.sentence(view, hub.config.language),
    };
  },
};
