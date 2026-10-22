// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene outputs
// and errors. Four languages, the four of the Gladys interface; German says
// "du", Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './icecast/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Icecast server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Icecast dans la configuration.",
    de: 'Gib die Adresse deines Icecast-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Icecast en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:8000',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:8000',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:8000',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:8000',
  },
};

// One short explanation per error kind (src/icecast/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Icecast does not answer',
    fr: 'Icecast ne répond pas',
    de: 'Icecast antwortet nicht',
    es: 'Icecast no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'the status page asks for a password: open it to the network of Gladys',
    fr: 'la page de statut demande un mot de passe : ouvrez-la au réseau de Gladys',
    de: 'die Statusseite verlangt ein Passwort: Öffne sie für das Netzwerk von Gladys',
    es: 'la página de estado pide una contraseña: ábrala a la red de Gladys',
  },
  [ERROR_KINDS.NOT_ICECAST]: {
    en: 'no Icecast 2.4 status at this address',
    fr: 'aucun statut Icecast 2.4 à cette adresse',
    de: 'kein Icecast-2.4-Status unter dieser Adresse',
    es: 'no hay ningún estado de Icecast 2.4 en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The state of a mount point, in words (widget, scene outputs).
export const STATE_TEXT = {
  online: { en: 'On air', fr: "À l'antenne", de: 'Auf Sendung', es: 'En antena' },
  offline: { en: 'Off air', fr: 'Hors antenne', de: 'Nicht auf Sendung', es: 'Fuera de antena' },
};

// The "Test the connection" report and the `sentence` output of "Now playing".
export const REPORT_TEXT = {
  en: {
    ok: 'Connected',
    mounts: (count) => `${count} mount point(s) on air`,
    listeners: (count) => `${count} listener(s)`,
  },
  fr: {
    ok: 'Connecté',
    mounts: (count) => `${count} point(s) de montage à l'antenne`,
    listeners: (count) => `${count} auditeur(s)`,
  },
  de: {
    ok: 'Verbunden',
    mounts: (count) => `${count} Mountpoint(s) auf Sendung`,
    listeners: (count) => `${count} Zuhörer`,
  },
  es: {
    ok: 'Conectado',
    mounts: (count) => `${count} punto(s) de montaje en antena`,
    listeners: (count) => `${count} oyente(s)`,
  },
};

// Errors of the scene actions.
export const ACTION_TEXT = {
  unknownMount: {
    en: 'Mount point unknown to Icecast: choose it again in the scene.',
    fr: "Point de montage inconnu d'Icecast : choisissez-le de nouveau dans la scène.",
    de: 'Mountpoint ist Icecast unbekannt: Wähle ihn in der Szene erneut aus.',
    es: 'Punto de montaje desconocido para Icecast: elíjalo de nuevo en la escena.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
