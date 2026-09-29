/**
 * A parsed cell, plus the two indexes the search needs from it.
 *
 * INDEX 1 — a uniform bucket grid, for snapping a clicked lon/lat to a node.
 * Linear scan is 22 000 haversines per click on a full land cell, per endpoint,
 * and the click is on the interaction path where latency is felt. Buckets make
 * it a handful.
 *
 * INDEX 2 — border bands: the nodes lying within about one node spacing of each
 * of the four cell edges, sorted along that edge. Cross-cell stitching (see
 * stitch.ts) is a merge over these, not a scan over every node, and the
 * per-node `borderMask` lets the A* loop ask "does expanding this node require
 * a neighbouring cell?" with a single array read rather than four comparisons.
 *
 * Both are built once, when the cell is parsed, and both are small: a few
 * hundred KB against a graph of a few MB.
 */

import type { CellGraph } from "./format.js";
import {
  haversineM,
  metresPerLatDegree,
  metresPerLonDegree,
} from "./geo.js";
import { SIDES, SIDE_EAST, SIDE_NORTH, SIDE_SOUTH, SIDE_WEST, type Side } from "./grid.js";

/** Widest bucket grid per axis. Bounds memory on a cell with a tiny spacing. */
const MAX_BUCKETS_PER_AXIS = 256;

/**
 * How far from an edge a node still counts as a border node, in node spacings.
 *
 * 1.0 would be exactly right if both cells' grids were in phase. They are
 * generated per cell and nothing promises that, so the band is widened to
 * catch a neighbour that is up to one full spacing out of step — the same
 * slack stitch.ts uses when it decides which pairs to link.
 */
const BORDER_BAND_SPACINGS = 1.25;

export interface BorderBand {
  /** Node indices in the band, sorted by their coordinate ALONG the edge. */
  readonly nodes: Int32Array;
  /** The along-edge coordinate of each entry, in degrees. Parallel to `nodes`. */
  readonly along: Float64Array;
}

export interface LoadedCell {
  readonly graph: CellGraph;
  readonly key: string;
  readonly col: number;
  readonly row: number;
  /**
   * Global id offset. A node's global id is `base + localIndex`, which keeps
   * the search's maps and heap on plain integers rather than strings.
   */
  readonly base: number;
  /** Bit (1 << side) set for nodes near that edge. Zero for the interior. */
  readonly borderMask: Uint8Array;
  readonly bands: Record<Side, BorderBand>;
  /** Nearest node to a point, or -1 if none within `maxM`. Local index. */
  nearest(lon: number, lat: number, maxM: number): number;
}

export function createLoadedCell(graph: CellGraph, base: number): LoadedCell {
  const { bbox, nodeCount, lon, lat } = graph;

  // ── Bucket grid ────────────────────────────────────────────────────────────

  const spanLon = bbox.east - bbox.west;
  const spanLat = bbox.north - bbox.south;
  const midLat = (bbox.north + bbox.south) / 2;

  const bucketDegLat = Math.max(
    spanLat / MAX_BUCKETS_PER_AXIS,
    graph.spacingM / metresPerLatDegree(),
  );
  const bucketDegLon = Math.max(
    spanLon / MAX_BUCKETS_PER_AXIS,
    graph.spacingM / metresPerLonDegree(midLat),
  );

  const nx = Math.max(1, Math.min(MAX_BUCKETS_PER_AXIS, Math.ceil(spanLon / bucketDegLon)));
  const ny = Math.max(1, Math.min(MAX_BUCKETS_PER_AXIS, Math.ceil(spanLat / bucketDegLat)));

  const bucketOf = (pointLon: number, pointLat: number) => {
    const bx = Math.min(
      nx - 1,
      Math.max(0, Math.floor(((pointLon - bbox.west) / spanLon) * nx)),
    );
    const by = Math.min(
      ny - 1,
      Math.max(0, Math.floor(((bbox.north - pointLat) / spanLat) * ny)),
    );
    return { bx, by };
  };

  // CSR again, for the same reason as the edges: nx*ny arrays-of-arrays is a
  // lot of objects for something rebuilt on every cell load.
  const bucketStart = new Uint32Array(nx * ny + 1);
  for (let i = 0; i < nodeCount; i++) {
    const { bx, by } = bucketOf(lon[i], lat[i]);
    bucketStart[by * nx + bx + 1] += 1;
  }
  for (let b = 0; b < nx * ny; b++) {
    bucketStart[b + 1] += bucketStart[b];
  }
  const bucketNodes = new Uint32Array(nodeCount);
  {
    const cursor = bucketStart.slice(0, nx * ny);
    for (let i = 0; i < nodeCount; i++) {
      const { bx, by } = bucketOf(lon[i], lat[i]);
      bucketNodes[cursor[by * nx + bx]++] = i;
    }
  }

  const bucketSpanM = Math.min(
    (spanLat / ny) * metresPerLatDegree(),
    (spanLon / nx) * metresPerLonDegree(midLat),
  );

  const nearest = (pointLon: number, pointLat: number, maxM: number): number => {
    const { bx, by } = bucketOf(pointLon, pointLat);
    const maxRings = Math.max(
      1,
      Math.min(
        Math.max(nx, ny),
        Math.ceil(maxM / Math.max(1, bucketSpanM)) + 1,
      ),
    );

    let best = -1;
    let bestM = maxM;

    for (let ring = 0; ring <= maxRings; ring++) {
      // Once a hit is in hand, one more ring is enough: nothing beyond it can
      // be closer than the ring distance already exceeded.
      if (best >= 0 && (ring - 1) * bucketSpanM > bestM) {break;}

      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          // Only the shell, not the filled square — the interior was covered
          // by previous rings.
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) {
            continue;
          }
          const cx = bx + dx;
          const cy = by + dy;
          if (cx < 0 || cy < 0 || cx >= nx || cy >= ny) {continue;}
          const b = cy * nx + cx;
          for (let s = bucketStart[b]; s < bucketStart[b + 1]; s++) {
            const node = bucketNodes[s];
            const d = haversineM(pointLon, pointLat, lon[node], lat[node]);
            if (d < bestM) {
              bestM = d;
              best = node;
            }
          }
        }
      }
    }
    return best;
  };

  // ── Border bands ───────────────────────────────────────────────────────────

  const bandLat = (graph.spacingM * BORDER_BAND_SPACINGS) / metresPerLatDegree();
  const bandLon =
    (graph.spacingM * BORDER_BAND_SPACINGS) / metresPerLonDegree(midLat);

  const borderMask = new Uint8Array(nodeCount);
  const collected: Record<Side, number[]> = {
    [SIDE_WEST]: [],
    [SIDE_EAST]: [],
    [SIDE_SOUTH]: [],
    [SIDE_NORTH]: [],
  };

  for (let i = 0; i < nodeCount; i++) {
    if (lon[i] - bbox.west <= bandLon) {
      borderMask[i] |= 1 << SIDE_WEST;
      collected[SIDE_WEST].push(i);
    }
    if (bbox.east - lon[i] <= bandLon) {
      borderMask[i] |= 1 << SIDE_EAST;
      collected[SIDE_EAST].push(i);
    }
    if (lat[i] - bbox.south <= bandLat) {
      borderMask[i] |= 1 << SIDE_SOUTH;
      collected[SIDE_SOUTH].push(i);
    }
    if (bbox.north - lat[i] <= bandLat) {
      borderMask[i] |= 1 << SIDE_NORTH;
      collected[SIDE_NORTH].push(i);
    }
  }

  const bands = {} as Record<Side, BorderBand>;
  for (const side of SIDES) {
    // West and east edges run north-south, so "along" is latitude; south and
    // north edges run east-west, so it is longitude.
    const alongLat = side === SIDE_WEST || side === SIDE_EAST;
    const indices = collected[side];
    indices.sort((a, b) => (alongLat ? lat[a] - lat[b] : lon[a] - lon[b]));
    const along = new Float64Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
      along[i] = alongLat ? lat[indices[i]] : lon[indices[i]];
    }
    bands[side] = { nodes: Int32Array.from(indices), along };
  }

  return {
    graph,
    key: graph.key,
    col: graph.col,
    row: graph.row,
    base,
    borderMask,
    bands,
    nearest,
  };
}
