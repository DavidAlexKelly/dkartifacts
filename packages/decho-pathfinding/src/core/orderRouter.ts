/**
 * The adapter that makes this package an extension rather than an island.
 *
 * `@acc/app6d/orders` declares, and does not implement, an `OrderRouter`:
 *
 *   "Routing is injected, not implemented. Real routing in this estate means
 *    terrain rasters, tiled pathfinding graphs and mobility classes — all of it
 *    enrollment-specific, dataset-backed and far heavier than a map component
 *    should carry."
 *
 * This is that router. It is the whole integration: no new API on either side,
 * and `resolveRoute` in app6d keeps working with no router at all.
 *
 * WHY THE TYPES ARE STRUCTURAL AND NOT IMPORTED
 * ---------------------------------------------
 * Importing @acc/app6d here would make routing depend on military symbology,
 * which is backwards — pathfinding is useful to a logistics view, a medevac
 * planner or a plain basemap with two pins. TypeScript's structural typing
 * means an object of this shape satisfies app6d's `OrderRouter` without either
 * package knowing about the other, which is exactly the mix-and-match property
 * both are aiming for.
 *
 * The cost of structural coupling is that a change to app6d's interface shows
 * up here as a type error at the CALL SITE rather than in this file. The app
 * wires the two together, so that is where it belongs.
 */

import type { Pathfinder } from "./pathfinder.js";
import type { RouteOptions, RouteResult } from "./route.js";
import type { VehicleProfile } from "./profiles.js";

/** `LatLng` from @acc/app6d/orders. */
export interface LatLngLike {
  lat: number;
  lng: number;
}

/** `OrderRouteRequest` from @acc/app6d/orders, narrowed to what a router has to be given. */
export interface OrderRouteRequestLike {
  from: LatLngLike;
  to: LatLngLike;
  unit?: unknown;
  order?: unknown;
}

/** `OrderRoute` from @acc/app6d/orders. */
export interface OrderRouteLike {
  waypoints: [number, number][];
}

/** `OrderRouter` from @acc/app6d/orders. */
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
   * Called when routing fails. app6d's `resolveRoute` already degrades to a
   * straight line (it catches and sets `fallback`), so this exists to let the
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
        // Null rather than a rethrow: app6d's `resolveRoute` reads it as "no
        // route, draw the straight line", which is the correct outcome and already flagged to
        // the user through its own `fallback`.
        return null;
      }
    },
  };
}
