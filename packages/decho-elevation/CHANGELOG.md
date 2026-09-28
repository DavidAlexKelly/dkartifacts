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

### Breaking

- **The byte layer comes from `@acc/decho-foundry-bytes` directly**, not
  through `@acc/decho-basemap`. It is now a required peer (`^0.1.0`), and
  `@acc/decho-basemap` is an *optional* peer needed only by `./extension`.
  A headless consumer of `.` or `./react` no longer has to install a map
  renderer and pmtiles.

  Migration: an app that already uses the basemap already has
  `@acc/decho-foundry-bytes` installed (it is the basemap's peer too), so
  nothing changes. A headless app installs `@acc/decho-foundry-bytes` and calls
  `configureFoundryBytes` instead of `configureBasemap` — they are the same
  function.
- `@acc/decho-basemap` peer is now `>=0.8.0 <0.12.0` (was `>=0.8.0`).

### Changed

- `"sideEffects": false`.
- This changelog now ships in the tarball.

### Internal

- `prepublishOnly` runs the tests before building.
- Built with `tsc -b`, referencing the foundry-bytes and basemap build configs,
  instead of a `build:deps` script.

## 0.2.0

The version current when this changelog was started. Earlier releases were not
recorded here; see the package README for the design history that matters.
