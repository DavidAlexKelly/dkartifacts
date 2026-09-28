// overlay/unitAttachment.ts — the live/continuous counterpart to
// core/tacticOrders.ts's milxFromForAnchorClick.
//
// milxFromForAnchorClick answers "the user just clicked here to PLACE this
// symbol — what should `from` be so the symbol's declared unitAnchor point
// lands under the cursor?" for a one-shot placement click. Attaching an
// existing unit marker to a tactical graphic (so the graphic tracks the
// unit's position from then on) is the same math, just re-run every time
// the unit moves instead of once at placement time — and the caller
// shouldn't have to know that, or hand-roll the project/unproject/zoom
// plumbing around it themselves. resolveFromForUnitPosition() is that:
// give it the unit's current world position, get back the `from` to
// write onto the order (alongside `fromAnchored: true`) so the symbol's
// true visual anchor — not just its raw translation origin — stays
// exactly glued to the unit, regardless of the fixed per-symbol offset
// between the two (see getSymbolAnchorPoint's doc comment).
import type { SymbolCatalog } from "../engine/catalog";
import type { MapAdapter, WorldCoord } from "../adapter/types";
import { milxFromForAnchorClick, type MilxPlacementConfig } from "../core/tacticOrders";

/**
 * The world position to assign to `order.from` (with `order.fromAnchored`
 * set to `true`) so that `sidc`'s declared unit-anchor point renders
 * exactly at `unitWorldPos` — call this every time the attached unit's
 * position changes, not just once:
 *
 *   const from = resolveFromForUnitPosition(catalog, adapter, order.tacticSidc, unit.position, order.milxScale);
 *   updateOrder(order.id, { from, fromAnchored: true });
 *
 * Returns `unitWorldPos` unchanged if `sidc` isn't one of `catalog`'s
 * tactical graphics (nothing to solve for) or has no declared
 * `unitAnchor` (there's no offset to compensate — `from` already sits at
 * the render origin, which is where the shape's own params happen to
 * sit centred, and a plain 1:1 assignment already does the right thing;
 * see milxFromForAnchorClick's identical `!unitAnchor` short-circuit).
 */
export function resolveFromForUnitPosition(
  catalog: SymbolCatalog,
  adapter: MapAdapter,
  sidc: string | undefined,
  unitWorldPos: WorldCoord,
  arrowScale?: number,
  cfg?: MilxPlacementConfig,
  /**
   * The order's current params. Pass them: the anchor is a handle position and
   * handle positions move with the params, so omitting these solves against
   * the symbol's pristine defaults and re-introduces the very offset this
   * function removes for any order that has been edited or route-fitted.
   */
  overrides?: Record<string, unknown>,
): WorldCoord {
  if (!sidc) {return unitWorldPos;}
  const screenPt = adapter.project(unitWorldPos);
  const fromScreen = milxFromForAnchorClick(catalog, sidc, screenPt, adapter.getZoom(), arrowScale, cfg, overrides);
  return adapter.unproject(fromScreen);
}
