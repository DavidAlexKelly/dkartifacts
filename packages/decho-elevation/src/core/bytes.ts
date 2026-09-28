/**
 * The one place this package reads bytes out of Foundry.
 *
 * Everything in src/core reads through `@acc/decho-foundry-bytes` via this
 * module and never imports it directly, so the byte layer is one mock away in
 * tests (see demSource.test.ts and store.test.ts) and one edit away if it
 * moves.
 *
 * The core deliberately does not import `@acc/decho-basemap`: a headless
 * consumer (a worker, a Function, a planner with no map) must be able to read
 * DEM cells without installing a map renderer and pmtiles. Only ./extension
 * depends on the basemap.
 *
 * There is one byte layer per application: `configureBasemap` in
 * `@acc/decho-basemap` is `configureFoundryBytes` under another name, so either
 * configure call serves this package too, provided the application has a
 * single copy of `@acc/decho-foundry-bytes` installed — which is why it is a
 * peer dependency rather than a dependency.
 */

export {
  getFileOptional,
  getLaneStats,
  isConfigured,
  settleRangeMode,
} from "@acc/decho-foundry-bytes";
