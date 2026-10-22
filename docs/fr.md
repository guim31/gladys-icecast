# Icecast

[Icecast](https://icecast.org) est le serveur de diffusion libre derrière
beaucoup de webradios : des sources (un encodeur, BUTT, Mixxx, Liquidsoap,
ffmpeg…) envoient l'audio à ses points de montage, et les auditeurs les
écoutent. Cette intégration amène vos points de montage dans Gladys : flux à
l'antenne ou non, nombre d'auditeurs, titre en cours, débit, et des scènes qui
réagissent à un flux qui démarre ou s'arrête, à un nouveau titre ou à un seuil
d'audience.

Icecast peut tourner chez vous ou sur un serveur loué : l'intégration marche
dans les deux cas (le badge de l'appareil dit « local » ou « cloud » d'après
l'adresse). Vous utilisez AzuraCast ? Il a
[sa propre intégration](https://github.com/guim31/gladys-azuracast), qui connaît
ses stations, ses directs et son AutoDJ.

Testée avec un vrai Icecast 2.4.4 en Docker, avec deux sources envoyées par
ffmpeg (MP3 et Ogg Vorbis), des titres changés par l'interface
d'administration, des auditeurs simulés avec curl, et des sources arrêtées puis
relancées. Vos retours sont les bienvenus dans
[les issues](https://github.com/guim31/gladys-icecast/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur Icecast 2.4 ou plus récent joignable depuis Gladys (port 8000 par
  défaut).
- Sa page de statut ouverte (`/status-json.xsl`, publique par défaut). Aucun
  mot de passe n'est demandé.

## Mise en route

### 1. Trouver l'adresse d'Icecast

C'est l'adresse de sa page web, avec le port, par exemple
`http://192.168.1.2:8000` ou `https://radio.example.org`. Une URL copiée depuis
le navigateur marche aussi (la page de statut `…/status.xsl`, un flux
`…/radio.mp3`) : l'intégration en garde le début.

### 2. Configurer l'intégration

Dans Gladys, ouvrez l'intégration et remplissez :

- **Adresse d'Icecast**.
- **Intervalle de rafraîchissement** : 15 secondes par défaut. Une requête
  légère pour tous les points de montage à chaque fois.
- **Langue des noms** : la langue des noms des fonctionnalités et des résultats
  de scène.

Puis utilisez **Tester la connexion** : elle lit Icecast et liste ce que joue
chaque point de montage à l'antenne.

### 3. Ajouter les appareils

Ouvrez l'onglet **Découverte** : chaque point de montage à l'antenne est un
appareil, nommé d'après le flux et son point de montage
(`Ma Radio (/radio.mp3)`). Ajoutez ceux que vous voulez. Icecast ne liste un
point de montage que pendant qu'une source y diffuse : lancez d'abord votre
flux. L'intégration s'en souvient ensuite, et un flux arrêté reste un appareil,
hors antenne.

## Les appareils

| Fonctionnalité          | Ce qu'elle dit                                                |
| ----------------------- | ------------------------------------------------------------- |
| À l'antenne             | Oui tant qu'une source diffuse sur le point de montage        |
| Auditeurs               | Personnes à l'écoute en ce moment                             |
| Pic d'auditeurs du jour | Le plus d'auditeurs depuis minuit                             |
| Titre en cours          | « Artiste – Titre » envoyé par la source (« — » hors antenne) |
| Débit                   | En kb/s, quand la source le dit (flux Ogg et Opus)            |
| Durée d'antenne         | Minutes depuis le démarrage du flux                           |

Un flux s'arrête après une minute sans son point de montage (ou sans réponse
d'Icecast) : une courte coupure de la source ne change rien. Les sources MP3
envoient un seul texte « Artiste - Titre » : l'intégration le coupe au premier
« - ».

## Tableau de bord

Le widget **Flux Icecast** montre, sans réglage, tous les points de montage :
le total des auditeurs, le nombre de flux à l'antenne, une ligne par point de
montage avec ses auditeurs, et le titre du premier flux qui en a un. Choisissez
un point de montage dans les réglages du widget pour le voir en détail : son
titre et son artiste, ses auditeurs et le pic du jour, son débit et depuis
combien de temps il est à l'antenne. Le bouton **Écouter** ouvre le flux quand
l'adresse d'Icecast est en https://.

## Scènes

### Déclencheurs

Chaque déclencheur peut se limiter à un point de montage (vide : n'importe
lequel), et donne le nom du flux.

- **Un flux démarre** : une source se connecte et prend l'antenne, avec le
  titre en cours. Se déclenche aussi pour un nouveau point de montage sur un
  serveur déjà suivi.
- **Un flux s'arrête** : le point de montage n'émet plus depuis une minute (ou
  Icecast ne répond plus), avec la durée du flux en minutes.
- **Un nouveau titre passe** : la source envoie un autre titre (aussi quand un flux démarre avec un titre), avec le titre complet, l'artiste et le titre.
- **Les auditeurs atteignent un seuil** : choisissez 1, 5, 10, 25, 50, 100,
  250, 500 ou 1000 ; se déclenche quand les auditeurs du point de montage l'atteignent, une fois par jour au plus (un seuil déjà dépassé à minuit par un flux à l'antenne n'est pas réannoncé). 1 veut dire « quelqu'un écoute ».

L'intégration garde ce qu'elle a vu : un redémarrage de Gladys n'annonce pas
deux fois un flux ou un seuil, et un titre commencé entre-temps est annoncé une
fois.

### Actions

- **Titre en cours** : lit un point de montage pour les actions suivantes : à
  l'antenne ou non, titre complet, artiste, titre, auditeurs, pic du jour,
  débit, minutes d'antenne, et une phrase toute prête (« Ma Radio
  (/radio.mp3) : À l'antenne, Artiste – Titre, 12 auditeur(s) »).

### Idées de scènes

- **Lampe « On air »** : « Un flux démarre » sur le point de montage `/live`
  passe la lampe du studio en rouge ; « Un flux s'arrête » l'éteint et vous
  envoie la durée.
- **Le titre sur la télé** : « Un nouveau titre passe » affiche le titre sur
  l'écran du salon, ou le dit sur l'enceinte.
- **Audience** : « Les auditeurs atteignent un seuil » (10) vous envoie une
  notification ; une scène du matin dit la phrase de « Titre en cours ».

## Dépannage

- **Icecast ne répond pas** : vérifiez l'adresse et le port depuis la machine
  de Gladys.
- **Aucun statut Icecast 2.4 à cette adresse** : l'adresse mène à un autre
  service, ou à un Icecast plus ancien que 2.4 (sans `/status-json.xsl`).
- **La page de statut demande un mot de passe** : un proxy inverse la protège ;
  ouvrez `/status-json.xsl` au réseau de Gladys.
- **L'adresse redirige** : saisissez l'adresse en https://.
- **Aucun appareil dans Découverte** : aucune source ne diffuse en ce moment ;
  lancez-en une, puis cliquez de nouveau sur **Rechercher**.

## Limites

- Un serveur Icecast par intégration ; les points de montage cachés
  (`<hidden>1</hidden>`) ne sont pas sur la page de statut publique.
- Icecast est lu à l'intervalle choisi (15 secondes par défaut), pas en temps
  réel : un titre plus court que l'intervalle peut passer inaperçu.
- Le titre est celui qu'envoie la source : certains encodeurs n'en envoient
  aucun, ou un nom de fichier.
- Le pic du jour est mesuré par l'intégration à chaque lecture.
- Lecture seule : l'intégration ne lance, n'arrête ni ne déplace aucune source.
- Sans lien avec le projet Icecast ni la fondation Xiph.Org.
