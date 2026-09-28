/**
 * Warm the cells under the viewport, so the first route in an area is instant.
 *
 * WHY THIS IS OPT-IN, AND OFF BY DEFAULT
 * --------------------------------------
 * Routing already warms the corridor between the two points it was given, which
 * is the cheapest possible speculation: it downloads only what a search is
 * about to need. This warms cells the user has merely LOOKED at, which is a
 * different trade — it makes the first click feel instant, and it spends
 * megabytes on someone who may never route at all.
 *
 * That is worth it for a planning screen where routing is the point, and wrong
 * for a map that happens to have routing available, so it is a call the
 * application makes rather than a default.
 *
 * THE ZOOM GUARD IS THE IMPORTANT PART
 * ------------------------------------
 * A 2° cell is a continent at low zoom: at z4 the viewport spans dozens of
 * them, and prefetching that is neither useful (nobody routes across a
 * continent in one query) nor affordable. So nothing happens until the view is
 * small enough to cover a handful of cells, and even then the count is capped.
 *
 * Structurally typed, like everything else in this entry point: no maplibre-gl
 * import, so a caller with a different map library can still use it.
 */

import { cellsInBounds, type CellCoord } from "../core/grid";
import type { GraphSource } from "../core/graphSource";

/** The slice of maplibregl.Map this module uses. */
export interface PrefetchableMap {
  getZoom(): number;
  getBounds(): {
    getWest(): number;
    getSouth(): number;
    getEast(): number;
    getNorth(): number;
  };
  on(type: string, listener: () => void): unknown;
  off(type: string, listener: () => void): unknown;
}

export interface ViewportPrefetchOptions {
  /** Do nothing below this zoom. A 2° cell is enormous when zoomed out. */
  minZoom?: number;
  /** Cells beyond the viewport edge to include. */
  ring?: number;
  /** Never warm more than this many cells for one view. */
  maxCells?: number;
  /** Settle time after the last movement, in ms. */
  debounceMs?: number;
}

const DEFAULTS = {
  minZoom: 8,
  ring: 0,
  maxCells: 6,
  debounceMs: 400,
};

/**
 * Start warming cells as the map moves. Returns a detach function.
 *
 * Debounced for the same reason the basemap debounces its own prefetch:
 * MapLibre fires moveend and zoomend for the same gesture, and a pan across
 * three cells should warm the destination rather than everything on the way.
 */
export function attachViewportPrefetch(
  map: PrefetchableMap,
  source: GraphSource,
  options: ViewportPrefetchOptions = {},
): () => void {
  const minZoom = options.minZoom ?? DEFAULTS.minZoom;
  const ring = options.ring ?? DEFAULTS.ring;
  const maxCells = Math.min(
    options.maxCells ?? DEFAULTS.maxCells,
    // Never warm more than stays resident: the last cells in would evict the
    // first, and the whole exercise would be network traffic for nothing.
    source.maxResidentCells,
  );
  const debounceMs = options.debounceMs ?? DEFAULTS.debounceMs;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    timer = null;
    if (map.getZoom() < minZoom) {return;}

    const bounds = map.getBounds();
    const cells: CellCoord[] = cellsInBounds(
      source.store.grid,
      {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      },
      ring,
    );

    // Too many cells in view means the user is looking at a region, not a
    // route. Warming a slice of it would be arbitrary, so warm none of it.
    if (cells.length === 0 || cells.length > maxCells) {return;}

    // Already-resident and known-absent cells are filtered by the source, and
    // the byte layer de-duplicates anything a search is concurrently loading.
    source.prefetch(cells);
  };

  const onMoved = () => {
    if (timer) {clearTimeout(timer);}
    timer = setTimeout(run, debounceMs);
  };

  map.on("moveend", onMoved);
  map.on("zoomend", onMoved);

  return () => {
    if (timer) {clearTimeout(timer);}
    map.off("moveend", onMoved);
    map.off("zoomend", onMoved);
    source.cancelPrefetch();
  };
}
