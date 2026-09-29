/**
 * @acc/decho-pathfinding/map
 *
 * The map-flavoured build: drawing a route, and warming cells as the user
 * moves around. Everything here attaches to a map it does not own.
 *
 * WHY THIS IS A SEPARATE ENTRY POINT
 * ----------------------------------
 * Routing is not a map feature. The core computes paths with no renderer in
 * sight, and plenty of consumers want exactly that — a worker, a Function, a
 * planning screen that shows a table of legs. Keeping the map glue behind its
 * own specifier means those consumers never resolve it, and it makes the
 * boundary obvious to the next person: if a file needs a `map`, it lives here.
 *
 * Even so, nothing here imports maplibre-gl. Both modules type the handful of
 * methods they use structurally, so this remains usable from another renderer
 * and adds no dependency to anything.
 *
 *   import { useRouteLayer, attachViewportPrefetch } from "@acc/decho-pathfinding/map";
 */

export {
  attachRouteLayer,
  type MapLike,
  type RouteLayerHandle,
  type RouteLayerOptions,
} from "./routeLayer.js";

export { useRouteLayer } from "./useRouteLayer.js";

export {
  attachViewportPrefetch,
  type PrefetchableMap,
  type ViewportPrefetchOptions,
} from "./viewportPrefetch.js";
