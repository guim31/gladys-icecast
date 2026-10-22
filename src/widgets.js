// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `mounts`.
//
// The use case: a glance at the wall tablet tells which streams are on air,
// what they play and how many people listen. Without setting, every mount
// point of the server: the total of listeners, how many streams are on air,
// one row per mount point, and the song of the first stream that has one.
// With a mount point chosen (the `mount` setting): its song, its listeners
// and peak of the day, its bitrate, how long it has been on air, and a
// Listen button when the address is https (the only links the core accepts).
//
// The figures are sent as values, not bound to device features: the widget
// works before the devices are added.
//
// Budget (8 components, 2 texts, 1 status, 4 buttons): the title (heading),
// the artist or the error (caption), two tiles, the status list, a button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { songText } from './icecast/client.js';
import { CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, STATE_TEXT, pick } from './texts.js';

export const TEXT = {
  pick: {
    en: 'Enter the address of your Icecast server in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Icecast dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Icecast-Servers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Icecast en la configuración de la integración.',
  },
  noMount: {
    en: 'No stream seen on this Icecast server yet.',
    fr: "Aucun flux vu sur ce serveur Icecast pour l'instant.",
    de: 'Noch kein Stream auf diesem Icecast-Server gesehen.',
    es: 'Todavía no se ha visto ningún flujo en este servidor Icecast.',
  },
  unknownMount: {
    en: 'Mount point unknown: choose it again in the settings of the widget.',
    fr: 'Point de montage inconnu : choisissez-le de nouveau dans les réglages du widget.',
    de: 'Unbekannter Mountpoint: Wähle ihn in den Einstellungen des Widgets erneut aus.',
    es: 'Punto de montaje desconocido: elíjalo de nuevo en los ajustes del widget.',
  },
  listeners: { en: 'Listeners', fr: 'Auditeurs', de: 'Zuhörer', es: 'Oyentes' },
  peak: { en: 'Peak today', fr: 'Pic du jour', de: 'Spitze heute', es: 'Pico de hoy' },
  onAir: { en: 'On air', fr: "À l'antenne", de: 'Auf Sendung', es: 'En antena' },
  bitrate: { en: 'Bitrate', fr: 'Débit', de: 'Bitrate', es: 'Tasa de bits' },
  since: {
    en: 'On air for',
    fr: "À l'antenne depuis",
    de: 'Auf Sendung seit',
    es: 'En antena desde hace',
  },
  listen: { en: 'Listen', fr: 'Écouter', de: 'Anhören', es: 'Escuchar' },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** "1 h 05" or "12 min". */
export const formatMinutes = (minutes) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
    : `${minutes} min`;

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

/** The heading (title) and caption (artist, or the error) of a song. */
function songTexts(hub, song, extra, language) {
  const components = [];
  if (song) {
    components.push({
      type: 'text',
      variant: 'heading',
      text: fit(song.title || songText(song), 40),
    });
  }
  const caption = hub.error
    ? pick(ERROR_TEXT[hub.error.kind], language)
    : [song?.title ? song.artist : '', extra].filter(Boolean).join(' · ');
  if (caption) {
    components.push({ type: 'text', variant: 'caption', text: fit(caption, 80) });
  }
  return components;
}

function stateRow(view, language) {
  return {
    label: fit(view.name, 40),
    value: pick(view.online ? STATE_TEXT.online : STATE_TEXT.offline, language),
    icon: view.online ? 'radio' : 'wifi-off',
    color: view.online ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  };
}

/** One mount point, in detail. */
function oneMount(hub, view, language) {
  const components = songTexts(hub, view.online ? view.song : null, '', language);
  components.push(
    {
      type: 'value',
      value: view.listeners,
      label: pick(TEXT.listeners, language),
      icon: 'headphones',
      color: WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      value: view.peak,
      label: pick(TEXT.peak, language),
      icon: 'trending-up',
      color: WIDGET_COLORS.NEUTRAL,
    },
  );
  const rows = [stateRow(view, language)];
  if (view.online && view.bitrate !== null) {
    rows.push({
      label: pick(TEXT.bitrate, language),
      value: `${view.bitrate} kb/s`,
      icon: 'activity',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (view.online) {
    rows.push({
      label: pick(TEXT.since, language),
      value: formatMinutes(view.uptimeMinutes),
      icon: 'clock',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push({ type: 'status', items: rows });
  const url = `${hub.config.url}${encodeURI(view.mount)}`;
  if (view.online && url.startsWith('https://')) {
    components.push({
      type: 'button',
      label: pick(TEXT.listen, language),
      icon: 'play',
      style: 'secondary',
      link: { url },
    });
  }
  return components;
}

/** Every mount point of the server. */
function allMounts(hub, views, language) {
  const online = views.filter((view) => view.online);
  const focus = online.find((view) => view.song);
  const components = songTexts(hub, focus?.song ?? null, focus?.name ?? '', language);
  components.push(
    {
      type: 'value',
      value: online.reduce((sum, view) => sum + view.listeners, 0),
      label: pick(TEXT.listeners, language),
      icon: 'headphones',
      color: WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      value: online.length,
      label: pick(TEXT.onAir, language),
      icon: 'radio',
      color: WIDGET_COLORS.NEUTRAL,
    },
  );
  // On air first, then by path; the core shows ten rows at most.
  const rows = [...online, ...views.filter((view) => !view.online)].slice(0, 10).map((view) => ({
    ...stateRow(view, language),
    value: view.online
      ? (REPORT_TEXT[language] ?? REPORT_TEXT.en).listeners(view.listeners)
      : pick(STATE_TEXT.offline, language),
  }));
  components.push({ type: 'status', items: rows });
  return components;
}

async function get(hub, { settings = {}, language = 'en' } = {}) {
  if (!hub.client) {
    return message(hub.config.url === null ? CONNECTION_TEXT.invalidUrl : TEXT.pick, language);
  }
  let components;
  if (settings.mount) {
    const mount = hub.mountFor(settings.mount);
    if (mount === null) {
      return message(hub.error ? ERROR_TEXT[hub.error.kind] : TEXT.unknownMount, language);
    }
    components = oneMount(hub, hub.mountView(mount), language);
  } else {
    const views = hub.views();
    if (views.length === 0) {
      return message(hub.error ? ERROR_TEXT[hub.error.kind] : TEXT.noMount, language);
    }
    components = allMounts(hub, views, language);
  }
  // A song lasts a few minutes: refresh soon (the hub also nudges on change).
  return { ttl_seconds: 30, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get },
};
