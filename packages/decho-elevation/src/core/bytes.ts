/**
 * The one place this package reads bytes out of Foundry.
 *
 * WHY AN INDIRECTION MODULE FOR THREE RE-EXPORTS
 * ----------------------------------------------
 * The byte layer — token, retry-on-401, resident LRU, Cache Storage keyed by
 * dataset transaction RID, request de-duplication with refcounted
 * cancellation, concurrency lanes — currently lives inside
 * `@acc/decho-basemap` and is exported from it deliberately: "any Foundry app
 * streaming large dataset files gets [it] for free".
 *
 * It is being extracted into `@acc/decho-foundry-bytes` so that a headless
 * consumer (a routing worker, a Function, a planner with no map) does not have
 * to install a map renderer and pmtiles to read a file. That extraction is in
 * flight on another branch.
 *
 * Importing it through this module means the day it lands, moving this package
 * onto it is ONE edit here — and `@acc/decho-basemap` stops being a dependency
 * of anything but ./extension, which is the only part of this package that has
 * anything to do with a map.
 *
 * Nothing else in src/core imports @acc/decho-basemap.
 */

export {
  getFileOptional,
  getLaneStats,
  isConfigured,
  settleRangeMode,
} from "@acc/decho-basemap";
