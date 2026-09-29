/**
 * Preset store for this enrollment.
 *
 * Exported rather than hidden, for the reason @acc/decho-basemap's defaults.ts
 * gives: the default should be discoverable and overridable. Every entry point
 * takes a store explicitly; this is only what gets used when none is supplied.
 *
 * The consuming application must ALSO grant access — `api:use-datasets-read`
 * on the OAuth client AND the dataset added as a Resource on the app in
 * Developer Console. The scopes alone return 403, and this is a different
 * dataset from the basemap's, so adding the basemap's Resource does not cover
 * it. That omission is the single most common way this package appears broken.
 */
import type { CellGrid } from "./grid.js";

export interface GraphStore {
  /** Dataset holding the per-cell chunks. */
  datasetRid: string;
  /** The cut these chunks were generated on. */
  grid: CellGrid;
  /**
   * Directory template for one cell; "{cell}" is replaced with "c000_r006".
   * The three files inside are named nodes.bin, edges.bin and meta.json.
   */
  pathTemplate?: string;
}

/**
 * "Pathfinding" in Offline World: 1500 m node grid, GLO90 elevations, water and
 * built-up areas removed, cut on the SAME 2° grid as the z12 layer of the
 * chunked planet basemap.
 */
export const PATHFINDING_STORE: GraphStore = {
  datasetRid: "ri.foundry.main.dataset.35f5ccc8-2cd1-4133-bb56-f87527ef314a",
  grid: { originLon: -180, originLat: 85, cellDeg: 2 },
  pathTemplate: "pathfinding/{cell}",
};

let defaultStore: GraphStore = PATHFINDING_STORE;

/** Override the preset, e.g. from an app's env vars. */
export function configureDefaultGraphStore(store: GraphStore): void {
  defaultStore = store;
}

export function defaultGraphStore(): GraphStore {
  return defaultStore;
}
