/**
 * The adapter that makes this package an extension rather than an island.
 *
 * @acc/decho-mil-map declares, and does not implement, an `OrderRouter`:
 *
 *   "Routing is injected, not implemented. Real routing in this estate means
 *    terrain rasters, tiled pathfinding graphs and mobility classes — all of it
 *    enrollment-specific, dataset-backed and far heavier than a map component
 *    should carry."
 *
 * This is that router. It is the whole integration: no new API on either side,
 * and mil-map keeps working with no router at all.
 *
 * WHY THE TYPES ARE STRUCTURAL AND NOT IMPORTED
 * ---------------------------------------------
 * Importing @acc/decho-mil-map here would make routing depend on the military
 * map, which is backwards — pathfinding is useful to a logistics view, a
 * medevac planner or a plain basemap with two pins. TypeScript's structural
 * typing means an object of this shape satisfies mil-map's `OrderRouter`
 * without either package knowing about the other, which is exactly the
 * mix-and-match property both are aiming for.
 *
 * The cost of structural coupling is that a change to mil-map's interface
 * shows up here as a type error at the CALL SITE rather than in this file. The
 * app wires the two together, so that is where it belongs.
 */

import type { Pathfinder } from "./pathfinder";
import type { RouteOptions, RouteResult } from "./route";
import type { VehicleProfile } from "./profiles";

/** mil-map's LatLng. */
export interface LatLngLike {
  lat: number;
  lng: number;
}

/** mil-map's OrderRouteRequest, narrowed to what a router has to be given. */
export interface OrderRouteRequestLike {
  from: LatLngLike;
  to: LatLngLike;
  unit?: unknown;
  order?: unknown;
}

/** mil-map's OrderRoute. */
export interface OrderRouteLike {
  waypoints: [number, number][];
}

/** mil-map's OrderRouter. */
export interface OrderRouterLike {
  route(
    request: OrderRouteRequestLike,
  ): OrderRouteLike | null | Promise<OrderRouteLike | null>;
}

export interface OrderRouterOptions {
  /**
   * Mobility class per request. The obvious implementation keys off
   * `request.unit` — which is why the request is passed through rather than
   * reduced to two coordinates.
   */
  profileFor?: (request: OrderRouteRequestLike) => VehicleProfile | undefined;
  /** Per-request overrides: budgets, snap radius, simplification. */
  routeOptions?: (request: OrderRouteRequestLike) => RouteOptions | undefined;
  /** Called on success — a HUD showing distance, ETA and cells touched. */
  onResult?: (result: RouteResult, request: OrderRouteRequestLike) => void;
  /**
   * Called when routing fails. mil-map already degrades to a straight line
   * (`resolveRoute` catches and sets `fallback`), so this exists to let the
   * app SAY that it happened rather than to change what is drawn.
   */
  onError?: (error: unknown, request: OrderRouteRequestLike) => void;
}

export function createOrderRouter(
  pathfinder: Pathfinder,
  options: OrderRouterOptions = {},
): OrderRouterLike {
  return {
    async route(request) {
      try {
        const result = await pathfinder.route(
          { lat: request.from.lat, lon: request.from.lng },
          { lat: request.to.lat, lon: request.to.lng },
          {
            profile: options.profileFor?.(request),
            ...options.routeOptions?.(request),
          },
        );
        options.onResult?.(result, request);
        return { waypoints: result.waypoints };
      } catch (error) {
        // Cancellation is the host changing its mind, not a routing failure,
        // and must not be reported as one.
        if (error instanceof Error && error.name === "AbortError") {return null;}
        options.onError?.(error, request);
        // Null rather than a rethrow: mil-map reads it as "no route, draw the
        // straight line", which is the correct outcome and already flagged to
        // the user through its own `fallback`.
        return null;
      }
    },
  };
}
