/**
 * The one-liner layer: a graph source, a default profile, and a route().
 *
 * Same shape as the sibling packages — `createBasemap` over `createTileSource`
 * over the byte layer. Callers who want to own the cache, share one source
 * between several profiles, or drive prefetching from map movement use
 * `createGraphSource` and `findRoute` directly; everyone else wants this.
 */

import {
  createGraphSource,
  type GraphSource,
  type GraphSourceOptions,
} from "./graphSource";
import { findRoute, type GeoPoint, type RouteOptions, type RouteResult } from "./route";
import type { VehicleProfile } from "./profiles";

export interface PathfinderOptions extends GraphSourceOptions {
  /** Applied to every route that does not name its own. */
  profile?: VehicleProfile;
  /** Defaults for every route call; per-call options win. */
  routeDefaults?: Omit<RouteOptions, "signal" | "profile">;
}

export interface Pathfinder {
  /** The cell cache. Exposed for prefetching, stats and status listeners. */
  readonly source: GraphSource;
  route(
    from: GeoPoint,
    to: GeoPoint,
    options?: RouteOptions,
  ): Promise<RouteResult>;
  /** Drop every parsed cell. The byte layer's own caches are untouched. */
  clear(): void;
}

export function createPathfinder(options: PathfinderOptions = {}): Pathfinder {
  const { profile, routeDefaults, ...sourceOptions } = options;
  const source = createGraphSource(sourceOptions);

  return {
    source,

    route(from, to, callOptions = {}) {
      return findRoute(source, from, to, {
        profile,
        ...routeDefaults,
        ...callOptions,
      });
    },

    clear: () => source.clear(),
  };
}
