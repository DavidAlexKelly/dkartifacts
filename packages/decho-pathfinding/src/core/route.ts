/**
 * A* over the stitched world, loading cells as the frontier reaches them.
 *
 * WHY A* AND NOT DIJKSTRA
 * -----------------------
 * A 200 km route over a 1500 m grid is ~130 000 nodes in the corridor and
 * millions in the disc Dijkstra would settle. The heuristic is what keeps the
 * search inside a corridor, which matters twice over here: expanded nodes cost
 * time, but they also drag CELLS across the network, and Dijkstra would
 * cheerfully download a ring of them in every direction.
 *
 * ADMISSIBILITY IS LOAD-BEARING
 * -----------------------------
 * Cost is in metre-equivalents (`dist * slopeFactor * terrainMultiplier`), so
 * the heuristic must be great-circle distance multiplied by the CHEAPEST
 * per-metre cost the profile can produce — `compileProfile` derives exactly
 * that, from the same floor the cost function clamps to. Anything larger stops
 * the route being the cheapest one; the escape hatch is explicit
 * (`heuristicWeight`), so trading optimality for speed is a decision rather
 * than an accident.
 *
 * WHY THE LOOP IS ASYNC
 * ---------------------
 * The graph does not fit in memory and is not all local. When the frontier
 * reaches a node on a cell boundary, the search awaits that neighbour before
 * expanding it. `pendingNeighbourCells` answers "is that necessary?" with one
 * array read, so the await is skipped for the overwhelming majority of nodes,
 * and the corridor prefetch fired at the start means the ones that remain are
 * usually already in the byte layer's cache.
 *
 * THE CELL BUDGET IS SPENT ON TRAVERSAL, NOT ON LOADING
 * -----------------------------------------------------
 * Counting loads made `maxCells` depend on what was already cached: a cell
 * warmed by prefetch was free, and a cell probed and found absent was charged.
 * Counting entries makes it mean what it says, and makes the same route behave
 * the same way warm or cold — which is also what makes it testable.
 */

import { abortError } from "@acc/decho-foundry-bytes";

import { NoNodeNearbyError, NoRouteError } from "./errors";
import { haversineM } from "./geo";
import { cellsAlongLine } from "./grid";
import { createMinHeap } from "./heap";
import {
  compileProfile,
  edgeCost,
  edgeSeconds,
  DEFAULT_PROFILE,
  type CompiledProfile,
  type VehicleProfile,
} from "./profiles";
import { simplifyPath, type Waypoint } from "./simplify";
import { NODE_SLOT_BITS, type GraphSource } from "./graphSource";

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface RouteOptions {
  profile?: VehicleProfile;
  signal?: AbortSignal;
  /** How far from the clicked point a node may be and still be used. */
  snapRadiusM?: number;
  /**
   * Ceiling on cells one route may SPAN. Clamped to what stays resident.
   *
   * Counted on traversal, not on loading: a cell probed and found absent, or
   * warmed by prefetch and never entered, does not spend the budget.
   */
  maxCells?: number;
  maxExpandedNodes?: number;
  timeBudgetMs?: number;
  /** > 1 trades optimality for speed. 1 keeps the result provably cheapest. */
  heuristicWeight?: number;
  /** 0 disables simplification. Defaults to a third of the node spacing. */
  simplifyToleranceM?: number;
  /** Cells either side of the straight line to warm up front. */
  prefetchPadCells?: number;
}

export interface RouteResult {
  /** [lat, lon] pairs — directly assignable to an OrderRoute. */
  waypoints: Waypoint[];
  /** True ground distance along the path. */
  distanceM: number;
  /** Cost in metre-equivalents: what the search actually minimised. */
  costM: number;
  /** Seconds, when the profile declares speeds. */
  etaS: number | null;
  /** Cells the route was allowed to walk, for HUDs and diagnostics. */
  cells: string[];
  /** True when a budget stopped the search from considering more cells. */
  truncated: boolean;
  stats: {
    expanded: number;
    ms: number;
    waypointsBeforeSimplify: number;
  };
}

const DEFAULTS = {
  snapRadiusM: 5000,
  maxCells: 16,
  maxExpandedNodes: 2_000_000,
  timeBudgetMs: 15_000,
  heuristicWeight: 1,
  prefetchPadCells: 0,
};

/** How often to check for cancellation. Cheap, but not free, per expansion. */
const ABORT_CHECK_INTERVAL = 512;

export async function findRoute(
  source: GraphSource,
  from: GeoPoint,
  to: GeoPoint,
  options: RouteOptions = {},
): Promise<RouteResult> {
  const startedAt = Date.now();
  const signal = options.signal;
  const snapRadiusM = options.snapRadiusM ?? DEFAULTS.snapRadiusM;
  const heuristicWeight = options.heuristicWeight ?? DEFAULTS.heuristicWeight;
  const maxExpanded = options.maxExpandedNodes ?? DEFAULTS.maxExpandedNodes;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULTS.timeBudgetMs;
  const maxCells = Math.min(
    options.maxCells ?? DEFAULTS.maxCells,
    source.maxResidentCells,
  );

  const throwIfAborted = () => {
    if (signal?.aborted) {throw abortError();}
  };

  throwIfAborted();

  // ── Endpoints ─────────────────────────────────────────────────────────────

  const [startCell, goalCell] = await Promise.all([
    source.cellAt(from.lon, from.lat, signal),
    source.cellAt(to.lon, to.lat, signal),
  ]);

  const startLocal = startCell.nearest(from.lon, from.lat, snapRadiusM);
  if (startLocal < 0) {
    throw new NoNodeNearbyError(from.lon, from.lat, snapRadiusM);
  }
  const goalLocal = goalCell.nearest(to.lon, to.lat, snapRadiusM);
  if (goalLocal < 0) {
    throw new NoNodeNearbyError(to.lon, to.lat, snapRadiusM);
  }

  const startNode = startCell.base + startLocal;
  const goalNode = goalCell.base + goalLocal;

  const profile = compileProfile(
    options.profile ?? DEFAULT_PROFILE,
    Math.min(startCell.graph.maxSlope, goalCell.graph.maxSlope),
  );

  // Cells the search may walk and — because their slots are baked into every
  // node id in the open set — cells that must not be evicted while it does.
  // Pins are released in the finally below, on every exit path.
  const cellsUsed = new Set<string>([startCell.key, goalCell.key]);
  for (const key of cellsUsed) {source.pin(key);}

  const useCell = (key: string): boolean => {
    if (cellsUsed.has(key)) {return true;}
    if (cellsUsed.size >= maxCells) {return false;}
    cellsUsed.add(key);
    source.pin(key);
    return true;
  };

  try {
    // Warm the corridor while the user is still letting go of the mouse. Fire
    // and forget: the search awaits what it actually needs, and this only
    // decides whether those awaits are cache hits.
    const corridor = cellsAlongLine(
      source.store.grid,
      { lon: from.lon, lat: from.lat },
      { lon: to.lon, lat: to.lat },
      options.prefetchPadCells ?? DEFAULTS.prefetchPadCells,
    ).slice(0, maxCells);
    if (corridor.length > 2) {source.prefetch(corridor);}

    if (startNode === goalNode) {
      return {
        waypoints: [
          [from.lat, from.lon],
          [to.lat, to.lon],
        ],
        distanceM: haversineM(from.lon, from.lat, to.lon, to.lat),
        costM: 0,
        etaS: profile.speeds ? 0 : null,
        cells: [...cellsUsed],
        truncated: false,
        stats: {
          expanded: 0,
          ms: Date.now() - startedAt,
          waypointsBeforeSimplify: 2,
        },
      };
    }

    // ── Search ──────────────────────────────────────────────────────────────

    const goalLon = source.nodeLon(goalNode);
    const goalLat = source.nodeLat(goalNode);

    const heuristic = (node: number): number =>
      haversineM(source.nodeLon(node), source.nodeLat(node), goalLon, goalLat) *
      profile.minCostPerMetre *
      heuristicWeight;

    const open = createMinHeap(4096);
    const gScore = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const closed = new Set<number>();

    gScore.set(startNode, 0);
    open.push(heuristic(startNode), startNode);

    let expanded = 0;
    let truncated = false;
    let found = false;

    while (open.size > 0) {
      const current = open.pop();
      if (closed.has(current)) {continue;}
      closed.add(current);

      if (current === goalNode) {
        found = true;
        break;
      }

      expanded += 1;
      if (expanded % ABORT_CHECK_INTERVAL === 0) {
        throwIfAborted();
        if (Date.now() - startedAt > timeBudgetMs) {
          throw new NoRouteError(
            "time-budget",
            `No route found within ${timeBudgetMs} ms (${expanded} nodes expanded). ` +
              "Raise timeBudgetMs, or route in shorter legs.",
          );
        }
      }
      if (expanded > maxExpanded) {
        throw new NoRouteError(
          "node-budget",
          `No route found within ${maxExpanded} expanded nodes. ` +
            "The endpoints may be in disconnected regions.",
        );
      }

      // Pull in neighbouring cells before expanding a border node, so this
      // node is only ever closed once, with all of its edges visible. Cells
      // that cannot be entered under the budget are not worth downloading.
      for (const coord of source.pendingNeighbourCells(current)) {
        if (cellsUsed.size >= maxCells) {
          truncated = true;
          continue;
        }
        await source.ensureCell(coord, signal);
      }

      const currentG = gScore.get(current) as number;
      const currentSlot = current >>> NODE_SLOT_BITS;

      source.forEachNeighbour(current, (neighbour, distM, slope, terrain) => {
        if (closed.has(neighbour)) {return;}

        // Crossing into another cell spends the budget. The shift makes the
        // common case — a neighbour in the same cell — one integer compare.
        if (neighbour >>> NODE_SLOT_BITS !== currentSlot) {
          const other = source.cellOf(neighbour);
          if (!other || !useCell(other.key)) {
            truncated = true;
            return;
          }
        }

        const step = edgeCost(profile, distM, slope, terrain);
        if (!Number.isFinite(step)) {return;}
        const tentative = currentG + step;
        const known = gScore.get(neighbour);
        if (known !== undefined && known <= tentative) {return;}
        gScore.set(neighbour, tentative);
        cameFrom.set(neighbour, current);
        open.push(tentative + heuristic(neighbour), neighbour);
      });
    }

    if (!found) {
      throw new NoRouteError(
        truncated ? "cell-budget" : "disconnected",
        truncated
          ? `No route within ${maxCells} cells — the endpoints are probably ` +
            "further apart than one query should span. Raise maxCells, or route in legs."
          : "No route: the endpoints are in regions the graph does not connect " +
            "(water, an impassable barrier, or opposite sides of a coverage gap).",
      );
    }

    // ── Reconstruct ─────────────────────────────────────────────────────────

    const nodes: number[] = [goalNode];
    for (let node = goalNode; node !== startNode; ) {
      const previous = cameFrom.get(node);
      if (previous === undefined) {break;}
      nodes.push(previous);
      node = previous;
    }
    nodes.reverse();

    let distanceM = 0;
    let etaS = 0;
    const raw: Waypoint[] = [];
    for (let i = 0; i < nodes.length; i++) {
      raw.push([source.nodeLat(nodes[i]), source.nodeLon(nodes[i])]);
      if (i === 0) {continue;}
      const edge = cheapestEdge(source, profile, nodes[i - 1], nodes[i]);
      if (edge) {
        distanceM += edge.distM;
        etaS += edgeSeconds(profile, edge.distM, edge.slope, edge.terrain);
      } else {
        // Unreachable — the edge was traversed a moment ago — but a missing
        // edge must not silently understate the distance being reported.
        distanceM += haversineM(raw[i - 1][1], raw[i - 1][0], raw[i][1], raw[i][0]);
      }
    }

    const tolerance =
      options.simplifyToleranceM ?? startCell.graph.spacingM / 3;
    const waypoints = simplifyPath(raw, tolerance);

    return {
      waypoints,
      distanceM,
      costM: gScore.get(goalNode) ?? 0,
      etaS: profile.speeds ? etaS : null,
      cells: [...cellsUsed],
      truncated,
      stats: {
        expanded,
        ms: Date.now() - startedAt,
        waypointsBeforeSimplify: raw.length,
      },
    };
  } finally {
    source.cancelPrefetch();
    for (const key of cellsUsed) {source.unpin(key);}
  }
}

/**
 * The edge the search would have taken between two adjacent path nodes.
 *
 * Parallel edges are legal (an intra-cell edge and a stitch link can join the
 * same pair), so this takes the cheapest under the profile in force — the same
 * one the search costed.
 */
function cheapestEdge(
  source: GraphSource,
  profile: CompiledProfile,
  from: number,
  to: number,
): { distM: number; slope: number; terrain: number } | null {
  let best: { distM: number; slope: number; terrain: number } | null = null;
  let bestCost = Infinity;

  source.forEachNeighbour(from, (neighbour, distM, slope, terrain) => {
    if (neighbour !== to) {return;}
    const cost = edgeCost(profile, distM, slope, terrain);
    if (cost < bestCost) {
      bestCost = cost;
      best = { distM, slope, terrain };
    }
  });

  return best;
}
