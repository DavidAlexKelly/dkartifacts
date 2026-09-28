/**
 * Tile stores and the cell resolvers that address them.
 *
 * WHY THERE ARE TWO KINDS
 * -----------------------
 * A PMTiles archive of any real extent is far too large to download whole, and
 * Foundry's file-content endpoint does not honour HTTP Range (measured; see
 * bytes.ts). So the transfer unit is a whole FILE, and the archive has to be
 * pre-cut into per-cell files. Every consumer of this library therefore needs
 * a (z, x, y) -> file path function, and there are two in the wild:
 *
 *   "manifest"   — the cut is described by a manifest.json shipped alongside
 *                  the chunks. Per-zoom cell sizes, an allow-list of cells that
 *                  actually exist, and the path template all come from data.
 *                  This is the planet basemap and the shape to prefer.
 *
 *   "fixed-grid" — the cut is hardcoded: one bounding box, a cols x rows grid
 *                  per zoom, a filename convention. This is the older theatre
 *                  basemap, kept so it can be adopted without re-cutting the
 *                  data first.
 *
 * Both collapse to the same Resolver interface, so nothing downstream — cache,
 * prefetch, protocol — needs to know which it is holding. Generating a
 * manifest for a fixed-grid dataset is enough to retire the second kind
 * entirely, at which point this file loses half its size.
 */

// ── Manifest-described stores ────────────────────────────────────────────────

export interface GlobeCell {
  col: number;
  row: number;
  /** Size of this cell's archive. Absent in manifests written before sizes. */
  bytes?: number;
}

export interface GlobeLayerSingle {
  id: string;
  minZoom: number;
  maxZoom: number;
  type: "single";
  path: string;
  /** Size of the archive. Absent in manifests written before sizes. */
  bytes?: number;
}

export interface GlobeLayerGrid {
  id: string;
  minZoom: number;
  maxZoom: number;
  type: "grid";
  cellDeg: number;
  /** e.g. "z12/c{col}_r{row}.pmtiles" */
  pathTemplate: string;
  /**
   * Optional allow-list of cells that exist (ocean cells are omitted).
   *
   * TWO SHAPES ARE ACCEPTED, because both are deployed:
   *
   *   [col, row]                    the original tuple form
   *   { col, row, bytes? }          the object form, which can carry sizes
   *
   * The object form was introduced without bumping `version`, so the version
   * number cannot be used to tell them apart — the parser sniffs each entry
   * instead. Reading a tuple as an object (or vice versa) silently yields
   * undefined for both coordinates, an allow-list of "undefined,undefined",
   * and a map where every tile above the single-archive zooms resolves to
   * nothing. That failure is invisible in logs, which is why this tolerates
   * both rather than trusting the declared version.
   */
  cells?: Array<[number, number] | GlobeCell>;
}

export type GlobeLayer = GlobeLayerSingle | GlobeLayerGrid;

export interface GlobeManifest {
  version: number;
  gridOrigin: { lon: number; lat: number };
  layers: GlobeLayer[];
}

// ── Store descriptors ────────────────────────────────────────────────────────

export interface ManifestStore {
  kind: "manifest";
  /** Dataset holding the chunks. Preferred: stable, non-preview endpoint. */
  datasetRid?: string;
  /** Media set holding identical chunks. Used only when no dataset is given. */
  mediaSetRid?: string;
  /** Manifest path inside the store. */
  manifestPath?: string;
}

export interface FixedGridStore {
  kind: "fixed-grid";
  datasetRid: string;
  /** Zooms at or below this use a single archive. */
  singleFileMaxZoom: number;
  singleFilePath: string;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  /** cols/rows per zoom above singleFileMaxZoom. */
  grid: Record<number, { cols: number; rows: number }>;
  maxZoom: number;
  /** Builds the per-cell file name from the cell's south-west corner. */
  fileName: (zoom: number, minLon: number, minLat: number) => string;
}

export type TileStore = ManifestStore | FixedGridStore;

/** The RID a store's archives are read from, and which endpoint family to use. */
export function storeTarget(store: TileStore): {
  rid: string;
  media: boolean;
} {
  if (store.kind === "fixed-grid") {return { rid: store.datasetRid, media: false };}
  if (store.datasetRid) {return { rid: store.datasetRid, media: false };}
  if (store.mediaSetRid) {return { rid: store.mediaSetRid, media: true };}
  throw new Error(
    "offline-globe: tile store has neither datasetRid nor mediaSetRid",
  );
}

// ── Resolver ─────────────────────────────────────────────────────────────────

export interface CellRef {
  col: number;
  row: number;
  path: string;
  /** Declared size, when the manifest carries one. */
  bytes?: number;
}

export interface Resolver {
  /** Highest zoom the store holds tiles for. */
  maxZoom: number;
  /**
   * Declared size of the archive at `path`, when known.
   *
   * Lets callers budget before fetching: prefetch can prefer cheap neighbours,
   * eviction can account for cached bytes without reading them back, and a
   * region download can total itself up front. Undefined for stores whose
   * manifest predates sizes, and for the fixed-grid scheme, which has no
   * manifest at all — every caller must treat it as a hint, not a guarantee.
   */
  bytesForPath(path: string): number | undefined;
  /** Archive path containing tile z/x/y, or null if not covered. */
  pathForTile(z: number, x: number, y: number): string | null;
  /**
   * Cells overlapping the given extent at the given zoom, expanded by `ring`
   * cells in every direction. Empty for single-archive zooms — there is
   * nothing to prefetch when one file covers everything.
   */
  cellsAround(
    z: number,
    bounds: { west: number; south: number; east: number; north: number },
    ring: number,
  ): CellRef[];
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** Web-mercator tile (z,x,y) north-west corner, in degrees. */
function tileNorthWest(z: number, x: number, y: number): { lon: number; lat: number } {
  const n = 2 ** z;
  return {
    lon: (x / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  };
}

// ── Manifest resolver ────────────────────────────────────────────────────────

export function manifestResolver(manifest: GlobeManifest): Resolver {
  // Both lookups are on the hot path: pathForTile runs for EVERY tile MapLibre
  // asks for, dozens per screenful, re-fired on every pan. The z12 allow-list
  // has thousands of entries, so a linear scan here is tens of thousands of
  // comparisons per frame to answer a set-membership question.
  const cellSets = new Map<GlobeLayerGrid, Set<string>>();
  const byZoom = new Map<number, GlobeLayer | null>();

  const cellKey = (col: number, row: number) => `${col},${row}`;

  /** Accepts either shape; see GlobeLayerGrid.cells. */
  const readCell = (
    entry: [number, number] | GlobeCell,
  ): { col: number; row: number; bytes?: number } =>
    Array.isArray(entry)
      ? { col: entry[0], row: entry[1] }
      : { col: entry.col, row: entry.row, bytes: entry.bytes };

  const cellSetOf = (layer: GlobeLayerGrid): Set<string> | null => {
    if (!layer.cells) {return null;}
    let set = cellSets.get(layer);
    if (!set) {
      set = new Set(
        layer.cells.map((entry) => {
          const { col, row } = readCell(entry);
          return cellKey(col, row);
        }),
      );
      cellSets.set(layer, set);
    }
    return set;
  };

  /**
   * path -> declared bytes, built once from every layer.
   *
   * Keyed by path rather than by cell so a caller holding only a path — which
   * is all the tile protocol and the archive cache ever have — can ask.
   */
  const bytesByPath = new Map<string, number>();
  for (const layer of manifest.layers) {
    if (layer.type === "single") {
      if (typeof layer.bytes === "number") {
        bytesByPath.set(layer.path, layer.bytes);
      }
      continue;
    }
    for (const entry of layer.cells ?? []) {
      const { col, row, bytes } = readCell(entry);
      if (typeof bytes !== "number") {continue;}
      bytesByPath.set(
        layer.pathTemplate
          .replace("{col}", pad3(col))
          .replace("{row}", pad3(row)),
        bytes,
      );
    }
  }

  const layerForZoom = (z: number): GlobeLayer | null => {
    const memo = byZoom.get(z);
    if (memo !== undefined) {return memo;}
    const found =
      manifest.layers.find((l) => z >= l.minZoom && z <= l.maxZoom) ?? null;
    byZoom.set(z, found);
    return found;
  };

  const colOf = (lon: number, cellDeg: number) =>
    Math.floor((lon - manifest.gridOrigin.lon) / cellDeg);
  const rowOf = (lat: number, cellDeg: number) =>
    Math.floor((manifest.gridOrigin.lat - lat) / cellDeg);

  const pathForCell = (
    layer: GlobeLayerGrid,
    col: number,
    row: number,
  ): string | null => {
    const cells = cellSetOf(layer);
    if (cells && !cells.has(cellKey(col, row))) {return null;}
    return layer.pathTemplate
      .replace("{col}", pad3(col))
      .replace("{row}", pad3(row));
  };

  return {
    maxZoom: Math.max(...manifest.layers.map((l) => l.maxZoom)),

    bytesForPath: (path) => bytesByPath.get(path),

    pathForTile(z, x, y) {
      const layer = layerForZoom(z);
      if (!layer) {return null;}
      if (layer.type === "single") {return layer.path;}

      const nw = tileNorthWest(z, x, y);
      return pathForCell(
        layer,
        colOf(nw.lon, layer.cellDeg),
        rowOf(nw.lat, layer.cellDeg),
      );
    },

    cellsAround(z, bounds, ring) {
      const layer = layerForZoom(z);
      if (!layer || layer.type === "single") {return [];}

      const { cellDeg } = layer;
      // Rows increase southward, so the north edge gives the low row index.
      const colMin = colOf(bounds.west, cellDeg) - ring;
      const colMax = colOf(bounds.east, cellDeg) + ring;
      const rowMin = rowOf(bounds.north, cellDeg) - ring;
      const rowMax = rowOf(bounds.south, cellDeg) + ring;

      const out: CellRef[] = [];
      for (let col = colMin; col <= colMax; col++) {
        for (let row = rowMin; row <= rowMax; row++) {
          const path = pathForCell(layer, col, row);
          if (path) {out.push({ col, row, path, bytes: bytesByPath.get(path) });}
        }
      }
      return out;
    },
  };
}

// ── Fixed-grid resolver ──────────────────────────────────────────────────────

export function fixedGridResolver(store: FixedGridStore): Resolver {
  const { bbox, grid, singleFileMaxZoom, singleFilePath, fileName } = store;

  const stepsFor = (z: number) => {
    const g = grid[z];
    if (!g) {return null;}
    return {
      lonStep: (bbox.maxLon - bbox.minLon) / g.cols,
      latStep: (bbox.maxLat - bbox.minLat) / g.rows,
      cols: g.cols,
      rows: g.rows,
    };
  };

  return {
    maxZoom: store.maxZoom,

    // The fixed-grid scheme has no manifest, so nothing declares sizes.
    bytesForPath: () => undefined,

    pathForTile(z, x, y) {
      if (z <= singleFileMaxZoom) {return singleFilePath;}
      const steps = stepsFor(z) ?? stepsFor(singleFileMaxZoom + 1);
      if (!steps) {return singleFilePath;}

      const nw = tileNorthWest(z, x, y);
      // Clamped, not rejected: the theatre cut has no allow-list, and a tile
      // just outside the box is better served by the edge cell than by nothing.
      const col = Math.max(
        0,
        Math.min(steps.cols - 1, Math.floor((nw.lon - bbox.minLon) / steps.lonStep)),
      );
      const row = Math.max(
        0,
        Math.min(steps.rows - 1, Math.floor((nw.lat - bbox.minLat) / steps.latStep)),
      );
      return fileName(
        z,
        bbox.minLon + col * steps.lonStep,
        bbox.minLat + row * steps.latStep,
      );
    },

    cellsAround(z, bounds, ring) {
      if (z <= singleFileMaxZoom) {return [];}
      const steps = stepsFor(z);
      if (!steps) {return [];}

      const out: CellRef[] = [];
      for (let row = 0; row < steps.rows; row++) {
        for (let col = 0; col < steps.cols; col++) {
          const minLon = bbox.minLon + col * steps.lonStep;
          const minLat = bbox.minLat + row * steps.latStep;
          const overlaps =
            minLon + steps.lonStep > bounds.west - ring * steps.lonStep &&
            minLon < bounds.east + ring * steps.lonStep &&
            minLat + steps.latStep > bounds.south - ring * steps.latStep &&
            minLat < bounds.north + ring * steps.latStep;
          if (overlaps) {
            out.push({ col, row, path: fileName(z, minLon, minLat) });
          }
        }
      }
      return out;
    },
  };
}
