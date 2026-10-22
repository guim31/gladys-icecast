# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Each mount point of an Icecast server (2.4 or later) as a Gladys device: on
  air, listeners, peak listeners of the day, the current title ("Artist –
  Title"), the bitrate, the minutes on air. A stopped stream stays a device,
  off air.
- Scene triggers: a stream starts, a stream stops (with its duration), a new
  song plays (artist, title), the listeners reach a threshold (1 to 1000, once
  a day); each one can be limited to a mount point.
- Scene action: what a mount point plays, with its listeners and a ready-made
  sentence.
- Dashboard widget: every mount point with its listeners and the total, or one
  mount point in detail (title, peak of the day, bitrate, time on air, a
  Listen button for an https:// server).
- A "Test the connection" action, texts in English, French, German and
  Spanish.

[Unreleased]: https://github.com/guim31/gladys-icecast/commits/main
