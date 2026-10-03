# Changelog

## Versioning policy

Consumers are other people's repositories, so the contract is stated rather
than assumed — the same one as the other `@acc/decho-*` packages. While the
version is `0.x`:

- **Patch** — bug fixes, docs, internal refactors, build changes that do not
  alter what is published.
- **Minor** — new exports, new options, new entry points. Additive.
- **Breaking** — removing or renaming an export, an option or an entry point,
  narrowing a peer dependency range, or a dataset schema this version can no
  longer read. Until `1.0` these land in a minor bump, listed under
  **Breaking**, with the migration in the same entry.

Every release gets an entry here in the same commit that bumps `version`.
Work that has not been published yet collects under **Unreleased**, which is
renamed to the new version number at release time.

---

## Unreleased

## 0.1.0

First release.

- `loadCountries(store)` reads a countries dataset (schema 1) from a Foundry
  dataset, the built-in 1:110m world, or files in memory; `countryAt`, region
  grouping with summed figures, figure formatting and flags.
- `countries()` for `@acc/decho-basemap`: a clickable country layer with
  border views, region schemes, region/country/auto picking, and a controller
  to switch them without rebuilding the map.
- `useCountries` and `CountryCard` for React.
- `scripts/build-data.mjs` builds a dataset from Natural Earth, optionally
  with World Bank figures.
