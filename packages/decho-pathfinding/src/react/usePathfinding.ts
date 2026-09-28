/**
 * usePathfinding — a pathfinder with React state around it.
 *
 * Deliberately NOT a data-loading effect. A route is a response to an action
 * (a click, a drag, an order being assigned), not a function of props, and
 * expressing it as an effect keyed on endpoints means every intermediate drag
 * position starts a search whose cells are then downloaded. So the hook hands
 * back an imperative `route()` and keeps only the status of the call in flight.
 *
 * A new call ABORTS the previous one. The byte layer refcounts its in-flight
 * requests, so abandoning a search cancels only the downloads no live search
 * still wants — a rapid sequence of drags does not re-download the corridor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createPathfinder,
  type Pathfinder,
  type PathfinderOptions,
} from "../core/pathfinder";
import type { GeoPoint, RouteOptions, RouteResult } from "../core/route";
import type { GraphSourceStats } from "../core/graphSource";

export interface UsePathfindingResult {
  /** Run a search. Cancels any previous one. Resolves null if cancelled. */
  route(
    from: GeoPoint,
    to: GeoPoint,
    options?: RouteOptions,
  ): Promise<RouteResult | null>;
  /** Abandon the search in flight, if any. */
  cancel(): void;
  /** Forget the last result and error. */
  reset(): void;
  routing: boolean;
  result: RouteResult | null;
  error: Error | null;
  /** The underlying pathfinder: prefetching, cell status, cache stats. */
  pathfinder: Pathfinder;
  stats: GraphSourceStats;
}

export function usePathfinding(
  options: PathfinderOptions = {},
): UsePathfindingResult {
  // Options are read once, like useBasemap's: re-creating the source on a prop
  // change would throw away every parsed cell — megabytes of work — because a
  // caller passed an inline object literal.
  const optionsRef = useRef(options);
  const pathfinder = useMemo(
    () => createPathfinder(optionsRef.current),
    [],
  );

  const [routing, setRouting] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (mountedRef.current) {setRouting(false);}
  }, []);

  const route = useCallback<UsePathfindingResult["route"]>(
    async (from, to, callOptions = {}) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setRouting(true);
      setError(null);

      try {
        const next = await pathfinder.route(from, to, {
          ...callOptions,
          signal: controller.signal,
        });
        // A result from a superseded call must not overwrite a newer one.
        if (controller.signal.aborted || !mountedRef.current) {return null;}
        setResult(next);
        return next;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {return null;}
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
        return null;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          if (mountedRef.current) {setRouting(false);}
        }
      }
    },
    [pathfinder],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    route,
    cancel,
    reset,
    routing,
    result,
    error,
    pathfinder,
    stats: pathfinder.source.stats(),
  };
}
