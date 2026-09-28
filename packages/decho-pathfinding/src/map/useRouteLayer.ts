/**
 * useRouteLayer — keep one route drawn on a map owned by someone else.
 *
 * The map arrives as null and becomes a Map later (useBasemap sets it after an
 * async construction), so the layer is attached in an effect keyed on the map
 * and torn down with it. The route itself is pushed through the handle rather
 * than by re-attaching, because re-adding a source on every route would make
 * MapLibre re-create the layers and flicker.
 */

import { useEffect, useRef } from "react";

import {
  attachRouteLayer,
  type MapLike,
  type RouteLayerHandle,
  type RouteLayerOptions,
} from "./routeLayer";
import type { Waypoint } from "../core/simplify";

export function useRouteLayer(
  map: MapLike | null | undefined,
  waypoints: readonly Waypoint[] | null | undefined,
  options: RouteLayerOptions = {},
): void {
  const handleRef = useRef<RouteLayerHandle | null>(null);

  // Styling is read at attach time only. A route's colours changing mid-flight
  // is not a case worth re-creating layers for, and reading them through a ref
  // keeps the effect keyed on the map alone — an inline options object would
  // otherwise re-attach on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!map) {return;}
    const handle = attachRouteLayer(map, optionsRef.current);
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.remove();
    };
  }, [map]);

  useEffect(() => {
    handleRef.current?.setRoute(waypoints ?? null);
  }, [waypoints]);
}
