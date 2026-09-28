/**
 * The default order catalog: every doctrinal APP-6D task the tactical
 * graphics library knows, filtered to the ones something can actually draw.
 *
 * Filtering is the point. TACTIC_TASK_CATALOG is doctrine, and doctrine is
 * larger than any symbol set — offering a task the renderer cannot draw
 * produces an order that assigns cleanly and then shows nothing on the map,
 * which reads as a broken application rather than a missing symbol.
 */

import {
  TACTIC_TASK_CATALOG,
  getUnitAnchorHandleId,
  resolveCatalogNameForSidc,
  resolveTacticSidc,
} from "../core/index";
import type { SymbolCatalog } from "../engine/index";

import type { MilOrderDef } from "./types";

/**
 * Orders for `catalog`, grouped by the doctrinal subcategory ("General
 * Tasks", "Effects on Enemy Force", …).
 *
 * A SymbolCatalog is immutable, so this is safe to memoise on the catalog
 * reference — which is exactly what useMilMap does.
 */
export function defaultOrderCatalog(catalog: SymbolCatalog): MilOrderDef[] {
  const orders: MilOrderDef[] = [];
  for (const task of TACTIC_TASK_CATALOG) {
    const tacticSidc = resolveTacticSidc(catalog, task.name);
    // resolveTacticSidc is NOT a drawability test: for a name it does not
    // recognise it synthesises a renderer key ("TASK_     ") so the caller
    // still gets a plain labelled arrow. That is the right behaviour there and
    // the wrong filter here — asking the catalog to name the symbol is what
    // actually distinguishes "we can draw this" from "we cannot".
    if (!tacticSidc || !resolveCatalogNameForSidc(catalog, tacticSidc)) {
      continue;
    }
    // Whether this graphic can follow a unit, as opposed to being placed on
    // the ground. It is not the same question as "does it by default": an area
    // is drawn at its objective and still has an anchor a unit could be glued
    // to, while an obstacle row's position is the middle of a span with no
    // handle behind it and cannot be attached at all. A picker that offers
    // "follows the unit" for the second kind is offering a setting that does
    // nothing.
    const symbolName = resolveCatalogNameForSidc(catalog, tacticSidc);
    const attachable =
      symbolName !== undefined
      && getUnitAnchorHandleId(catalog, symbolName) !== undefined;

    orders.push({
      id: task.id,
      label: task.name,
      category: task.subcategory || task.category,
      taskName: task.name,
      tacticSidc,
      description: task.description,
      attachable,
    });
  }
  return orders;
}
