// @acc/app6d/symbols — the full APP-6D catalog, exported as a
// ready-to-use SymbolCatalog value: APP6D_CATALOG.
//
// Nothing here runs as an import side effect. APP6D_CATALOG is a real,
// directly-used export built once at module-evaluation time from plain
// data — which is what makes it safe against bundler tree-shaking and
// chunk-splitting duplication: there's a genuine exported binding for
// every consumer to depend on, not a "run this module for its effects"
// import with nothing to hold onto. If a bundler ends up with more than
// one copy of this module loaded, each copy just builds an identical,
// independent (immutable) catalog — harmless, unlike the old registry
// design where duplication meant writes and reads landed in different
// Maps.
import { SymbolCatalog } from "../engine/catalog";
import { INDIVIDUAL_SYMBOLS } from "./catalog/individual/index";
import type { SymbolDefinition } from "../engine/types";

/** Every built-in APP-6D symbol — all of them individually tree-shakeable —
 * as a plain name -> definition map. */
export const APP6D_SYMBOLS: Record<string, SymbolDefinition> = {
  ...INDIVIDUAL_SYMBOLS,
};

/** The full built-in APP-6D catalog, ready to pass into render()/
 * getHandles()/applyHandle() (from @acc/app6d/engine) or into
 * TacticOverlay/OrderHandleController (from @acc/app6d/maplibre). */
export const APP6D_CATALOG: SymbolCatalog = new SymbolCatalog(APP6D_SYMBOLS);

export * from "./catalog/individual/index";
export * from "./paramTypes";