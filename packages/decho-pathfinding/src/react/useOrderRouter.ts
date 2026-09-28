/**
 * useOrderRouter — one line to give @acc/decho-mil-map terrain-aware orders.
 *
 *   const { router } = useOrderRouter({ profileFor: profileForUnit });
 *   <DechoMilMap router={router} units={units} orders={orders} ... />
 *
 * The router identity is stable for the life of the component: mil-map keeps it
 * in state while an order is being assigned, and handing it a new object on
 * every render would be a needless source of re-subscription. Callbacks are
 * read through a ref so a caller can pass inline arrow functions — the usual
 * shape — without destabilising it.
 */

import { useEffect, useMemo, useRef } from "react";

import {
  createOrderRouter,
  type OrderRouterLike,
  type OrderRouterOptions,
} from "../core/orderRouter";
import type { Pathfinder, PathfinderOptions } from "../core/pathfinder";
import { createPathfinder } from "../core/pathfinder";

export interface UseOrderRouterOptions extends OrderRouterOptions {
  /**
   * Share a pathfinder with the rest of the app. Omit and one is created —
   * which is right for a page that only routes through orders, and wrong for
   * one that also routes from a toolbar, because the two would then keep
   * separate copies of every parsed cell.
   */
  pathfinder?: Pathfinder;
  /** Used only when creating one. */
  pathfinderOptions?: PathfinderOptions;
}

export interface UseOrderRouterResult {
  /** Pass straight to <DechoMilMap router={...} /> or useMilMap. */
  router: OrderRouterLike;
  pathfinder: Pathfinder;
}

export function useOrderRouter(
  options: UseOrderRouterOptions = {},
): UseOrderRouterResult {
  const { pathfinder: supplied, pathfinderOptions, ...routerOptions } = options;

  const optionsRef = useRef(routerOptions);
  optionsRef.current = routerOptions;

  const pathfinderOptionsRef = useRef(pathfinderOptions);

  const owned = useMemo(
    () => (supplied ? null : createPathfinder(pathfinderOptionsRef.current ?? {})),
    [supplied],
  );
  const pathfinder = supplied ?? (owned as Pathfinder);

  useEffect(() => {
    // Only the pathfinder this hook created is this hook's to drop.
    return () => owned?.clear();
  }, [owned]);

  const router = useMemo(
    () =>
      createOrderRouter(pathfinder, {
        profileFor: (request) => optionsRef.current.profileFor?.(request),
        routeOptions: (request) => optionsRef.current.routeOptions?.(request),
        onResult: (result, request) =>
          optionsRef.current.onResult?.(result, request),
        onError: (error, request) => optionsRef.current.onError?.(error, request),
      }),
    [pathfinder],
  );

  return { router, pathfinder };
}
