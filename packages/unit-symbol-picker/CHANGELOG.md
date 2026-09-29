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

### Fixed

- `dist` now loads under Node's own ES module loader, not only under a
  bundler. It used to contain extensionless and directory imports
  (`export * from "./core"`), which Vite and esbuild resolve but Node rejects
  with "Directory import … is not supported" — hit wherever a consumer's code
  runs through Node rather than a bundler, Vitest included (it hands
  `node_modules` to Node). Every relative import now names its file
  (`./core/index.js`), and the build uses `NodeNext` resolution so the compiler
  refuses an extensionless one from now on.
- `scripts/generate-tables.mjs` writes the same `.js` import specifiers, so the
  generated tables still match what the generator produces.

### Changed

- Peers are bounded by major: `milsymbol` `^2.0.0 || ^3.0.0` (was `>=2.0.0`),
  `react` `^18.0.0 || ^19.0.0` (was `>=18`).
- `"sideEffects": false`.
- This changelog now ships in the tarball.

### Internal

- `prepublishOnly` runs the tests before building.
- TypeScript aligned with the rest of the repository (`~5.5.4`, was `^5.6.0`);
  built with `tsc -b`.

## 0.1.0

The version current when this changelog was started. Earlier releases were not
recorded here; see the package README for the design history that matters.
