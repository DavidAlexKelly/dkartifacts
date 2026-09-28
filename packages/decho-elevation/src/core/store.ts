/**
 * Where DEM chunks live, and what is known about them before one is fetched.
 *
 * THE MANIFEST IS OPTIONAL, ON PURPOSE
 * ------------------------------------
 * The Elevation dataset has no manifest.json today: it is a flat set of
 * `c{col}_r{row}.tif` files cut on the basemap's own 2° grid. This package has
 * to work against exactly that, so absence is a supported state, not a
 * degraded one — a chunk that does not exist answers 404, which the byte layer
 * reports as `null`, which reads as "no data here". Most of the planet is ocean
 * and has no chunk; that is normal and must not be an error.
 *
 * What a manifest buys, when one exists:
 *
 *   an allow-list  — a missing cell is known to be missing without a round
 *                    trip, so panning over the Atlantic costs nothing;
 *   sizes          — prefetch can spend a BYTE budget instead of a cell count,
 *                    which matters because a 2° DEM cell is 3-25 MB and the
 *                    variance between mountains and steppe is large;
 *   nodata         — declared once, rather than trusted to be in every chunk's
 *                    GDAL_NODATA tag;
 *   min/max        — a relief ramp can be scaled to the data actually in view
 *                    rather than to a hardcoded 0-4000 m.
 *
 * The shape is deliberately a superset of the basemap's GlobeManifest, so the
 * same generator can emit both and a reader of one is not surprised by the
 * other. `cells` accepts the tuple form and the object form for the same reason
 * the basemap's does: both are already deployed there.
 */

import { getFileOptional, settleRangeMode } from "./bytes";
import {
  cellKey,
  gridMismatch,
  type CellBounds,
  type CellCoord,
  type CellGrid,
} from "./grid";

export interface DemManifestCell {
  col: number;
  row: number;
  /** Size of this chunk, for prefetch budgeting. */
  bytes?: number;
  /** Elevation range within the cell, for scaling a relief ramp. */
  min?: number;
  max?: number;
  /**
   * The cell's own extent, when the generator writes it.
   *
   * Redundant — the grid says where the cell is — which is exactly why it is
   * worth carrying: it is the one field that can catch the two cuts drifting
   * apart. Checked on load; see the call to gridMismatch.
   */
  bounds?: CellBounds;
}

export interface DemManifest {
  version?: number;
  /** Must agree with the store's grid; checked, not trusted. */
  gridOrigin?: { lon: number; lat: number };
  cellDeg?: number;
  /** "{cell}.tif", where {cell} is "c000_r006". */
  pathTemplate?: string;
  cells?: Array<[number, number] | DemManifestCell>;
  dem?: {
    /** "glo90", "glo30", … — reported in diagnostics only. */
    source?: string;
    verticalDatum?: string;
    nodata?: number;
  };
}

export interface DemStore {
  /** Dataset holding the per-cell chunks. */
  datasetRid: string;
  /** The cut the chunks were generated on. */
  grid: CellGrid;
  /** Chunk path template; "{cell}" becomes "c000_r006". */
  pathTemplate?: string;
  /**
   * Manifest path inside the dataset, or null to skip looking for one.
   * Defaults to "manifest.json", and absence is not an error.
   */
  manifestPath?: string | null;
  /** Overrides both the manifest's and the chunk's own nodata declaration. */
  nodata?: number;
}

export const DEFAULT_PATH_TEMPLATE = "{cell}.tif";

export interface DemIndex {
  readonly grid: CellGrid;
  /** Path of a cell's chunk within the dataset. */
  pathFor(cell: CellCoord): string;
  /**
   * Whether the cell exists.
   *
   * `undefined` means "unknown" — there is no manifest, so the only way to
   * find out is to ask. Callers must treat unknown as "worth trying", and
   * false as "do not bother".
   */
  has(cell: CellCoord): boolean | undefined;
  bytesFor(cell: CellCoord): number | undefined;
  rangeFor(cell: CellCoord): { min?: number; max?: number } | undefined;
  /** Every cell the manifest declares, or undefined without one. */
  cells(): CellCoord[] | undefined;
  /** Declared nodata, if the store or manifest names one. */
  readonly nodata: number | undefined;
  /** What the manifest said about the DEM itself, for diagnostics. */
  readonly meta: DemManifest["dem"];
}

/**
 * Read the store's manifest, if it has one, and build the index.
 *
 * Also settles the transfer mode (ranged vs whole-file) against the manifest —
 * a small file — for the reason the basemap's tile source does: left to the
 * first chunk, a screenful of DEM tiles each probe independently and each probe
 * is answered with a full copy of the same 20 MB chunk.
 */
export async function loadDemIndex(store: DemStore): Promise<DemIndex> {
  const template = store.pathTemplate ?? DEFAULT_PATH_TEMPLATE;
  const manifestPath =
    store.manifestPath === null ? null : (store.manifestPath ?? "manifest.json");

  if (manifestPath) {
    await settleRangeMode(store.datasetRid, manifestPath).catch(
      () => undefined,
    );
  }

  const manifest = manifestPath
    ? await readManifest(store.datasetRid, manifestPath)
    : null;

  if (manifest) {
    assertGridAgrees(store.grid, manifest);
  }

  const declared = manifest?.cells
    ? new Map(
        manifest.cells.map((entry) => {
          const cell = normaliseCell(entry);
          return [cellKey(cell.col, cell.row), cell] as const;
        }),
      )
    : null;

  // A declared cell whose bounds disagree with the grid means one of the two
  // cuts was regenerated on a different origin. Every sample would be up to 2°
  // adrift — a failure that looks like slightly wrong terrain rather than an
  // error, so it is checked once, here, and thrown.
  if (declared) {
    for (const cell of declared.values()) {
      if (!cell.bounds) {continue;}
      const problem = gridMismatch(store.grid, cell, cell.bounds);
      if (problem) {throw new Error(`decho-elevation: ${problem}`);}
    }
  }

  const nodata = store.nodata ?? manifest?.dem?.nodata;
  const pathTemplate = manifest?.pathTemplate ?? template;

  return {
    grid: store.grid,

    pathFor: (cell) =>
      pathTemplate.replace("{cell}", cellKey(cell.col, cell.row)),

    has: (cell) =>
      declared ? declared.has(cellKey(cell.col, cell.row)) : undefined,

    bytesFor: (cell) => declared?.get(cellKey(cell.col, cell.row))?.bytes,

    rangeFor: (cell) => {
      const entry = declared?.get(cellKey(cell.col, cell.row));
      if (!entry) {return undefined;}
      return { min: entry.min, max: entry.max };
    },

    cells: () =>
      declared
        ? [...declared.values()].map(({ col, row }) => ({ col, row }))
        : undefined,

    nodata,
    meta: manifest?.dem,
  };
}

async function readManifest(
  datasetRid: string,
  path: string,
): Promise<DemManifest | null> {
  let bytes: ArrayBuffer | null;
  try {
    bytes = await getFileOptional(datasetRid, path);
  } catch (err) {
    // Not fatal: no manifest is a supported state, and a store whose dataset is
    // unreadable will say so far more clearly on the first chunk.
    console.warn(
      `[decho-elevation] could not read ${path} from ${datasetRid}; ` +
        "continuing without a manifest",
      err,
    );
    return null;
  }
  if (!bytes) {return null;}

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as DemManifest;
  } catch (err) {
    // A manifest that exists and does not parse IS worth shouting about: it
    // means someone wrote one and it is broken, which is different from there
    // never having been one.
    throw new Error(
      `decho-elevation: ${path} in ${datasetRid} is not valid JSON: ${String(err)}`,
    );
  }
}

function normaliseCell(
  entry: [number, number] | DemManifestCell,
): DemManifestCell {
  return Array.isArray(entry)
    ? { col: entry[0], row: entry[1] }
    : entry;
}

function assertGridAgrees(grid: CellGrid, manifest: DemManifest): void {
  const problems: string[] = [];
  if (
    manifest.gridOrigin &&
    (manifest.gridOrigin.lon !== grid.originLon ||
      manifest.gridOrigin.lat !== grid.originLat)
  ) {
    problems.push(
      `gridOrigin (${manifest.gridOrigin.lon}, ${manifest.gridOrigin.lat}) ` +
        `against the store's (${grid.originLon}, ${grid.originLat})`,
    );
  }
  if (manifest.cellDeg !== undefined && manifest.cellDeg !== grid.cellDeg) {
    problems.push(
      `cellDeg ${manifest.cellDeg} against the store's ${grid.cellDeg}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `decho-elevation: the DEM manifest disagrees with the configured grid — ` +
        `${problems.join("; ")}. One of the two was regenerated; every sample ` +
        "would be offset by whole cells.",
    );
  }
}
