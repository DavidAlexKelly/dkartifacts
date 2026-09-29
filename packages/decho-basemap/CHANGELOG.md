# Changelog

## Versioning policy

Consumers are other people's repositories, so the contract is stated rather
than assumed — the same one as `@acc/decho-styling` and
`@acc/decho-components`. While the version is `0.x`:

- **Patch** — bug fixes, docs, internal refactors, build changes that do not
  alter what is published.
- **Minor** — new exports, new options, new entry points. Additive.
- **Breaking** — removing or renaming an export, an option or an entry point,
  or narrowing a peer dependency range. Until `1.0` these land in a minor
  bump, listed under **Breaking**, with the migration in the same entry.

Every release gets an entry here in the same commit that bumps `version`.
Work that has not been published yet collects under **Unreleased**, which is
renamed to the new version number at release time.

---

## Unreleased

### Added

- Supports `maplibre-gl` 6 as well as 5: the peer is now `^5.0.0 || ^6.0.0`.
  - `maplibre-gl` is imported as a namespace (`import * as maplibregl`), since 6
    is ESM-only and has no default export. Works on both.
  - `landusePatterns` supplies its textures through
    `map.setMissingStyleImageResolver` where the map has it (6), because from 6
    an image added from a `styleimagemissing` listener is too late for the tile
    that asked. On 5 it listens for the event as before. The resolver is one per
    map: while the extension is attached, it is the extension's.
  - `ExtensionMap` gains an optional `setMissingStyleImageResolver`, and
    `MaplibreLike` declares its members as methods so 6's stricter
    `addProtocol` handler type still satisfies it. `onMapReady`'s map is typed
    from a `maplibre-gl` type import instead of 5's global `maplibregl`
    namespace, which 6 no longer declares.
  - On 6 the app must call `setWorkerUrl` once (the worker is a separate file
    bundlers do not pick up); see "Requirements on the consuming application"
    in the README for the Vite line. Nothing changes on 5.

### Changed

- `@acc/decho-foundry-bytes` peer is now `^0.1.0` (was `>=0.1.0`), and the
  `@osdk/*` peers are `^2.0.0` (were `>=2.0.0`). An open range accepted breaking
  releases this package was never tested against.
- This changelog now ships in the tarball.
- Docs and comments no longer refer to the deprecated `@acc/decho-mil-map`.

### Internal

- `prepublishOnly` runs the tests before building.
- Built with `tsc -b`, referencing `@acc/decho-foundry-bytes`'s build config,
  instead of a `build:deps` script. Nothing published changes.

## 0.11.0

The version current when this changelog was started. Earlier releases were not
recorded here; see the package README for the design history that matters.
