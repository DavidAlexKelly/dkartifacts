// @acc/app6d/maplibre — MapLibre GL JS convenience layer.
// Wires MaplibreAdapter + a shared LiveOverrideStore + TacticOverlay +
// OrderHandleController together, with hover automatically bridged between
// the two. Takes an explicit SymbolCatalog — pass APP6D_CATALOG from
// "@acc/app6d/symbols" for the built-in set, or your own.
import type maplibregl from "maplibre-gl";
import { MaplibreAdapter } from "./maplibre-adapter";
import { LiveOverrideStore } from "../overlay/LiveOverrideStore";
import { TacticOverlay } from "../overlay/TacticOverlay";
import { OrderHandleController, type OrderHandleControllerOptions, type ScaleRange } from "../overlay/OrderHandleController";
import type { SymbolCatalog } from "../engine/catalog";
import type { PlacedOrder, OrderHandleCallbacks } from "./types";
import { createTacticLayers, type TacticLayersHandle, type TacticLayersOptions } from "../layers/tacticLayers";

export { MaplibreAdapter } from "./maplibre-adapter";
export { TacticOverlay } from "../overlay/TacticOverlay";
export { OrderHandleController, type ScaleRange } from "../overlay/OrderHandleController";
export { LiveOverrideStore } from "../overlay/LiveOverrideStore";
export { resolveFromForUnitPosition } from "../overlay/unitAttachment";
export {
  createTacticLayers,
  type LayerHostMap,
  type TacticLayersHandle,
  type TacticLayersOptions,
} from "../layers/tacticLayers";
export type { HandleTheme } from "../overlay/theme";
export type { PlacedOrder, OrderHandleCallbacks, LineStyle, EndpointStyle, WorldCoord } from "./types";

export interface MaplibreTacticGraphicsHandle {
  update: (orders: PlacedOrder[]) => void;
  setEditable: (editable: boolean) => void;
  setScaleRange: (range: ScaleRange) => void;
  destroy: () => void;
}

export interface CreateMaplibreTacticGraphicsOptions extends OrderHandleCallbacks, OrderHandleControllerOptions {
  /**
   * How the graphics are DRAWN. The edit handles are markers either way.
   *
   *   "overlay" (default) — SVG over the canvas. Fitted in screen pixels and
   *     redrawn on every camera event, so with 3D terrain a symbol slides and
   *     resizes as you rotate: it is a picture over the map, not a thing on the
   *     ground. Correct and cheap for a flat map.
   *
   *   "layers" — GeoJSON in line and fill layers. MapLibre drapes these over
   *     the terrain mesh, so a symbol follows the ground along its whole
   *     length, foreshortens with pitch and is hidden behind terrain in front
   *     of it. What you want the moment terrain is on.
   *
   * Handles keep working in both: OrderHandleController positions DOM markers,
   * and MapLibre markers are already terrain-aware.
   */
  renderer?: "overlay" | "layers";
  /** Passed to createTacticLayers when `renderer` is "layers". */
  layers?: TacticLayersOptions;
}

/**
 * One-call setup for MapLibre: mounts a TacticOverlay + OrderHandleController
 * on `map`, keeps them in sync via `update()`, and bridges hover between the
 * visible graphic and its edit handles automatically.
 *
 * `catalog` is required — pass APP6D_CATALOG (built-in symbols) or your own
 * SymbolCatalog (e.g. `APP6D_CATALOG.extend({ "my-icon": myDef })`).
 */
export function createMaplibreTacticGraphics(
  catalog: SymbolCatalog,
  map: maplibregl.Map,
  options: CreateMaplibreTacticGraphicsOptions = {},
): MaplibreTacticGraphicsHandle {
  const adapter = new MaplibreAdapter(map);
  const liveStore = new LiveOverrideStore();

  const controller = new OrderHandleController(catalog, adapter, liveStore, {
    onMoveEnd: options.onMoveEnd,
    onMilxParamsChange: options.onMilxParamsChange,
    onScaleChange: options.onScaleChange,
    onRemove: options.onRemove,
  }, { theme: options.theme, scaleRange: options.scaleRange });

  // One of the two, never both: two renderers drawing the same orders would
  // double every line, and the overlay would sit on the glass over the version
  // that is on the ground.
  const useLayers = options.renderer === "layers";
  const overlay = useLayers
    ? null
    : new TacticOverlay(catalog, adapter, liveStore, {
        onRemove: options.onRemove,
        onHoverChange: (id, hovered) => controller.setHoverGroup(id, hovered),
      });
  const layers: TacticLayersHandle | null = useLayers
    ? createTacticLayers(catalog, map, options.layers)
    : null;

  let editable = true;
  let lastOrders: PlacedOrder[] = [];

  return {
    update(orders: PlacedOrder[]) {
      lastOrders = orders;
      // The live store's overrides are an overlay concern: it repaints on every
      // camera event and reads them then. The layer renderer converts once per
      // change, so it takes the orders as given.
      overlay?.update(orders);
      layers?.update(orders);
      controller.sync(editable ? orders : []);
    },
    setEditable(next: boolean) {
      editable = next;
      controller.sync(editable ? lastOrders : []);
    },
    setScaleRange(range: ScaleRange) {
      controller.setScaleRange(range);
    },
    destroy() {
      overlay?.destroy();
      layers?.destroy();
      controller.destroy();
    },
  };
}