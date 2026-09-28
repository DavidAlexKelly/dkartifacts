/**
 * Assigning an order to a unit: catalog entry + unit + objective + route in,
 * a drawable MilOrder out.
 *
 * This is the part worth having in a library. Placing a tactical graphic well
 * is not "draw a line from A to B": spine symbols (axis of advance, main
 * attack, …) have to bend along the route, centre symbols (destroy, fix,
 * retain) sit on the objective, and both have to end up in the SAME parameter
 * space the renderer will read them back from. Applications that reimplement
 * that maths drift from the renderer and nobody notices until a symbol is
 * drawn a hundred metres from where it was placed.
 *
 * So none of it is reimplemented here. `milxHandlesForOrder` reports the bends
 * a symbol actually has, and `applyMilxOrderHandle` converts a screen position
 * back into params — both against the same catalog that draws it.
 */

import {
  applyMilxOrderHandle,
  getUnitAnchorForSidc,
  getUnitAnchorHandleId,
  milxFromForAnchorClick,
  milxHandlesForOrder,
  resolveCatalogNameForSidc,
  resolveTacticSidc,
} from "../core/index";
import { paramsFor, type SymbolCatalog } from "../engine/index";
import type { PlacedOrder } from "../maplibre/types";

import { newId } from "./id";
import { sampleRoute } from "./routing";
import type {
  LatLng,
  MilOrder,
  MilOrderDef,
  OrderRoute,
  PlacedMilUnit,
} from "./types";

/** Screen projection — `map.project` satisfies this. */
export type ProjectFn = (position: LatLng) => { x: number; y: number };
/** The inverse — `map.unproject` satisfies this. */
export type UnprojectFn = (point: { x: number; y: number }) => LatLng;

export interface AssignOrderArgs {
  catalog: SymbolCatalog;
  order: MilOrderDef;
  /**
   * The unit this order is for, or null to place it on the map unassigned.
   *
   * Unassigned is not a special case in the geometry, only in the anchoring: an
   * order with no unit cannot hang off one, so it is drawn at `destination`
   * with its anchor there and behaves as an ordinary handle from then on. That
   * is what the "add order" path on empty map produces, as against "assign
   * order" on a unit.
   */
  unit: PlacedMilUnit | null;
  destination: LatLng;
  route: OrderRoute;
  project: ProjectFn;
  unproject: UnprojectFn;
  zoom: number;
  /** Fallback colour when the catalog entry does not carry one. */
  colour?: string;
  /** Supply your own id (e.g. a Foundry primary key) instead of a random one. */
  id?: string;
}

/** The renderer key for a catalog entry, or undefined if nothing draws it. */
export function resolveOrderSidc(
  catalog: SymbolCatalog,
  order: MilOrderDef,
): string | undefined {
  if (order.tacticSidc && resolveCatalogNameForSidc(catalog, order.tacticSidc)) {
    return order.tacticSidc;
  }
  return resolveTacticSidc(catalog, order.taskName ?? order.label);
}

/**
 * Build the order. Pure apart from the id: given the same inputs it produces
 * the same params, which is what makes it testable without a map.
 */
export function assignOrder({
  catalog,
  order,
  unit,
  destination,
  route,
  project,
  unproject,
  zoom,
  colour,
  id,
}: AssignOrderArgs): MilOrder {
  const tacticSidc = resolveOrderSidc(catalog, order);
  const symbolName = tacticSidc
    ? resolveCatalogNameForSidc(catalog, tacticSidc)
    : undefined;
  const defaults = symbolName ? paramsFor(catalog, symbolName) : undefined;

  // The symbol's own declaration decides where it hangs, not a guess from its
  // params. "start" means the graphic leaves its unit and goes somewhere — an
  // axis of advance, a supporting attack. "center" and "midline" describe an
  // effect AT the objective — destroy, fix, occupy — and belong there.
  const anchorKind = getUnitAnchorForSidc(catalog, tacticSidc);
  // The caller may override the symbol's default — placing an axis on the
  // ground for a unit not yet assigned, say — but only towards something the
  // symbol can actually do. Attaching re-applies every handle except the
  // anchor's, so a symbol whose anchor is a derived position (the middle of an
  // obstacle row) cannot be attached at all, and honouring `attachToUnit: true`
  // there would produce an order that claims to follow its unit and does not.
  const canAttach =
    unit !== null
    && symbolName !== undefined
    && getUnitAnchorHandleId(catalog, symbolName, defaults) !== undefined;
  // `canAttach` gates BOTH branches, and the default one is where it matters
  // most. A symbol that declares `unitAnchor: 'start'` but whose anchor is a
  // derived position rather than a handle used to be attached anyway, and then
  // nothing worked: moveUnitOrders and pinAttachedOrders both bail without an
  // anchor id, so the graphic ignored its unit — and the controller only
  // suppresses the anchor handle it can name, so an un-suppressed handle sat
  // under the unit marker and swallowed the drag. The unit appeared stuck and
  // the symbol appeared to have dead handles. Attachment has to mean the whole
  // contract or none of it.
  const attachedToUnit =
    order.attachToUnit === undefined
      ? unit !== null && anchorKind === "start" && canAttach
      : order.attachToUnit && canAttach;
  const anchorWorld: LatLng =
    attachedToUnit && unit !== null
      ? { lat: unit.lat, lng: unit.lng }
      : destination;

  // `from` is the symbol's TRANSLATION ORIGIN, which for most symbols is not
  // its anchor: the anchor sits a fixed, symbol-specific distance away in
  // param space. Assigning the anchor position straight onto `from` — which is
  // what this used to do — draws every one of the 30 centre- and
  // midline-anchored graphics visibly beside the point it was placed on.
  // milxFromForAnchorClick solves for the `from` that lands the anchor exactly.
  const from: LatLng =
    tacticSidc && symbolName
      ? unproject(
          milxFromForAnchorClick(
            catalog,
            tacticSidc,
            project(anchorWorld),
            zoom,
            undefined,
            undefined,
            defaults,
          ),
        )
      : anchorWorld;

  let milxParams: Record<string, unknown> | undefined = defaults
    ? { ...defaults }
    : undefined;

  if (attachedToUnit && tacticSidc && defaults && route.waypoints.length >= 2) {
    const anchorPx = project(from);
    const spineHandleIds = milxHandlesForOrder(
      catalog,
      tacticSidc,
      anchorPx,
      defaults,
      zoom,
    )
      .filter((handle) => handle.id.startsWith("spine"))
      .map((handle) => handle.id);

    // Two is the floor, not tidiness: sampleRoute divides by (count - 1).
    if (spineHandleIds.length >= 2) {
      const samples = sampleRoute(route, spineHandleIds.length);
      let params: Record<string, unknown> = { ...defaults };

      spineHandleIds.forEach((handleId, i) => {
        const screen = project(samples[i]);
        // Returns the FULL merged params, so feeding the result back in
        // accumulates the bends while preserving everything the spine does
        // not own — halfWidth, headLen, notch, dashed, …
        const next = applyMilxOrderHandle(
          catalog,
          tacticSidc,
          anchorPx,
          params,
          handleId,
          screen,
          zoom,
        );
        if (next) {
          params = next;
        }
      });

      milxParams = params;
    }
  }

  return {
    id: id ?? newId(),
    unitId: unit?.id,
    orderId: order.id,
    label: order.label,
    colour: order.colour ?? colour ?? "#DC3232",
    from,
    to: destination,
    tacticSidc,
    milxParams,
    attachedToUnit,
    route,
  };
}

export interface PinOrdersArgs {
  catalog: SymbolCatalog;
  orders: MilOrder[];
  units: PlacedMilUnit[];
  project: ProjectFn;
  zoom: number;
  /** How far the anchor may sit from its unit before it is pulled back, in px. */
  tolerancePx?: number;
}

/**
 * Re-assert the invariant: an attached order's anchor sits on its unit.
 *
 * Suppressing the anchor handle stops the user dragging the two apart
 * directly, but plenty of other edits move the anchor as a side effect — the
 * scale handle scales about the render origin, a reshape can drag the first
 * bend along with it. Each of those is a legitimate edit that happens to leave
 * the graphic no longer touching the unit it belongs to.
 *
 * So rather than enumerate which edits are safe, re-pin after every one: if
 * the anchor has drifted, drag it back. Idempotent, and returns the same array
 * when nothing moved so React sees no change.
 */
export function pinAttachedOrders({
  catalog,
  orders,
  units,
  project,
  zoom,
  tolerancePx = 0.5,
}: PinOrdersArgs): MilOrder[] {
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  let changed = false;

  const next = orders.map((order) => {
    // An unassigned order has no unit whose movement it should answer to.
    if (!order.attachedToUnit || !order.tacticSidc || order.unitId === undefined) {
      return order;
    }
    const unit = unitsById.get(order.unitId);
    if (!unit) {
      return order;
    }

    const symbolName = resolveCatalogNameForSidc(catalog, order.tacticSidc);
    const anchorHandleId = symbolName
      ? getUnitAnchorHandleId(catalog, symbolName, order.milxParams)
      : undefined;
    if (!anchorHandleId) {
      return order;
    }

    const anchorPx = project(order.from);
    const rendered = milxHandlesForOrder(
      catalog,
      order.tacticSidc,
      anchorPx,
      order.milxParams,
      zoom,
      order.milxScale,
    ).find((handle) => handle.id === anchorHandleId);
    if (!rendered) {
      return order;
    }

    const target = project({ lat: unit.lat, lng: unit.lng });
    if (Math.hypot(rendered.pos.x - target.x, rendered.pos.y - target.y) <= tolerancePx) {
      return order;
    }

    const params = applyMilxOrderHandle(
      catalog,
      order.tacticSidc,
      anchorPx,
      order.milxParams,
      anchorHandleId,
      target,
      zoom,
      order.milxScale,
    );
    if (!params) {
      return order;
    }
    changed = true;
    return { ...order, milxParams: params };
  });

  return changed ? next : orders;
}

export interface MoveUnitArgs {
  catalog: SymbolCatalog;
  orders: MilOrder[];
  unitId: string;
  /** The unit's new position. */
  position: LatLng;
  project: ProjectFn;
  zoom: number;
}

/**
 * Move a unit and take only what is attached to it.
 *
 * The naive version — rewriting `from` for every order the unit owns — moves
 * the whole graphic, because `from` is the translation origin and every other
 * point is a param-space offset from it. Walk a company forward 500 m and its
 * objective walks 500 m too, which is never what anybody meant.
 *
 * So `from` is left exactly where it is, and the unit's ANCHOR HANDLE is
 * dragged to the new position instead — one `applyMilxOrderHandle` call, which
 * edits only that handle's params. Every other bend, and the objective end,
 * keep both their params and their world position by construction.
 */
export function moveUnitOrders({
  catalog,
  orders,
  unitId,
  position,
  project,
  zoom,
}: MoveUnitArgs): MilOrder[] {
  let changed = false;

  const next = orders.map((order) => {
    if (order.unitId !== unitId || !order.attachedToUnit) {
      return order;
    }
    changed = true;

    const symbolName = order.tacticSidc
      ? resolveCatalogNameForSidc(catalog, order.tacticSidc)
      : undefined;
    const anchorHandleId = symbolName
      ? getUnitAnchorHandleId(catalog, symbolName, order.milxParams)
      : undefined;

    if (order.tacticSidc && anchorHandleId) {
      const params = applyMilxOrderHandle(
        catalog,
        order.tacticSidc,
        project(order.from),
        order.milxParams,
        anchorHandleId,
        project(position),
        zoom,
        order.milxScale,
      );
      if (params) {
        return { ...order, milxParams: params };
      }
    }

    // No symbol behind this order (a plain labelled arrow) or an anchor with no
    // single handle behind it: `from` IS the unit end, so moving it is both
    // correct and all there is to do — `to` stays put either way.
    return { ...order, from: position };
  });

  return changed ? next : orders;
}

/**
 * MilOrder → the tactical graphics library's PlacedOrder.
 *
 * The only place the `[lng, lat]` tuple convention appears. Keeping it here
 * rather than in the host is the whole point of MilOrder's named fields.
 */
export function toPlacedOrder(order: MilOrder): PlacedOrder {
  return {
    id: order.id,
    from: [order.from.lng, order.from.lat],
    to: [order.to.lng, order.to.lat],
    colour: order.colour,
    tacticSidc: order.tacticSidc,
    tacticLabel: order.label,
    milxParams: order.milxParams,
    milxScale: order.milxScale,
    // Only anchor the start when the unit actually owns it. Anchoring
    // unconditionally took the move handle away from objective-placed symbols
    // — destroy, fix, occupy — leaving them unmovable once placed.
    fromAnchored: order.attachedToUnit === true,
  };
}

/** Apply a handle drag reported by the overlay. Returns a new array. */
export function withOrderEnd(
  orders: MilOrder[],
  orderId: string,
  end: "from" | "to" | "mid",
  world: [number, number],
): MilOrder[] {
  // `mid` is ignored rather than stored: an order here is always unit →
  // objective, and a mid point would be a third truth about the same path
  // that the route already describes.
  if (end === "mid") {
    return orders;
  }
  const position: LatLng = { lng: world[0], lat: world[1] };
  return orders.map((order) =>
    order.id === orderId ? { ...order, [end]: position } : order,
  );
}

/** Apply a parametric edit (spine bend, radius, head geometry, …). */
export function withOrderParams(
  orders: MilOrder[],
  orderId: string,
  milxParams: Record<string, unknown>,
): MilOrder[] {
  return orders.map((order) =>
    order.id === orderId ? { ...order, milxParams } : order,
  );
}

/** Apply a scale change from the overlay's scale handle. */
export function withOrderScale(
  orders: MilOrder[],
  orderId: string,
  milxScale: number,
): MilOrder[] {
  return orders.map((order) =>
    order.id === orderId ? { ...order, milxScale } : order,
  );
}

