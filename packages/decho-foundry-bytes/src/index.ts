/**
 * @acc/decho-foundry-bytes
 *
 * Reading large files out of Foundry datasets and media sets, from a browser,
 * well. One access token with retry-on-401, a resident LRU with a byte budget,
 * Cache Storage keyed by dataset transaction RID (so a file is downloaded once
 * per user, ever), request de-duplication with refcounted cancellation, and two
 * concurrency lanes so a 25 MB archive cannot delay a 20 KB one.
 *
 * WHY IT IS ITS OWN PACKAGE
 * -------------------------
 * All of this was written inside @acc/decho-basemap, and exported from it,
 * because a second package needed it: @acc/decho-pathfinding reads graph cells
 * the same way. Depending on the basemap to fetch bytes meant a headless
 * consumer — a routing worker, a Function, an app with no map at all — had to
 * install a map renderer and its pmtiles dependency to read a file.
 *
 * So it is the bottom of the stack now, and it depends on nothing above it.
 * Nothing here imports maplibre-gl, pmtiles or react, and nothing here knows
 * what a tile is.
 *
 *   configureFoundryBytes({ foundryUrl, getToken, platformClient });  // once
 *   const body = await getFile(datasetRid, "path/in/dataset.bin");
 *
 * @acc/decho-basemap re-exports this entire surface under its previous names
 * (configureBasemap, BasemapError, isArchivePath, …), so no existing consumer
 * had to change.
 */

export {
  configureFoundryBytes,
  isConfigured,
  access,
  foundryOrigin,
  type FoundryAccess,
} from "./config.js";

export {
  clearFileCache,
  clearPersistentCache,
  forceWholeFileMode,
  getFile,
  getFileOptional,
  getJson,
  getCacheStats,
  getLaneStats,
  getMediaItem,
  getMediaItemByRid,
  getMediaItemJson,
  getMemoryBudgetBytes,
  getRange,
  getRangeMode,
  getResidentBytes,
  registerCacheSizeSource,
  settleRangeMode,
  type RangeMode,
} from "./bytes.js";

export {
  LARGE_LANE_LIMIT,
  SMALL_LANE_LIMIT,
  createLane,
  isLargeFilePath,
  type Lane,
  type LaneStats,
} from "./lanes.js";

export { createResidentCache, type ResidentCache } from "./lru.js";

export {
  createBrowserPersistentCache,
  createCacheIndex,
  createPersistentCache,
  resolveCap,
  selectVictims,
  type CacheEntryMeta,
  type CacheIndex,
  type CacheStats,
  type PersistentCache,
  type PersistentCacheOptions,
} from "./persistentCache.js";

export { abortError, createInFlightMap, type InFlightMap } from "./inflight.js";

export {
  FoundryAccessError,
  FoundryBytesError,
  FoundryMalformedRequestError,
  FoundryNotConfiguredError,
  FoundryNotFoundError,
  FoundryTransferError,
  describeFoundryError,
  errorForResponse,
  isAbortError,
  type FoundryBytesErrorKind,
  type FoundryErrorGuidance,
} from "./errors.js";
