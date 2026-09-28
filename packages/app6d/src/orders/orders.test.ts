import { describe, expect, it } from "vitest";

import {
  getUnitAnchorForSidc,
  getUnitAnchorHandleId,
  milxHandlesForOrder,
  resolveCatalogNameForSidc,
} from "../core/index";
import { paramsFor } from "../engine/index";
import { APP6D_CATALOG } from "@acc/app6d/symbols";

import { defaultOrderCatalog } from "./catalog";
import {
  assignOrder,
  moveUnitOrders,
  pinAttachedOrders,
  resolveOrderSidc,
  toPlacedOrder,
  withOrderEnd,
  withOrderParams,
} from "./orders";
import type { MilOrder, MilOrderDef, PlacedMilUnit } from "./types";

const catalog = APP6D_CATALOG;
const orders = defaultOrderCatalog(catalog);

const unit: PlacedMilUnit = {
  id: "u1",
  label: "1 PL",
  sidc: "SFGPUCI-----D---",
  lat: 59.0,
  lng: 28.0,
};
const destination = { lat: 59.2, lng: 28.4 };

/**
 * A stand-in for map.project: linear, so a point's screen position is a
 * predictable function of its coordinates. Nothing here depends on MapLibre's
 * actual projection — only that the same function is used consistently, which
 * is exactly the contract assignOrder relies on.
 */
const project = (p: { lat: number; lng: number }) => ({
  x: (p.lng - 28) * 10000,
  y: (59.5 - p.lat) * 10000,
});
const unproject = (pt: { x: number; y: number }) => ({
  lat: 59.5 - pt.y / 10000,
  lng: 28 + pt.x / 10000,
});
const ZOOM = 10;

/** Where a named handle of an order actually renders, in screen px. */
function handleScreenPos(order: MilOrder, handleId: string) {
  return milxHandlesForOrder(
    catalog,
    order.tacticSidc!,
    project(order.from),
    order.milxParams,
    ZOOM,
    order.milxScale,
  ).find((h) => h.id === handleId)?.pos;
}

/**
 * Every POINT handle's screen position, by id.
 *
 * Scalar handles are excluded on purpose. They are controls, not parts of the
 * graphic — `barrierHalf` sits perpendicular to the A–B line at the barrier's
 * half-width, so changing where A is necessarily moves it, and asserting it
 * held still would be asserting the symbol does not deform when you drag it.
 */
function handlePositions(order: MilOrder): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const handle of milxHandlesForOrder(
    catalog,
    order.tacticSidc!,
    project(order.from),
    order.milxParams,
    ZOOM,
    order.milxScale,
  )) {
    if (handle.kind === "point") {
      out[handle.id] = handle.pos;
    }
  }
  return out;
}

function anchorHandleIdOf(order: MilOrder): string {
  const name = resolveCatalogNameForSidc(catalog, order.tacticSidc!)!;
  return getUnitAnchorHandleId(catalog, name, order.milxParams)!;
}

const assign = (order: MilOrderDef, overrides: Partial<Parameters<typeof assignOrder>[0]> = {}) =>
  assignOrder({
    catalog,
    order,
    unit,
    destination,
    route,
    project,
    unproject,
    zoom: ZOOM,
    ...overrides,
  });

const route = {
  waypoints: [
    [59.0, 28.0],
    [59.1, 28.2],
    [59.2, 28.4],
  ] as [number, number][],
};

/** The symbol name that draws an order, or undefined if nothing does. */
function symbolNameFor(order: MilOrderDef): string | undefined {
  const sidc = resolveOrderSidc(catalog, order);
  return sidc ? resolveCatalogNameForSidc(catalog, sidc) : undefined;
}

/** The first catalog order whose symbol has a spine (axis of advance, …). */
function firstSpineOrder(): MilOrderDef {
  const found = orders.find((order) => {
    const name = symbolNameFor(order);
    return name ? Array.isArray(paramsFor(catalog, name).spine) : false;
  });
  if (!found) {
    throw new Error("no spine-based order in the default catalog");
  }
  return found;
}

describe("defaultOrderCatalog", () => {
  it("only offers tasks the catalog can actually draw", () => {
    expect(orders.length).toBeGreaterThan(10);
    for (const order of orders) {
      expect(resolveOrderSidc(catalog, order)).toBeTruthy();
    }
  });

  it("carries doctrinal grouping and descriptions through", () => {
    const seize = orders.find((o) => o.label === "Seize");
    expect(seize?.category).toBeTruthy();
    expect(seize?.description).toMatch(/\w/);
  });

  it("says which orders can follow a unit at all", () => {
    // Not the same question as "does it by default". A picker uses this to
    // decide whether to OFFER the choice; offering it where the symbol's anchor
    // is a derived position gives the user a setting that does nothing.
    for (const order of orders) {
      const name = resolveCatalogNameForSidc(catalog, resolveOrderSidc(catalog, order)!)!;
      expect(order.attachable).toBe(getUnitAnchorHandleId(catalog, name) !== undefined);
    }
    expect(orders.some((o) => o.attachable)).toBe(true);
  });
});

describe("orders placed without a unit", () => {
  const anyOrder = () => orders.find((o) => o.attachable)!;

  it("draws at the point it was placed, attached to nobody", () => {
    const placed = assign(anyOrder(), { unit: null });
    expect(placed.unitId).toBeUndefined();
    expect(placed.attachedToUnit).toBe(false);
    expect(placed.to).toEqual(destination);
    expect(placed.tacticSidc).toBeTruthy();
    expect(toPlacedOrder(placed).fromAnchored).toBe(false);
  });

  it("cannot be attached by asking, since there is nothing to attach to", () => {
    expect(assign({ ...anyOrder(), attachToUnit: true }, { unit: null }).attachedToUnit)
      .toBe(false);
  });

  it("is left alone by the helpers that walk a unit's orders", () => {
    // The real hazard of an optional unitId: moveUnitOrders and
    // pinAttachedOrders iterate every order, and an unassigned one has no unit
    // whose movement it should answer to. Getting this wrong would drag
    // planning graphics across the map whenever any unit moved.
    const free = assign(anyOrder(), { unit: null });
    const owned = assign(anyOrder());
    const moved = { ...unit, lat: unit.lat + 0.3, lng: unit.lng + 0.3 };

    const after = moveUnitOrders({
      catalog,
      orders: [free, owned],
      unitId: moved.id,
      position: { lat: moved.lat, lng: moved.lng },
      project,
      zoom: ZOOM,
    });
    expect(after.find((o) => o.id === free.id)).toEqual(free);

    const pinned = pinAttachedOrders({
      catalog,
      orders: [free],
      units: [moved],
      project,
      zoom: ZOOM,
    });
    expect(pinned).toEqual([free]);
  });
});

describe("assignOrder honours an explicit attachment choice", () => {
  const attachingOrder = () =>
    orders.find((o) => getUnitAnchorForSidc(catalog, resolveOrderSidc(catalog, o)!) === "start")!;

  it("places an axis on the ground when the caller says not to attach it", () => {
    // The case this exists for: drawing a rehearsal axis before any unit is
    // assigned to it. The graphic still has to be drawn, and its anchor still
    // has to behave like an ordinary handle — it just does not follow anyone.
    const order = attachingOrder();
    const placed = assign({ ...order, attachToUnit: false });
    expect(placed.attachedToUnit).toBe(false);
    expect(toPlacedOrder(placed).fromAnchored).toBe(false);
    expect(placed.tacticSidc).toBe(resolveOrderSidc(catalog, order));
  });

  it("attaches an objective-anchored order when the caller asks for it", () => {
    const order = orders.find(
      (o) => o.attachable && getUnitAnchorForSidc(catalog, resolveOrderSidc(catalog, o)!) !== "start",
    );
    expect(order, "expected at least one attachable objective-anchored order").toBeDefined();
    const placed = assign({ ...order!, attachToUnit: true });
    expect(placed.attachedToUnit).toBe(true);
    expect(anchorHandleIdOf(placed)).toBeTruthy();
  });

  it("refuses to attach a symbol whose anchor is not a handle", () => {
    // An obstacle row's anchor is the middle of its span. Honouring the request
    // would produce an order that claims to follow its unit and does not, which
    // is worse than declining: moveUnitOrders would re-apply handles around an
    // anchor id that does not exist.
    const unattachable = orders.find((o) => o.attachable === false);
    if (!unattachable) {
      return;
    }
    expect(assign({ ...unattachable, attachToUnit: true }).attachedToUnit).toBe(false);
  });

  it("leaves the symbol's own choice alone when the caller says nothing", () => {
    const order = attachingOrder();
    expect(assign(order).attachedToUnit).toBe(true);
  });

  it("never attaches by default what it would refuse to attach on request", () => {
    // The two branches have to agree. A symbol that says `unitAnchor: 'start'`
    // but has no anchor HANDLE cannot honour attachment: moveUnitOrders and
    // pinAttachedOrders both need the anchor's id, and the handle controller
    // only suppresses an anchor it can name — so an unsuppressed handle ends up
    // sitting under the unit marker, eating the drag that was meant to move the
    // unit. Attached-but-inert is the worst of the three states.
    for (const order of orders) {
      const placed = assign(order);
      if (placed.attachedToUnit) {
        expect(order.attachable, `${order.label} attached without an anchor handle`).toBe(true);
      }
    }
  });
});

describe("assignOrder", () => {
  it("places an objective-anchored order at the objective, and does not attach it", () => {
    const order = orders.find(
      (o) => getUnitAnchorForSidc(catalog, resolveOrderSidc(catalog, o)) === "center",
    );
    expect(order).toBeDefined();

    const assigned = assign(order!);

    expect(assigned.attachedToUnit).toBe(false);
    expect(assigned.to).toEqual(destination);
    expect(assigned.unitId).toBe("u1");
    expect(assigned.tacticSidc).toBeTruthy();
  });

  // The bug this exists to catch: `from` is the symbol's TRANSLATION ORIGIN,
  // not its anchor, so assigning the target position straight onto it drew
  // every centre- and midline-anchored graphic beside the point it was placed
  // on. Assert where the anchor actually RENDERS, not what `from` holds.
  it("renders each symbol's declared anchor on the point it was placed on", () => {
    for (const order of orders) {
      const assigned = assign(order);
      const anchorId = anchorHandleIdOf(assigned);
      if (!anchorId) {
        continue; // midline anchors are derived, with no single handle
      }
      const target = assigned.attachedToUnit
        ? project({ lat: unit.lat, lng: unit.lng })
        : project(destination);
      const rendered = handleScreenPos(assigned, anchorId);
      expect(rendered).toBeDefined();
      expect(rendered!.x).toBeCloseTo(target.x, 6);
      expect(rendered!.y).toBeCloseTo(target.y, 6);
    }
  });

  it("anchors a spine order at the unit and bends it along the route", () => {
    const order = firstSpineOrder();
    const assigned = assign(order);

    expect(assigned.attachedToUnit).toBe(true);
    expect(assigned.to).toEqual(destination);

    const spine = assigned.milxParams?.spine as { x: number; y: number }[];
    expect(Array.isArray(spine)).toBe(true);
    expect(spine.length).toBeGreaterThanOrEqual(2);
    for (const point of spine) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    // The bends must actually differ — a spine collapsed onto one point is the
    // failure mode when the placement transform and the renderer disagree.
    expect(new Set(spine.map((p) => `${p.x},${p.y}`)).size).toBeGreaterThan(1);
  });

  it("keeps the params the spine does not own", () => {
    const order = firstSpineOrder();
    const defaults = paramsFor(catalog, symbolNameFor(order)!);

    const assigned = assign(order);

    for (const key of Object.keys(defaults)) {
      if (key === "spine") {
        continue;
      }
      expect(assigned.milxParams).toHaveProperty(key);
    }
  });

  it("uses the supplied id and colour", () => {
    const assigned = assign(
      { ...orders[0], colour: "#00ff00" },
      { id: "fixed-id" },
    );
    expect(assigned.id).toBe("fixed-id");
    expect(assigned.colour).toBe("#00ff00");
  });

  // The library answers an unknown task name with a synthetic renderer key
  // rather than nothing, so the overlay still draws a labelled arrow. Assert
  // that shape explicitly: it is the difference between "no symbol" and
  // "no order", and only the second would be a bug.
  it("degrades to a labelled arrow for a task nothing can draw", () => {
    const order = { id: "x", label: "Not A Doctrinal Task At All" };
    expect(symbolNameFor(order)).toBeUndefined();

    const assigned = assign(order);
    expect(assigned.milxParams).toBeUndefined();
    expect(assigned.label).toBe("Not A Doctrinal Task At All");
    expect(assigned.from).toEqual(destination);
    expect(assigned.to).toEqual(destination);
  });

  it("offers only drawable tasks, which is fewer than doctrine lists", () => {
    for (const order of orders) {
      expect(symbolNameFor(order)).toBeTruthy();
    }
  });
});

describe("state helpers", () => {
  const order: MilOrder = {
    id: "o1",
    unitId: "u1",
    label: "Seize",
    colour: "#DC3232",
    from: { lat: 1, lng: 2 },
    to: { lat: 3, lng: 4 },
    attachedToUnit: true,
  };

  it("converts to PlacedOrder with [lng, lat] tuples and an anchored start", () => {
    const placed = toPlacedOrder(order);
    expect(placed.from).toEqual([2, 1]);
    expect(placed.to).toEqual([4, 3]);
    // The unit owns the start, so the overlay must not offer a handle for it.
    expect(placed.fromAnchored).toBe(true);
  });

  it("leaves the start draggable for an order the unit does not own", () => {
    // Anchoring unconditionally took the move handle away from symbols placed
    // on an objective, which made them impossible to reposition after
    // placement — the unit does not own them, so nothing else could move them.
    const objectiveOrder: MilOrder = { ...order, attachedToUnit: false };
    expect(toPlacedOrder(objectiveOrder).fromAnchored).toBe(false);
  });

  it("moves an end without touching the other, or other orders", () => {
    const other: MilOrder = { ...order, id: "o2" };
    const next = withOrderEnd([order, other], "o1", "to", [9, 8]);
    expect(next[0].to).toEqual({ lat: 8, lng: 9 });
    expect(next[0].from).toEqual(order.from);
    expect(next[1]).toBe(other);
  });

  it("ignores mid-point edits rather than inventing a third truth", () => {
    const input = [order];
    expect(withOrderEnd(input, "o1", "mid", [9, 8])).toBe(input);
  });

  it("replaces params wholesale", () => {
    const next = withOrderParams([order], "o1", { spine: [] });
    expect(next[0].milxParams).toEqual({ spine: [] });
  });

});

describe("moveUnitOrders", () => {
  const move = (input: MilOrder[], position: { lat: number; lng: number }) =>
    moveUnitOrders({
      catalog,
      orders: input,
      unitId: unit.id,
      position,
      project,
      zoom: ZOOM,
    });

  const elsewhere = { lat: unit.lat + 0.05, lng: unit.lng + 0.05 };

  function firstAttached(): MilOrder {
    for (const def of orders) {
      const assigned = assign(def);
      if (assigned.attachedToUnit && anchorHandleIdOf(assigned)) {
        return assigned;
      }
    }
    throw new Error("no attached order in the default catalog");
  }

  // The two halves of the reported bug, in one test: the attached end follows
  // the unit, and NOTHING else does. Dragging a company forward used to drag
  // its objective the same distance, because `from` is the translation origin
  // and every other point is an offset from it.
  it("moves only the attached end, leaving every other point where it was", () => {
    const order = firstAttached();
    const anchorId = anchorHandleIdOf(order);
    const before = handlePositions(order);

    const [moved] = move([order], elsewhere);
    const after = handlePositions(moved);

    const target = project(elsewhere);
    expect(after[anchorId].x).toBeCloseTo(target.x, 6);
    expect(after[anchorId].y).toBeCloseTo(target.y, 6);

    for (const id of Object.keys(before)) {
      if (id === anchorId) {
        continue;
      }
      expect(after[id].x).toBeCloseTo(before[id].x, 6);
      expect(after[id].y).toBeCloseTo(before[id].y, 6);
    }
  });

  it("leaves the objective end alone", () => {
    const order = firstAttached();
    const [moved] = move([order], elsewhere);
    expect(moved.to).toEqual(order.to);
  });

  it("does not touch orders placed on an objective", () => {
    const def = orders.find(
      (o) => getUnitAnchorForSidc(catalog, resolveOrderSidc(catalog, o)) === "center",
    )!;
    const objectiveOrder = assign(def);
    expect(objectiveOrder.attachedToUnit).toBe(false);

    const [moved] = move([objectiveOrder], elsewhere);
    expect(moved).toBe(objectiveOrder);
  });

  it("does not touch another unit's orders", () => {
    const mine = firstAttached();
    const theirs: MilOrder = { ...mine, id: "other", unitId: "u2" };
    const next = move([mine, theirs], elsewhere);
    expect(next[1]).toBe(theirs);
  });

  it("returns the same array when nothing is attached", () => {
    const input: MilOrder[] = [];
    expect(move(input, elsewhere)).toBe(input);
  });

  it("falls back to moving `from` for an order with no symbol behind it", () => {
    const plain = assign({ id: "x", label: "Not A Doctrinal Task At All" });
    const attached: MilOrder = { ...plain, attachedToUnit: true };
    const [moved] = move([attached], elsewhere);
    expect(moved.from).toEqual(elsewhere);
    expect(moved.to).toEqual(attached.to);
  });
});

describe("pinAttachedOrders", () => {
  const pin = (input: MilOrder[]) =>
    pinAttachedOrders({
      catalog,
      orders: input,
      units: [unit],
      project,
      zoom: ZOOM,
    });

  function firstAttached(): MilOrder {
    for (const def of orders) {
      const assigned = assign(def);
      if (assigned.attachedToUnit && anchorHandleIdOf(assigned)) {
        return assigned;
      }
    }
    throw new Error("no attached order in the default catalog");
  }

  it("leaves an order whose anchor is already on its unit untouched", () => {
    const input = [firstAttached()];
    // Same array, not just equal: React should see no change from a no-op.
    expect(pin(input)).toBe(input);
  });

  // Scaling and reshaping move the anchor as a side effect. Each is a
  // legitimate edit that happens to leave the graphic no longer touching the
  // unit it belongs to, which is what "they move independently" looked like.
  it("pulls a drifted anchor back onto its unit", () => {
    const order = firstAttached();
    const anchorId = anchorHandleIdOf(order);
    const drifted: MilOrder = { ...order, milxScale: 1.8 };

    const before = handleScreenPos(drifted, anchorId)!;
    const target = project({ lat: unit.lat, lng: unit.lng });
    expect(Math.hypot(before.x - target.x, before.y - target.y)).toBeGreaterThan(1);

    const [pinned] = pin([drifted]);
    const after = handleScreenPos(pinned, anchorId)!;
    expect(after.x).toBeCloseTo(target.x, 6);
    expect(after.y).toBeCloseTo(target.y, 6);
    // The edit itself survives — pinning corrects the position, not the scale.
    expect(pinned.milxScale).toBe(1.8);
  });

  it("is idempotent", () => {
    const once = pin([{ ...firstAttached(), milxScale: 1.8 }]);
    expect(pin(once)).toBe(once);
  });

  it("ignores orders that are not attached, and units it has never heard of", () => {
    const objective = assign(
      orders.find(
        (o) => getUnitAnchorForSidc(catalog, resolveOrderSidc(catalog, o)) === "center",
      )!,
    );
    const orphan: MilOrder = { ...firstAttached(), unitId: "gone" };
    const input = [objective, orphan];
    expect(pin(input)).toBe(input);
  });
});
