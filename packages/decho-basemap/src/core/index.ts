/**
 * @acc/decho-basemap — core entry point (no React).
 *
 * Serves a MapLibre vector basemap entirely from Foundry: PMTiles archives,
 * glyphs and sprites read from datasets or media sets over the platform's own
 * APIs, with no external network calls. See ../README.md.
 *
 * THE BYTE LAYER MOVED OUT
 * ------------------------
 * Everything to do with reading files from Foundry — the token, both cache
 * tiers, request de-duplication, the concurrency lanes and the typed errors —
 * now lives in @acc/decho-foundry-bytes, because a second package needed it
 * (@acc/decho-pathfinding reads graph cells the same way) and depending on a
 * map renderer to fetch a file is backwards.
 *
 * It is re-exported here in full, under BOTH its new names and the names it
 * had when it lived in this package, so nothing that imported it from here had
 * to change. The aliases are kept indefinitely: they cost one line each, and
 * `configureBasemap` in particular is called by every consuming application.
 */

// ── The map ─────────────────────────────────────────────────────────────────

export {
  ASSET_STORE,
  PLANET_STORE,
  THEATRE_STORE,
  configureDefaultStores,
  defaultStores,
  type DefaultStores,
} from "./defaults.js";

export {
  createBasemap,
  type AttachableMap,
  type BasemapHandle,
  type BasemapOptions,
  type StyleFragment,
} from "./basemap.js";

// The extension contract. Add-ons (elevation, mil graphics, imagery) implement
// BasemapExtension; the merge and attach helpers are exported because they are
// pure and worth testing, and because a consumer building its own map from
// createBasemap() can use them too.
export {
  attachExtensions,
  collectStyleContributions,
  mergeExtensionStyle,
  type AttributedContribution,
  type BasemapExtension,
  type ExtensionContext,
  type ExtensionMap,
  type MergedExtensionStyle,
  type StyleContribution,
  type TerrainSpec,
} from "./extensions.js";

// Extruded buildings from the archive this package already serves. It needs no
// new dataset and no new dependency — the Protomaps `buildings` layer carries
// `height` and `min_height`, which is exactly what fill-extrusion wants — so it
// lives here rather than in a package of its own.
// Operational overlays over the archive's own tiles, and the census for
// deciding whether a given archive can support them. Same argument as
// buildings3d: no dataset, no download, no dependency.
export {
  chokePoints,
  going,
  wetGaps,
  GOING_COLOURS,
  type ChokePointsOptions,
  type GoingOptions,
  type OverlayExtension,
  type OverlayOptions,
  type WetGapsOptions,
} from "./overlays.js";

export {
  OVERLAY_SOURCE_LAYERS,
  describeOverlayLayers,
  describeSourceLayer,
  type DescribeSourceLayerOptions,
  type SourceLayerCensus,
} from "./census.js";

// Ground textures: trees on the woodland, wheat on the farmland, reeds on the
// marsh. Same bargain as the overlays above — it styles the archive's own
// landuse polygons — except that the artwork is generated rather than fetched,
// which is why ./textures is exported alongside it. A consumer swapping one
// icon needs the TextureIcon shape; one adding a texture of their own needs
// the whole table.
export {
  landusePatterns,
  patternExpression,
  plateExpression,
  type LandusePatternsExtension,
  type LandusePatternsOptions,
} from "./landusePatterns.js";

export {
  BUSH_ICON,
  FACTORY_ICON,
  NATURAL_GROUND,
  FRUIT_TREE_ICON,
  HOUSE_ICON,
  REED_ICON,
  SABRES_ICON,
  SLOTS_PER_TEXTURE,
  TEXTURE_COLOURS,
  TEXTURE_ICONS,
  TEXTURE_KINDS,
  TEXTURE_PLATE_COLOURS,
  TEXTURE_SLOT_COUNT,
  TREE_ICON,
  WHEAT_ICON,
  placementsForTexture,
  renderTexturePattern,
  slotPlacement,
  wrappedPlacements,
  type LandTexture,
  type RenderTextureOptions,
  type TextureIcon,
  type TexturePlacement,
} from "./textures.js";

export {
  BUILDINGS_SOURCE_LAYER,
  PROTOMAPS_FLAT_BUILDINGS_LAYER,
  buildingBaseExpression,
  buildingHeightExpression,
  buildings3d,
  describeBuildingCoverage,
  type BuildingCoverage,
  type Buildings3dExtension,
  type Buildings3dOptions,
  type QueryableMap,
} from "./buildings.js";

// "Style is not done loading" is the most common intermittent failure in a
// MapLibre application, and waiting correctly is four lines nobody writes
// twice. useBasemap awaits this before it touches the style, so consumers of
// this package get the guarantee; consumers building their own map can use it
// directly.
export {
  whenStyleLoaded,
  type StyleReadyMap,
  type WhenStyleLoadedOptions,
} from "./styleReady.js";

export {
  createTileSource,
  type LoadStatus,
  type StatusListener,
  type TileSourceHandle,
  type TileSourceOptions,
} from "./tileSource.js";

export {
  fixedGridResolver,
  manifestResolver,
  storeTarget,
  type CellRef,
  type FixedGridStore,
  type GlobeCell,
  type GlobeLayer,
  type GlobeLayerGrid,
  type GlobeLayerSingle,
  type GlobeManifest,
  type ManifestStore,
  type Resolver,
  type TileStore,
} from "./stores.js";

export {
  FONT_ITALIC,
  FONT_MEDIUM,
  FONT_REGULAR,
  GLYPHS_URL,
  assetStyleKeys,
  registerAssetProtocols,
  unregisterAssetProtocols,
  type AssetStore,
  type MaplibreLike,
} from "./assets.js";

export { FoundryRangeSource, MediaItemSource } from "./sources.js";

// ── The byte layer, re-exported from @acc/decho-foundry-bytes ───────────────
//
// New names first. An application that also uses @acc/decho-pathfinding should
// prefer importing these from @acc/decho-foundry-bytes directly — one
// configure call serves every package built on it.

export {
  abortError,
  clearFileCache,
  clearPersistentCache,
  configureFoundryBytes,
  createBrowserPersistentCache,
  createCacheIndex,
  createInFlightMap,
  createLane,
  createPersistentCache,
  createResidentCache,
  describeFoundryError,
  errorForResponse,
  forceWholeFileMode,
  getCacheStats,
  getFile,
  getFileOptional,
  getJson,
  getLaneStats,
  getMediaItem,
  getMediaItemJson,
  getMemoryBudgetBytes,
  getRange,
  getRangeMode,
  getResidentBytes,
  isAbortError,
  isConfigured,
  isLargeFilePath,
  registerCacheSizeSource,
  resolveCap,
  selectVictims,
  settleRangeMode,
  FoundryAccessError,
  FoundryBytesError,
  FoundryMalformedRequestError,
  FoundryNotConfiguredError,
  FoundryNotFoundError,
  FoundryTransferError,
  LARGE_LANE_LIMIT,
  SMALL_LANE_LIMIT,
  type CacheEntryMeta,
  type CacheIndex,
  type CacheStats,
  type FoundryAccess,
  type FoundryBytesErrorKind,
  type FoundryErrorGuidance,
  type InFlightMap,
  type Lane,
  type LaneStats,
  type PersistentCache,
  type PersistentCacheOptions,
  type RangeMode,
  type ResidentCache,
} from "@acc/decho-foundry-bytes";

export { CRT_FLAVOR, PHOSPHOR_GREEN, phosphorFlavor } from "./flavors.js";

// ── Compatibility aliases ───────────────────────────────────────────────────
//
// The names this surface had before the extraction. Every one of these is the
// same object, so `instanceof` and identity checks work across both spellings.

export {
  configureFoundryBytes as configureBasemap,
  describeFoundryError as describeBasemapError,
  isLargeFilePath as isArchivePath,
  FoundryAccessError as BasemapAccessError,
  FoundryBytesError as BasemapError,
  FoundryMalformedRequestError as BasemapMalformedRequestError,
  FoundryNotConfiguredError as BasemapNotConfiguredError,
  FoundryNotFoundError as BasemapNotFoundError,
  FoundryTransferError as BasemapTransferError,
  LARGE_LANE_LIMIT as ARCHIVE_LANE_LIMIT,
  SMALL_LANE_LIMIT as ASSET_LANE_LIMIT,
  type FoundryBytesErrorKind as BasemapErrorKind,
  type FoundryErrorGuidance as BasemapErrorGuidance,
} from "@acc/decho-foundry-bytes";
