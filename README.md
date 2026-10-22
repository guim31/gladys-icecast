# Icecast for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings an [Icecast](https://icecast.org) streaming server — the free
server behind many web radios — into Gladys.

- **One device per mount point**: on air, listeners, peak listeners of the
  day, the current title ("Artist – Title"), the bitrate, the minutes on air.
  A stopped stream stays a device, off air.
- **Scene triggers**: a stream starts, a stream stops (with its duration), a
  new song plays (artist, title), the listeners reach a threshold (1 to 1000,
  once a day) — each one can be limited to a mount point.
- **Scene action**: what a mount point plays, its listeners, and a ready-made
  sentence.
- **Dashboard widget**: every mount point with its listeners and the total, or
  one mount point in detail (title, peak of the day, bitrate, time on air, a
  Listen button for an https:// server).
- Texts in English, French, German and Spanish.

Tested against a real Icecast 2.4.4 in Docker, with MP3 and Ogg sources
streamed by ffmpeg, title updates and simulated listeners. Feedback welcome on
[the issues](https://github.com/guim31/gladys-icecast/issues).

Using [AzuraCast](https://www.azuracast.com)? It has
[its own integration](https://github.com/guim31/gladys-azuracast), which knows
its stations, live shows and AutoDJ.

## Requirements

- Gladys Assistant 5.1.0 or later.
- An Icecast server 2.4 or later reachable from Gladys, at home or on the
  Internet (https://), with its public status page (`/status-json.xsl`, the
  default). No password needed.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-icecast`. Then open its configuration, enter
the address of Icecast (with its port, `http://192.168.1.2:8000`), and add the
mount points from the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

The container reads the public `GET /status-json.xsl` (every mount point in
one request, no password) at the chosen interval (15 seconds by default),
publishes the states of the devices when they change and fires the scene
events on the transitions. Icecast only lists a mount point while a source
streams to it: a stream stops after one minute missing, so a short cut of the
source fires nothing. What each mount point was is kept in `/data`: a restart
neither announces a transition twice nor misses one, and a stopped stream
stays known (forgotten after a month unless it is a device in Gladys).
Redirects are not followed.

## Limits

- One Icecast server per configuration; hidden mount points are not on the
  public status page.
- Icecast is read at an interval: a title shorter than the interval may be
  missed.
- Read only: the admin interface (moving listeners, killing sources) is not
  used.
- A self-signed HTTPS certificate is not accepted (use `http://` on the local
  network).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the Icecast
status.

## Credits

- [Icecast](https://gitlab.xiph.org/xiph/icecast-server) by the Xiph.Org
  Foundation and contributors (GPL-2.0): the answers in `test/fixtures/icecast`
  come from Icecast 2.4.4 in Docker (`libretime/icecast` image).
- The Icecast logo on the cover: Xiph.Org, CC BY 3.0
  ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Icecast_logo_large_2004.svg),
  from [wiki.xiph.org/Logos](https://wiki.xiph.org/Logos)).
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of
  [gladys-azuracast](https://github.com/guim31/gladys-azuracast).

Not affiliated with the Icecast project or the Xiph.Org Foundation.

## License

Apache-2.0, see [LICENSE](LICENSE).
