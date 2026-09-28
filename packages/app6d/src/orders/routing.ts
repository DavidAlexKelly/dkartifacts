/**
 * Routing is injected, not implemented.
 *
 * Real routing in this estate means terrain rasters, tiled pathfinding graphs
 * and mobility classes — all of it enrollment-specific, dataset-backed and far
 * heavier than a map component should carry. So this package declares the
 * smallest interface it needs and draws a straight line when nothing is
 * supplied. An application that already has a router passes it in and gets
 * terrain-following orders; one that does not still gets a working map.
 */

import type { LatLng, MilOrderDef, OrderRoute, PlacedMilUnit } from "./types";

export interface OrderRouteRequest {
  from: LatLng;
  to: LatLng;
  /** The unit being ordered — routers usually key mobility off it. */
  unit: PlacedMilUnit;
  /** The order being assigned, in case the router treats tasks differently. */
  order: MilOrderDef;
}

export interface OrderRouter {
  /**
   * Returns a route, or null to mean "no route — fall back to a straight
   * line". May be async; the map shows a pending state while it resolves.
   */
  route(
    request: OrderRouteRequest,
  ): OrderRoute | null | Promise<OrderRoute | null>;
}

/**
 * The default: two waypoints, unit to objective.
 *
 * Exported as a plain function as well as a router because `OrderRouter.route`
 * is deliberately allowed to be async — so through the interface its return
 * type is a union a caller has to await or narrow, which is noise for the one
 * implementation that is always synchronous.
 */
export function straightLineRoute({ from, to }: OrderRouteRequest): OrderRoute {
  return {
    waypoints: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
  };
}

export const straightLineRouter: OrderRouter = { route: straightLineRoute };

/**
 * Resolve a route, tolerating everything a host-supplied router can do wrong.
 *
 * A router that throws, hangs on a rejected promise, returns null or returns a
 * degenerate single-point path must not leave the user with a half-assigned
 * order — a straight line is always a defensible answer, and the caller can
 * tell the difference through `fallback`.
 */
export async function resolveRoute(
  router: OrderRouter | undefined,
  request: OrderRouteRequest,
): Promise<{ route: OrderRoute; fallback: boolean; error?: unknown }> {
  const straight = straightLineRoute(request);
  if (!router) {
    return { route: straight, fallback: false };
  }

  try {
    const result = await router.route(request);
    if (!result || result.waypoints.length < 2) {
      return { route: straight, fallback: true };
    }
    return { route: result, fallback: false };
  } catch (error) {
    return { route: straight, fallback: true, error };
  }
}

/**
 * `count` positions spaced evenly along the route by distance.
 *
 * Distance is measured in raw degrees rather than metres: this only ever
 * feeds screen projection for symbol placement, where the error over a single
 * order's span is invisible, and it keeps the package free of a geodesy
 * dependency.
 */
export function sampleRoute(route: OrderRoute, count: number): LatLng[] {
  const wp = route.waypoints;
  if (wp.length === 0 || count <= 0) {
    return [];
  }
  if (wp.length === 1 || count === 1) {
    return [{ lat: wp[0][0], lng: wp[0][1] }];
  }

  const cumulative = [0];
  for (let i = 1; i < wp.length; i++) {
    const dLat = wp[i][0] - wp[i - 1][0];
    const dLng = wp[i][1] - wp[i - 1][1];
    cumulative.push(cumulative[i - 1] + Math.hypot(dLat, dLng));
  }
  const total = cumulative[cumulative.length - 1];

  const out: LatLng[] = [];
  for (let i = 0; i < count; i++) {
    const target = (i / (count - 1)) * total;
    let seg = 0;
    while (seg < cumulative.length - 2 && cumulative[seg + 1] < target) {
      seg++;
    }
    const segLength = cumulative[seg + 1] - cumulative[seg];
    // A zero-length segment (duplicate waypoints, or a total of 0 because
    // every point is identical) would divide to NaN and silently poison the
    // params the symbol is saved with.
    const t = segLength > 0 ? (target - cumulative[seg]) / segLength : 0;
    out.push({
      lat: wp[seg][0] + t * (wp[seg + 1][0] - wp[seg][0]),
      lng: wp[seg][1] + t * (wp[seg + 1][1] - wp[seg][1]),
    });
  }
  return out;
}
