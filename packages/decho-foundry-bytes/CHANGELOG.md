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

### Changed

- `@osdk/client`, `@osdk/foundry.datasets` and `@osdk/foundry.mediasets` peers
  are now `^2.0.0` (were `>=2.0.0`), so a future `@osdk` 3.x is not accepted
  untested.
- `"sideEffects": false`, so bundlers can drop what a consumer does not import.
- This changelog now ships in the tarball.

### Internal

- `prepublishOnly` runs the tests before building.
- Built with `tsc -b` (project references). Nothing published changes.

## 0.1.0

The version current when this changelog was started. Earlier releases were not
recorded here; see the package README for the design history that matters.
