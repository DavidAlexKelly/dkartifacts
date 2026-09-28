// react/useTacticGraphics.ts — React wrapper around
// createMaplibreTacticGraphics(). Takes an explicit SymbolCatalog — pass a
// stable reference (module-level APP6D_CATALOG, or your own catalog built
// once with useMemo/useRef at your app's top level) so the effect below
// doesn't re-mount on every render.
import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { createMaplibreTacticGraphics, type MaplibreTacticGraphicsHandle, type CreateMaplibreTacticGraphicsOptions } from "../maplibre/index";
import type { PlacedOrder } from "../maplibre/types";
import type { SymbolCatalog } from "../engine/catalog";

export interface UseTacticGraphicsOptions extends CreateMaplibreTacticGraphicsOptions {
  editable?: boolean;
}

/**
 * Mounts a TacticOverlay + OrderHandleController on the given MapLibre map
 * for as long as the component is alive, keeping both in sync with `orders`.
 * Pass `map: null` until your map has finished initialising.
 */
export function useTacticGraphics(
  catalog: SymbolCatalog,
  map: maplibregl.Map | null,
  orders: PlacedOrder[],
  options: UseTacticGraphicsOptions = {},
): void {
  const handleRef = useRef<MaplibreTacticGraphicsHandle | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // The orders as of this render, for the effect below. See why there.
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  useEffect(() => {
    if (!map) {return;}
    const handle = createMaplibreTacticGraphics(catalog, map, {
      onMoveEnd: (id, end, world) => optionsRef.current.onMoveEnd?.(id, end, world),
      onMilxParamsChange: (id, params) => optionsRef.current.onMilxParamsChange?.(id, params),
      onScaleChange: (id, scale) => optionsRef.current.onScaleChange?.(id, scale),
      onRemove: (id) => optionsRef.current.onRemove?.(id),
      theme: optionsRef.current.theme,
      scaleRange: optionsRef.current.scaleRange,
    });
    handleRef.current = handle;

    // A NEW HANDLE STARTS EMPTY, AND NOTHING ELSE WILL FILL IT.
    //
    // The effect below is what puts orders on the map, and it only runs when
    // `orders` changes identity. On the first mount that is fine — both
    // effects run in the same commit — but this one re-runs on its own
    // whenever `map` or `catalog` changes, and a remount does not touch
    // `orders`. So the overlay was rebuilt empty and stayed empty until the
    // next edit, which looks exactly like the graphics vanishing while the
    // units stay put.
    handle.setEditable(optionsRef.current.editable !== false);
    handle.update(ordersRef.current);

    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, [map, catalog]);

  useEffect(() => {
    handleRef.current?.setEditable(options.editable !== false);
    if (options.scaleRange) {
      handleRef.current?.setScaleRange(options.scaleRange);
    }
    handleRef.current?.update(orders);
  }, [orders, options.editable, options.scaleRange]);
}