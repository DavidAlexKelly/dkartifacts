// @acc/app6d/extension — this package as a map ADD-ON.
//
// WHY THIS EXISTS
// ---------------
// `createMaplibreTacticGraphics` already does the whole job: adapter, overlay,
// handle controller, hover bridging. What it does not do is fit the shape a
// host map framework expects to be handed. @acc/decho-basemap composes add-ons
// as objects with `{ id, style?(), attach?() }`:
//
//   <DechoBasemap extensions={[elevation(), buildings3d(), tacticGraphics({…})]} />
//
// This is that object. It is thirty lines over the existing entry point, and it
// means tactical graphics arrive the same way every other add-on does instead
// of needing a component that owns the map.
//
// IT DOES NOT DEPEND ON @acc/decho-basemap, DELIBERATELY
// ------------------------------------------------------
// This package is Foundry-agnostic, is published to npmjs as well as to the
// Accenture Artifacts repository, and is consumed by repositories that have no
// basemap at all. Importing a Foundry map library in order to draw a control
// measure would be backwards.
//
// It does not have to. The contract is structural, and two properties make it
// free to satisfy from the outside:
//
//   1. This overlay contributes NO style. It is SVG and DOM markers over the
//      canvas, not sources and layers — so there is no `style()` at all, and
//      none of the style-specification types need naming.
//   2. TypeScript checks method parameters BIVARIANTLY. `attach(map:
//      maplibregl.Map)` is accepted where `attach(map: ExtensionMap)` is
//      expected, because a real Map satisfies ExtensionMap. So this can ask
//      for the real thing — which it genuinely needs, since maplibregl.Marker
//      must be added to a Map — and still slot into the array.
//
// The app's composition test type-checks this against the real contract, so if
// the two ever drift, that fails rather than a consumer finding out.

import type maplibregl from "maplibre-gl";

import type { SymbolCatalog } from "../engine/catalog";
import {
  createMaplibreTacticGraphics,
  type CreateMaplibreTacticGraphicsOptions,
  type MaplibreTacticGraphicsHandle,
  type PlacedOrder,
} from "../maplibre";

export interface TacticGraphicsOptions
  extends CreateMaplibreTacticGraphicsOptions {
  /**
   * The symbol catalog. Required for the reason createMaplibreTacticGraphics
   * requires it: a default would quietly pull all 149 built-in symbols into a
   * consumer that wanted three of their own.
   */
  catalog: SymbolCatalog;
  /** Extension id, unique within one map. */
  id?: string;
  /** Orders to draw immediately. Also settable later with `update`. */
  orders?: PlacedOrder[];
  /** Whether handles are draggable. Default true. */
  editable?: boolean;
}

export interface TacticGraphicsExtension {
  readonly id: string;
  attach(map: maplibregl.Map): () => void;
  /** Replace the drawn orders. Safe before the map exists. */
  update(orders: PlacedOrder[]): void;
  /** Turn handle editing on and off. Safe before the map exists. */
  setEditable(editable: boolean): void;
  /** The underlying handle once attached, for anything not surfaced here. */
  readonly graphics: MaplibreTacticGraphicsHandle | null;
}

export function tacticGraphics(
  options: TacticGraphicsOptions,
): TacticGraphicsExtension {
  const { catalog, id = "tactic-graphics", ...rest } = options;

  let handle: MaplibreTacticGraphicsHandle | null = null;
  // Held here as well as in the handle, so that update() and setEditable()
  // work before attach and are replayed onto the overlay when it exists. A
  // host setting orders from React state has no way to know which came first.
  let orders: PlacedOrder[] = options.orders ?? [];
  let editable = options.editable ?? true;

  return {
    id,

    get graphics() {
      return handle;
    },

    update(next) {
      orders = next;
      handle?.update(next);
    },

    setEditable(next) {
      editable = next;
      handle?.setEditable(next);
    },

    attach(map) {
      handle = createMaplibreTacticGraphics(catalog, map, rest);
      handle.setEditable(editable);
      handle.update(orders);

      return () => {
        handle?.destroy();
        handle = null;
      };
    },
  };
}
