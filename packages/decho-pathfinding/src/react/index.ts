/**
 * @acc/decho-pathfinding/react
 *
 * React bindings for routing itself — no map. `usePathfinding` owns the calls
 * and their cancellation; `useOrderRouter` produces the `OrderRouter`
 * @acc/app6d/orders asks for.
 *
 * The map glue (drawing a route, warming cells as the view moves) is at
 * "@acc/decho-pathfinding/map", so a consumer that only computes paths never
 * resolves it.
 *
 *   import { usePathfinding, useOrderRouter } from "@acc/decho-pathfinding/react";
 *   import { useRouteLayer }                  from "@acc/decho-pathfinding/map";
 */

export { usePathfinding, type UsePathfindingResult } from "./usePathfinding.js";

export {
  useOrderRouter,
  type UseOrderRouterOptions,
  type UseOrderRouterResult,
} from "./useOrderRouter.js";
