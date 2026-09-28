/**
 * @acc/decho-elevation
 *
 * Elevation served entirely from Foundry: chunked DEM cells read through the
 * platform's own APIs, decoded in the browser, and turned into either pictures
 * (3D terrain, hillshade, hypsometric tint, slope classes) or answers (height
 * at a point, the section under a route, line of sight, viewshed).
 *
 * This entry point is the FRAMEWORK-FREE core. It imports no React and no
 * maplibre-gl, so a Worker or a Function can use it. The two surfaces that do
 * need more live at:
 *
 *   @acc/decho-elevation/react       hooks and a profile chart
 *   @acc/decho-elevation/extension   the plug-in for @acc/decho-basemap
 *
 * They are deliberately not re-exported here: the extension pulls in the
 * basemap package, and a barrel that quietly did that would put a map renderer
 * into every consumer that only wanted to know how high a hill is.
 *
 *   configureBasemap({ foundryUrl, getToken, platformClient });   // once
 *   const dem = await createDemSource();
 *   const height = await dem.heightAt(9.1, 61.5);
 */

export {
  DEFAULT_MIN_ZOOM,
  createDemSource,
  cellsUnderLine,
  type DemSourceHandle,
  type DemSourceOptions,
  type DemSourceStats,
  type HeightSampler,
  type ProtocolHost,
} from "./core/demSource";

export {
  DEFAULT_PATH_TEMPLATE,
  loadDemIndex,
  type DemIndex,
  type DemManifest,
  type DemManifestCell,
  type DemStore,
} from "./core/store";

export {
  CONTOUR_STORE,
  ELEVATION_STORE,
  HILLSHADE_STORE,
  configureDefaultContourStore,
  configureDefaultDemStore,
  configureDefaultHillshadeStore,
  defaultContourStore,
  defaultDemStore,
  defaultHillshadeStore,
  type ContourStore,
} from "./core/defaults";

// The cell grid. Exported because the DEM, the pathfinding graphs and the
// basemap's finest layer are cut on ONE grid, and anything reasoning across
// them needs the same arithmetic — including the mismatch check, which is how a
// future re-cut on a different origin gets caught instead of quietly offsetting
// every sample.
export {
  EARTH_RADIUS_M,
  METRES_PER_DEGREE_LAT,
  cellBounds,
  cellFor,
  cellKey,
  cellsAlongLine,
  cellsInBounds,
  distanceMetres,
  gridMismatch,
  metresPerDegreeLon,
  parseCellKey,
  type CellBounds,
  type CellCoord,
  type CellGrid,
} from "./core/grid";

export {
  gridStats,
  gridStepDeg,
  gridStepMetres,
  isData,
  nearestHeight,
  sampleHeight,
  slopeAt,
  type GridStats,
  type HeightArray,
  type HeightGrid,
  type SlopeAspect,
} from "./core/heightGrid";

// The decoder and the codec seam. A consumer whose chunks are LZW-compressed —
// which the built-in reader refuses on purpose rather than guessing — supplies
// their own codec over a full TIFF library and changes nothing else.
export {
  BUILT_IN_CODECS,
  codecForPath,
  geotiffCodec,
  type DemCodec,
  type DemDecodeOptions,
} from "./core/codec";
export { decodeGeoTiff, type DecodeGeoTiffOptions } from "./core/geotiff";

// The tile pipeline, exported so an app can add a rendering of its own — an
// avalanche-risk tint, a landing-zone mask — without forking the package.
export {
  CONTOUR_COLOUR,
  CONTOUR_LADDER,
  DEFAULT_NEUTRAL_SHADE,
  HYPSOMETRIC_STOPS,
  MOBILITY_SLOPE_CLASSES,
  contourTile,
  hypsometricTile,
  intervalForZoom,
  rampColour,
  shadedReliefTile,
  slopeTile,
  terrariumTile,
  type ColourStop,
  type ContourOptions,
  type ContourStep,
  type HypsometricOptions,
  type ShadedReliefOptions,
  type Rgb,
  type Rgba,
  type SlopeClass,
  type SlopeOptions,
  type TileFrame,
  type TileRenderer,
} from "./core/renderers";

export { decodeTerrarium, writeTerrarium } from "./core/terrarium";
export { crc32, encodePng } from "./core/png";
export {
  latAtTileY,
  lonAtTileX,
  metresPerPixel,
  resampleTile,
  tileBounds,
} from "./core/mercator";

export {
  createCellCache,
  DEFAULT_CELL_BUDGET_BYTES,
  type CellCache,
} from "./core/cellCache";

export {
  degreesForMetres,
  elevationProfile,
  sampleAlong,
  type ElevationProfile,
  type GeoPoint,
  type ProfileOptions,
  type ProfileSample,
} from "./core/profile";

export {
  EFFECTIVE_EARTH_RADIUS_M,
  REFRACTION_K,
  VIEWSHED_HIDDEN,
  VIEWSHED_NO_DATA,
  VIEWSHED_OUTSIDE,
  VIEWSHED_VISIBLE,
  earthBulge,
  lineOfSight,
  viewshed,
  type SightObstruction,
  type SightRequest,
  type SightResult,
  type Viewshed,
  type ViewshedOptions,
} from "./core/lineOfSight";
