/**
 * Preset store for this enrollment.
 *
 * Exported rather than hidden, for the reason @acc/decho-basemap's defaults.ts
 * gives: the default should be discoverable and overridable. Every entry point
 * takes a store explicitly; this is only what gets used when none is supplied.
 *
 * The consuming application must ALSO grant access — `api:use-datasets-read` on
 * the OAuth client AND the dataset added as a Resource on the app in Developer
 * Console. The scopes alone return 403, and this is a THIRD dataset, separate
 * from the basemap's tiles and its glyphs, so adding those does not cover it.
 * That omission is the most common way this package appears broken.
 */
import type { CellGrid } from "./grid.js";
import type { DemStore } from "./store.js";

/**
 * "Elevation" in Offline World: one GeoTIFF per 2° cell, named after the
 * basemap chunk it covers, cut on the same grid as the finest PMTiles layer and
 * as the pathfinding graphs.
 *
 * `manifestPath: null` because there is no manifest yet — asking for one on
 * every startup would cost a 404 on the critical path to say what we already
 * know. Write one (see the README) and set this to "manifest.json" to get the
 * allow-list, the sizes and the elevation ranges.
 */
export const ELEVATION_STORE: DemStore = {
  datasetRid: "ri.foundry.main.dataset.358e2e32-614c-4489-81e3-5dbd4d2d838c",
  grid: { originLon: -180, originLat: 85, cellDeg: 2 },
  pathTemplate: "{cell}.tif",
  manifestPath: null,
  /**
   * GLO's void sentinel. Declared here because the chunks are not guaranteed to
   * carry GDAL_NODATA, and an unflagged -32768 interpolates into a coastline as
   * a canyon 32 km deep. Harmless if the chunks do declare it — the values
   * agree.
   */
  nodata: -32768,
};

/**
 * Contours as VECTOR tiles, one PMTiles archive per DEM cell.
 *
 * A different thing from the DEM store and from contourTile in
 * core/renderers: these were traced from the same GeoTIFFs by gdal_contour
 * ahead of time, so the lines are geometry rather than pixels — crisp at any
 * zoom, clickable, and above all LABELLED with their height, which a raster
 * contour can never be.
 *
 * Two properties of the archives shape everything about how they are loaded:
 *
 *   CLIPPED, NO HALO. Each archive holds only the geometry inside its own 2°
 *   cell, because it was cut from that cell's GeoTIFF alone. A map tile
 *   straddling a cell boundary therefore CANNOT be served complete from one
 *   archive — which is why contourTiles() attaches one vector source per
 *   visible cell instead of routing every tile to a single source. Routing
 *   would leave a gap along every 2° line, the width of a tile.
 *
 *   TILED AT ONE ZOOM. tippecanoe was run with -Z10 -z10, so each archive
 *   holds z10 tiles and nothing else. The source declares
 *   minzoom = maxzoom = 10 and MapLibre overzooms above it, which for vector
 *   geometry costs nothing in quality. Below z10 there are no tiles at all.
 */
export interface ContourStore {
  datasetRid: string;
  /** Cell grid the archives are cut on. The DEM's, by construction. */
  grid: CellGrid;
  /** File name inside the dataset. `{cell}` becomes e.g. "c089_r016". */
  pathTemplate: string;
  /**
   * The highest zoom the archives hold tiles for — tippecanoe's `-z`.
   *
   * MapLibre overzooms above it, free for vector geometry.
   */
  archiveZoom: number;
  /**
   * The lowest zoom they hold — tippecanoe's `-Z`. Defaults to `archiveZoom`,
   * which is the `-Z10 -z10` bake this enrollment has.
   *
   * WORTH KNOWING IF THE CONTOURS SHOULD APPEAR EARLIER. Nothing can be drawn
   * below the lowest zoom in the archive: MapLibre requests no tiles below a
   * source's minzoom, and a z10 tile cannot be re-cut into a z8 one on the
   * client. So "I want contours when zoomed further out" is a re-bake —
   * `tippecanoe -Z8 -z10`, which generalises the lines on the way down — and
   * then this number, not a code change.
   */
  archiveMinZoom?: number;
  /**
   * Vector layer name inside each archive — tippecanoe's `-l`, or the input
   * file's basename when it was not given. If the contours do not appear, this
   * is the first thing to check: `pmtiles show c089_r016.pmtiles` prints it
   * under vector_layers, and contourTiles says so in the console when a loaded
   * archive yields no features for the name it was told.
   */
  sourceLayer: string;
  /**
   * The elevation property. Left undefined to try gdal_contour's `ELEV` and
   * the other usual spellings in turn, which is what the default pipeline
   * produces.
   */
  elevationProperty?: string;
}

export const CONTOUR_STORE: ContourStore = {
  datasetRid: "ri.foundry.main.dataset.b2d5b73e-46bb-4ddb-8e0e-de8ca924c0dc",
  grid: ELEVATION_STORE.grid,
  pathTemplate: "{cell}.pmtiles",
  archiveZoom: 10,
  sourceLayer: "contours",
};

/**
 * Relief shaded ahead of time: one 8-bit GeoTIFF per DEM cell, same grid, same
 * names, from `gdaldem hillshade` over the same elevation chunks.
 *
 * An ordinary DemStore, because that is exactly what it is — a single-band
 * raster on the cell grid — which means it needs no new machinery at all: the
 * same decoder, the same Mercator gather (so no seams where a tile straddles
 * four cells), the same cache and prefetch. Only the renderer differs, and it
 * is `shadedReliefTile` rather than a colour ramp.
 *
 * `nodata: 0` because `gdaldem hillshade` reserves 0 for it and puts real
 * shading in 1-255. Without that, every cell would have a black border where
 * the source had none.
 */
export const HILLSHADE_STORE: DemStore = {
  datasetRid: "ri.foundry.main.dataset.8622fb23-1bb3-421b-9a32-ad3f271957ab",
  grid: ELEVATION_STORE.grid,
  pathTemplate: "{cell}.tif",
  manifestPath: null,
  nodata: 0,
};

let hillshadeStore: DemStore = HILLSHADE_STORE;

/** Override the baked-hillshade preset, e.g. from an app's env vars. */
export function configureDefaultHillshadeStore(store: DemStore): void {
  hillshadeStore = store;
}

export function defaultHillshadeStore(): DemStore {
  return hillshadeStore;
}

let contourStore: ContourStore = CONTOUR_STORE;

/** Override the contour preset, e.g. from an app's env vars. */
export function configureDefaultContourStore(store: ContourStore): void {
  contourStore = store;
}

export function defaultContourStore(): ContourStore {
  return contourStore;
}

let defaultStore: DemStore = ELEVATION_STORE;

/** Override the preset, e.g. from an app's env vars. */
export function configureDefaultDemStore(store: DemStore): void {
  defaultStore = store;
}

export function defaultDemStore(): DemStore {
  return defaultStore;
}
