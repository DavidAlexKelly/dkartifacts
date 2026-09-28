/**
 * Joining adjacent cells at runtime.
 *
 * WHY THIS HAS TO EXIST
 * ---------------------
 * Node indices in edges.bin are u32 and CELL-LOCAL, and no cell contains an
 * edge leaving it. Loaded side by side, the cells are therefore disjoint graphs
 * that merely happen to be adjacent on a map, and any route crossing a cell
 * boundary is impossible until something joins them. Emitting halo edges in the
 * generator would make this exact and free; the format is fixed, so the join is
 * reconstructed here.
 *
 * HOW
 * ---
 * Each cell knows the nodes within ~1.25 spacings of each edge, sorted along
 * that edge (see cell.ts). Two adjacent cells are joined by walking one band
 * against the other — a merge, not a cross product — and linking each node to
 * its nearest few counterparts within a radius.
 *
 * THE RADIUS IS MEASURED, NOT ASSUMED
 * -----------------------------------
 * The obvious radius is a small multiple of the declared `spacing_m`, and the
 * first version of this file used exactly that. It produced ZERO links between
 * vertically adjacent cells whose lattice was anisotropic — the across-seam gap
 * was twice the declared spacing — and the failure was silent: routing simply
 * stopped at the boundary, with no error anywhere, as though the terrain were
 * impassable.
 *
 * That is the worst failure this package can have, so the radius now falls back
 * to what the data actually shows: if the nominal radius links nothing, the
 * closest real pair across the seam sets the radius instead, up to a hard limit
 * that keeps a genuine coverage gap from being bridged by an invented 50 km
 * edge. `effectiveRadiusM` reports which applied.
 *
 * WHAT IS NOT INVENTED
 * --------------------
 * `dist` is the real great-circle distance and `slope` the real gradient
 * between the two nodes' stored elevations — exactly the inputs the generator's
 * own cost model consumes. Only `terrain` is inferred, and generously: if BOTH
 * endpoints touch a road edge the link is a road, because a boundary that a
 * road crosses is precisely where an invented off-road penalty would send the
 * route on a visible detour.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * Diagonal (corner-to-corner) cells are not joined. Reaching a diagonal
 * neighbour means passing through one of the two cells they share an edge with,
 * which the search loads on demand anyway.
 */

import type { LoadedCell } from "./cell";
import { haversineM } from "./geo";
import { OPPOSITE, SIDE_EAST, SIDE_WEST, type Side } from "./grid";

export interface StitchLink {
  /** Node index in the OTHER cell. */
  readonly toLocal: number;
  readonly distM: number;
  readonly slope: number;
  readonly terrain: number;
}

export interface StitchOptions {
  /** Nominal link radius, in node spacings. */
  maxLinkSpacings?: number;
  /** Cap on links per border node — keeps a dense band from going quadratic. */
  maxLinksPerNode?: number;
  /**
   * Hard ceiling for the measured fallback, in node spacings. Beyond this the
   * cells are treated as genuinely unconnected rather than bridged.
   */
  fallbackMaxSpacings?: number;
}

export const DEFAULT_STITCH_OPTIONS: Required<StitchOptions> = {
  maxLinkSpacings: 1.6,
  maxLinksPerNode: 3,
  fallbackMaxSpacings: 6,
};

/** Links in both directions between one ordered pair of cells. */
export interface StitchResult {
  /** local node in `a` -> links into `b`. */
  readonly forward: Map<number, StitchLink[]>;
  /** local node in `b` -> links into `a`. */
  readonly backward: Map<number, StitchLink[]>;
  readonly linkCount: number;
  /** The radius that produced these links. */
  readonly effectiveRadiusM: number;
  /** True when the nominal radius found nothing and the measured one applied. */
  readonly widened: boolean;
}

const TERRAIN_ROAD = 2;
const TERRAIN_OPEN = 1;

/** Does any edge leaving this node run on `terrain`? Degree is ~8. */
function touches(cell: LoadedCell, node: number, terrain: number): boolean {
  const { offsets, edgeTerrain } = cell.graph;
  for (let e = offsets[node]; e < offsets[node + 1]; e++) {
    if (edgeTerrain[e] === terrain) {return true;}
  }
  return false;
}

/**
 * Stitch `a`'s `side` band to the facing band of `b`.
 *
 * Callers must pass genuinely adjacent cells; the caller (graphSource.ts)
 * derives `b`'s coordinates from `a` and the side, so there is nothing here a
 * mistake could get past.
 */
export function stitchCells(
  a: LoadedCell,
  side: Side,
  b: LoadedCell,
  options: StitchOptions = {},
): StitchResult {
  const { maxLinkSpacings, maxLinksPerNode, fallbackMaxSpacings } = {
    ...DEFAULT_STITCH_OPTIONS,
    ...options,
  };

  const bandA = a.bands[side];
  const bandB = b.bands[OPPOSITE[side]];

  const empty: StitchResult = {
    forward: new Map(),
    backward: new Map(),
    linkCount: 0,
    effectiveRadiusM: 0,
    widened: false,
  };

  if (bandA.nodes.length === 0 || bandB.nodes.length === 0) {return empty;}

  const spacingM = Math.min(a.graph.spacingM, b.graph.spacingM);
  const nominalRadiusM = spacingM * maxLinkSpacings;
  const hardLimitM = spacingM * fallbackMaxSpacings;
  const maxSlope = Math.min(a.graph.maxSlope, b.graph.maxSlope);

  const aGraph = a.graph;
  const bGraph = b.graph;

  // Degrees per metre along the seam, used only to narrow the candidate window
  // before the real distance test. Latitude degrees are constant; longitude
  // degrees are not, so the west/east case uses the tightest metres-per-degree
  // the seam will meet. Too generous costs a few extra haversines; too mean
  // drops real links, so it errs generous.
  const alongIsLat = side === SIDE_WEST || side === SIDE_EAST;
  const worstLat = Math.max(
    Math.abs(aGraph.bbox.north),
    Math.abs(aGraph.bbox.south),
  );
  const alongDegPerM = alongIsLat
    ? 1 / 111320
    : 1 / Math.max(1, 111320 * Math.cos((worstLat * Math.PI) / 180));

  /** First index in bandB whose along-coordinate is >= value. */
  const lowerBound = (value: number): number => {
    let lo = 0;
    let hi = bandB.along.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bandB.along[mid] < value) {lo = mid + 1;}
      else {hi = mid;}
    }
    return lo;
  };

  /** Visit every candidate in bandB within `radiusM` of a node in bandA. */
  const forEachCandidate = (
    indexA: number,
    radiusM: number,
    visit: (nodeB: number, distM: number) => void,
  ): void => {
    const nodeA = bandA.nodes[indexA];
    const alongA = bandA.along[indexA];
    const tolerance = radiusM * alongDegPerM;

    for (let j = lowerBound(alongA - tolerance); j < bandB.along.length; j++) {
      if (bandB.along[j] > alongA + tolerance) {break;}
      const nodeB = bandB.nodes[j];
      const d = haversineM(
        aGraph.lon[nodeA],
        aGraph.lat[nodeA],
        bGraph.lon[nodeB],
        bGraph.lat[nodeB],
      );
      if (d > radiusM || d <= 0) {continue;}
      visit(nodeB, d);
    }
  };

  const link = (radiusM: number): Omit<StitchResult, "effectiveRadiusM" | "widened"> => {
    const forward = new Map<number, StitchLink[]>();
    const backward = new Map<number, StitchLink[]>();
    let linkCount = 0;

    const candidateDist: number[] = [];
    const candidateNode: number[] = [];

    for (let i = 0; i < bandA.nodes.length; i++) {
      const nodeA = bandA.nodes[i];
      candidateDist.length = 0;
      candidateNode.length = 0;

      forEachCandidate(i, radiusM, (nodeB, distM) => {
        candidateNode.push(nodeB);
        candidateDist.push(distM);
      });
      if (candidateNode.length === 0) {continue;}

      // Nearest few only. Sorting indices rather than pairs keeps this
      // allocation-light; the arrays are single digits long in practice.
      const order = candidateNode
        .map((_, index) => index)
        .sort((x, y) => candidateDist[x] - candidateDist[y])
        .slice(0, maxLinksPerNode);

      for (const index of order) {
        const nodeB = candidateNode[index];
        const distM = candidateDist[index];

        const elevA = aGraph.elev[nodeA];
        const elevB = bGraph.elev[nodeB];
        const rise =
          Number.isFinite(elevA) && Number.isFinite(elevB) ? elevB - elevA : 0;
        const slope = rise / distM;

        // Hold synthetic edges to the standard the generator held its own to:
        // it never emitted anything steeper than max_slope, so neither do we.
        if (Math.abs(slope) > maxSlope) {continue;}

        const terrain =
          touches(a, nodeA, TERRAIN_ROAD) && touches(b, nodeB, TERRAIN_ROAD)
            ? TERRAIN_ROAD
            : TERRAIN_OPEN;

        push(forward, nodeA, { toLocal: nodeB, distM, slope, terrain });
        push(backward, nodeB, { toLocal: nodeA, distM, slope: -slope, terrain });
        linkCount += 1;
      }
    }

    return { forward, backward, linkCount };
  };

  const first = link(nominalRadiusM);
  if (first.linkCount > 0) {
    return { ...first, effectiveRadiusM: nominalRadiusM, widened: false };
  }

  // Nothing at the nominal radius. Measure the closest real pair before
  // concluding the cells do not touch.
  let closest = Infinity;
  for (let i = 0; i < bandA.nodes.length; i++) {
    forEachCandidate(i, hardLimitM, (_nodeB, distM) => {
      if (distM < closest) {closest = distM;}
    });
  }

  if (!Number.isFinite(closest)) {return empty;}

  const widenedRadiusM = Math.min(hardLimitM, closest * 1.35);
  const second = link(widenedRadiusM);
  if (second.linkCount === 0) {return empty;}

  console.warn(
    `[decho-pathfinding] ${a.key}/${b.key}: no cross-cell links at the nominal ` +
      `${Math.round(nominalRadiusM)} m; the closest pair across the seam is ` +
      `${Math.round(closest)} m, so the radius was widened to ` +
      `${Math.round(widenedRadiusM)} m. The declared spacing_m and the actual ` +
      "across-seam spacing disagree — worth checking the cut.",
  );

  return { ...second, effectiveRadiusM: widenedRadiusM, widened: true };
}

function push(map: Map<number, StitchLink[]>, key: number, link: StitchLink) {
  const existing = map.get(key);
  if (existing) {existing.push(link);}
  else {map.set(key, [link]);}
}
