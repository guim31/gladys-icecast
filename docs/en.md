# Icecast

[Icecast](https://icecast.org) is the free streaming server behind many web
radios: sources (an encoder, BUTT, Mixxx, Liquidsoap, ffmpeg…) send audio to
its mount points, and listeners play them. This integration brings your mount
points into Gladys: whether a stream is on air, the number of listeners, the
current title, the bitrate, and scenes that react to a stream that starts or
stops, a new title or an audience threshold.

Icecast can run at home or on a rented server: the integration works with both
(the device badge says "local" or "cloud" from the address). Using AzuraCast?
It has [its own integration](https://github.com/guim31/gladys-azuracast), which
knows its stations, live shows and AutoDJ.

Tested against a real Icecast 2.4.4 in Docker, with two sources streamed by
ffmpeg (MP3 and Ogg Vorbis), titles changed through the admin interface,
listeners simulated with curl, and sources stopped and started again. Feedback
welcome on [the issues](https://github.com/guim31/gladys-icecast/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- An Icecast server 2.4 or later reachable from Gladys (port 8000 by default).
- Its status page open (`/status-json.xsl`, public by default). No password is
  needed.

## Getting started

### 1. Find the address of Icecast

It is the address of its web page, with the port, for example
`http://192.168.1.2:8000` or `https://radio.example.org`. A URL copied from the
browser works too (the status page `…/status.xsl`, a stream `…/radio.mp3`): the
integration keeps the start of it.

### 2. Configure the integration

In Gladys, open the integration and fill in:

- **Icecast address**.
- **Refresh interval**: 15 seconds by default. One light request for all the
  mount points each time.
- **Language of the names**: the language of the feature names and of the
  scene results.

Then use **Test the connection**: it reads Icecast and lists what each mount
point on air plays.

### 3. Add the devices

Open the **Discover** tab: each mount point on air is a device, named after the
stream and its mount (`My Radio (/radio.mp3)`). Add the ones you want. Icecast
only lists a mount point while a source streams to it: start your stream first.
The integration then remembers it, so a stopped stream stays a device, off air.

## The devices

| Feature              | What it says                                             |
| -------------------- | -------------------------------------------------------- |
| On air               | Yes while a source streams to the mount point            |
| Listeners            | People listening right now                               |
| Peak listeners today | The most listeners since midnight                        |
| Now playing          | "Artist – Title" sent by the source ("—" off air)        |
| Bitrate              | In kb/s, when the source tells it (Ogg and Opus streams) |
| On air for           | Minutes since the stream started                         |

A stream stops after one minute without its mount point (or without answer from
Icecast): a short cut of the source changes nothing. MP3 sources send one
"Artist - Title" text: the integration splits it on the first " - ".

## Dashboard

The **Icecast streams** widget shows, without setting, every mount point: the
total of listeners, how many streams are on air, one row per mount point with
its listeners, and the title of the first stream that has one. Choose a mount
point in the settings of the widget to see it in detail: its title and artist,
its listeners and the peak of the day, its bitrate and how long it has been on
air. The **Listen** button opens the stream when the address of Icecast is
https://.

## Scenes

### Triggers

Each trigger can be limited to one mount point (empty: any mount point), and
gives the name of the stream.

- **A stream starts**: a source connects and goes on air, with the current
  title. Also fires for a new mount point on a server already watched.
- **A stream stops**: the mount point has been off air for a minute (or Icecast
  silent), with the duration of the stream in minutes.
- **A new song plays**: the source sends another title (also when a stream starts with a title), with the song, the artist and the title.
- **Listeners reach a threshold**: choose 1, 5, 10, 25, 50, 100, 250, 500 or
  1000; fires when the listeners of the mount point reach it, at most once a day (a threshold already passed at midnight by a stream on air is not announced again). 1
  means "someone is listening".

The integration keeps what it saw: a restart of Gladys does not announce a
stream or a threshold twice, and a title that started meanwhile is announced
once.

### Actions

- **Now playing**: reads a mount point for the next actions: on air or not,
  song, artist, title, listeners, peak of the day, bitrate, minutes on air, and
  a ready-made sentence ("My Radio (/radio.mp3): On air, Artist – Title, 12
  listener(s)").

### Scene ideas

- **On air light**: "A stream starts" on the `/live` mount point turns the lamp
  of the studio red; "A stream stops" turns it off and sends you the duration.
- **Song on the TV**: "A new song plays" shows the song on the screen of the
  living room, or says it with the speaker.
- **Audience**: "Listeners reach a threshold" (10) sends you a notification;
  a morning scene says the sentence of "Now playing".

## Troubleshooting

- **Icecast does not answer**: check the address and the port from the machine
  running Gladys.
- **No Icecast 2.4 status at this address**: the address points to another
  service, or to an Icecast older than 2.4 (no `/status-json.xsl`).
- **The status page asks for a password**: a reverse proxy protects it; open
  `/status-json.xsl` to the network of Gladys.
- **The address redirects**: enter the https:// address.
- **No device in Discover**: no source streams right now; start one, then
  click **Search** again.

## Limits

- One Icecast server per integration; hidden mount points (`<hidden>1</hidden>`)
  are not on the public status page.
- Icecast is read at the interval chosen (15 seconds by default), not in real
  time: a title shorter than the interval may be missed.
- The title is the one the source sends: some encoders send none, or a file
  name.
- The peak of the day is measured by the integration at each reading.
- Read only: the integration neither starts, stops nor moves sources.
- Not affiliated with the Icecast project or Xiph.Org.
