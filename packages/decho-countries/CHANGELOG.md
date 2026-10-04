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

### Breaking

- **No data inside the package, and nothing fetched from anywhere but the
  dataset.** The built-in 1:110m world and `{ kind: "builtin" }` are gone,
  and `store` is now required — by `loadCountries`, `countries()` and
  `useCountries`. Migration: build the `countries_map` dataset with
  `foundry/countries_transform.py` and pass `{ kind: "dataset", datasetRid }`.
- `scripts/build-data.mjs` is gone: it downloaded its sources, and the
  dataset is now built in Foundry from files downloaded by hand.
- `CountryCard` is gone from `./react`: how a country's facts look is the
  app's call. Migration: build the panel from the core's `figuresOf`,
  `orderedFigureKeys`, `FIGURE_LABELS`, `formatFigure` and `flagEmoji` (the
  README has a short example), keeping each figure's year and the sources
  line. `useCountries` stays.

### Added

- `foundry/countries_transform.py`: builds the dataset as a Foundry Python
  transform from the raw Natural Earth shapefiles and World Bank CSV
  downloads, plus a one-row-per-country table. Reads only its input dataset.

### Fixed

- Outlines rounded to their output precision could cross themselves, which
  MapLibre draws as slivers across the country. The transform snaps with
  shapely's `set_precision`, which keeps every outline valid.
- The transform loads under Foundry's transform discovery (no dataclasses).

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
