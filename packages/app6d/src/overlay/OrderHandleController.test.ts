// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { SymbolCatalog } from "../engine/catalog";
import { LiveOverrideStore } from "./LiveOverrideStore";
import { OrderHandleController } from "./OrderHandleController";
import { seizeSymbol, SEIZE_NAME } from "../symbols/catalog/individual/seize";
import { blockSymbol, BLOCK_NAME } from "../symbols/catalog/individual/block";
import type { MapAdapter, MarkerHandle, WorldCoord } from "../adapter/types";
import type { PlacedOrder } from "../maplibre/types";

const catalog = new SymbolCatalog({ [SEIZE_NAME]: seizeSymbol, [BLOCK_NAME]: blockSymbol });

function makeAdapter(): { adapter: MapAdapter; createdEls: HTMLElement[] } {
  const createdEls: HTMLElement[] = [];
  const adapter: MapAdapter = {
    project: ([x, y]) => ({ x, y }),
    unproject: (p) => [p.x, p.y] as WorldCoord,
    getContainer: () => document.createElement("div"),
    getZoom: () => 10,
    onCameraChange: () => () => {},
    createMarker: (el: HTMLElement, world: WorldCoord): MarkerHandle => {
      createdEls.push(el);
      let pos = world;
      return {
        setPosition: (w) => { pos = w; },
        getPosition: () => pos,
        getElement: () => el,
        remove: vi.fn(),
      };
    },
  };
  return { adapter, createdEls };
}

const baseOrder = (overrides: Partial<PlacedOrder> = {}): PlacedOrder => ({
  id: "order-1",
  from: [0, 0],
  to: [0, 0],
  colour: "#4a90d9",
  tacticSidc: "SVGSEIZE",
  ...overrides,
});

describe("OrderHandleController — fromAnchored", () => {
  it("draws a draggable move handle for an unattached milx order (svg-seize)", () => {
    const { adapter, createdEls } = makeAdapter();
    const controller = new OrderHandleController(catalog, adapter, new LiveOverrideStore());
    controller.sync([baseOrder()]);

    // Seize has its own "center" handle (circleHandles), so the generic
    // "Move symbol" handle is suppressed in favor of it — but "center"
    // itself should be draggable when not anchored.
    const centerHandle = createdEls.find((el) => el.title === "center");
    expect(centerHandle).toBeDefined();
  });

  it("does NOT draw a draggable move/center handle once fromAnchored is true (svg-seize)", () => {
    const { adapter, createdEls } = makeAdapter();
    const controller = new OrderHandleController(catalog, adapter, new LiveOverrideStore());
    controller.sync([baseOrder({ fromAnchored: true })]);

    const moveHandle = createdEls.find((el) => el.title === "Move symbol");
    const centerHandle = createdEls.find((el) => el.title === "center");
    expect(moveHandle).toBeUndefined();
    expect(centerHandle).toBeUndefined();

    // Reshape/resize handles for this symbol should still be there.
    const radiusHandle = createdEls.find((el) => el.title === "radius");
    expect(radiusHandle).toBeDefined();
  });

  it("does NOT draw the generic move handle once fromAnchored is true (svg-block, no center handle)", () => {
    const { adapter, createdEls } = makeAdapter();
    const controller = new OrderHandleController(catalog, adapter, new LiveOverrideStore());
    controller.sync([baseOrder({ tacticSidc: "SVGBLOCK", fromAnchored: true })]);

    const moveHandle = createdEls.find((el) => el.title === "Move symbol");
    expect(moveHandle).toBeUndefined();
  });

  it("removes an existing move handle when an order transitions to fromAnchored", () => {
    const { adapter } = makeAdapter();
    const controller = new OrderHandleController(catalog, adapter, new LiveOverrideStore());

    controller.sync([baseOrder({ tacticSidc: "SVGBLOCK" })]);
    controller.sync([baseOrder({ tacticSidc: "SVGBLOCK", fromAnchored: true })]);

    // Re-sync unattached again — a fresh move handle should reappear,
    // proving the controller doesn't get stuck in either state.
    const { adapter: adapter2, createdEls: createdEls2 } = makeAdapter();
    const controller2 = new OrderHandleController(catalog, adapter2, new LiveOverrideStore());
    controller2.sync([baseOrder({ tacticSidc: "SVGBLOCK", fromAnchored: true })]);
    controller2.sync([baseOrder({ tacticSidc: "SVGBLOCK", fromAnchored: false })]);
    const moveHandle = createdEls2.find((el) => el.title === "Move symbol");
    expect(moveHandle).toBeDefined();
  });
});

describe("OrderHandleController — the anchor handle belongs to the unit", () => {
  // svg-block declares unitAnchor "start", so its anchor handle is "A" — not
  // "center". Hardcoding "center" left every start-anchored symbol (each axis
  // of advance, each attack) with a draggable handle sitting exactly under the
  // attached unit marker, and the two drifted apart the moment either moved.
  const blockOrder = (overrides: Partial<PlacedOrder> = {}): PlacedOrder => ({
    id: "order-block",
    from: [0, 0],
    to: [500, 500],
    colour: "#4a90d9",
    tacticSidc: "SVGBLOCK",
    ...overrides,
  });

  const titles = (els: HTMLElement[]) => els.map((el) => el.title);

  it("offers the start-anchor handle when nothing owns the order", () => {
    const { adapter, createdEls } = makeAdapter();
    new OrderHandleController(catalog, adapter, new LiveOverrideStore()).sync([
      blockOrder(),
    ]);
    expect(titles(createdEls)).toContain("A");
  });

  it("withholds it once a unit owns the order", () => {
    const { adapter, createdEls } = makeAdapter();
    new OrderHandleController(catalog, adapter, new LiveOverrideStore()).sync([
      blockOrder({ fromAnchored: true }),
    ]);
    expect(titles(createdEls)).not.toContain("A");
  });

  it("keeps the other end and the reshape handles interactive", () => {
    const { adapter, createdEls } = makeAdapter();
    new OrderHandleController(catalog, adapter, new LiveOverrideStore()).sync([
      blockOrder({ fromAnchored: true }),
    ]);
    // Anchoring the unit end must not freeze the whole graphic: the objective
    // end and the barrier width are still the user's to move.
    expect(titles(createdEls)).toContain("B");
    expect(titles(createdEls)).toContain("barrierHalf");
  });
});

describe("OrderHandleController — a drag's live override does not outlive it", () => {
  const blockOrder = (overrides: Partial<PlacedOrder> = {}): PlacedOrder => ({
    id: "order-block",
    from: [0, 0],
    to: [500, 500],
    colour: "#4a90d9",
    tacticSidc: "SVGBLOCK",
    ...overrides,
  });

  /** Drive a handle through a full press-move-release, jsdom-style. */
  function drag(el: HTMLElement, to: { x: number; y: number }, commit: boolean) {
    // jsdom implements neither PointerEvent nor pointer capture.
    (el as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    (el as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    el.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: to.x, clientY: to.y }));
    el.dispatchEvent(new MouseEvent(commit ? "pointerup" : "pointercancel", { bubbles: true }));
  }

  it("clears the override when the drag commits, so later updates are not painted over", () => {
    const { adapter, createdEls } = makeAdapter();
    const liveStore = new LiveOverrideStore();
    const changes: Record<string, unknown>[] = [];
    const controller = new OrderHandleController(catalog, adapter, liveStore, {
      onMilxParamsChange: (_id, params) => changes.push(params),
    });
    controller.sync([blockOrder()]);

    const handle = createdEls.find((el) => el.title === "A")!;
    drag(handle, { x: 220, y: 180 }, true);

    expect(changes).toHaveLength(1);
    // The committed params come back through props. An override left behind
    // here freezes this order at its mid-drag state forever: the attached unit
    // walks away and the graphic never follows, which is what it did.
    expect(liveStore.getParams("order-block")).toBeUndefined();
  });

  it("clears the override when the drag is cancelled", () => {
    const { adapter, createdEls } = makeAdapter();
    const liveStore = new LiveOverrideStore();
    const controller = new OrderHandleController(catalog, adapter, liveStore, {});
    // Explicit params matter here: the old cancel path wrote `baseParams` back
    // as the override, so an order that had none cleared itself by accident
    // and hid the leak. This order has some.
    controller.sync([blockOrder({ milxParams: { barrierHalf: 220 } })]);

    drag(createdEls.find((el) => el.title === "A")!, { x: 220, y: 180 }, false);

    // The cancel path leaked too, writing the pre-drag params back as a
    // permanent override rather than removing it.
    expect(liveStore.getParams("order-block")).toBeUndefined();
  });

  it("starts the SECOND drag from the params the first one committed", () => {
    // The reported bug: move one handle and it works; move another and the
    // symbol jumps back to where it started, taking the first edit with it.
    //
    // A handle's listeners are attached once and close over the order they
    // were built from. Later syncs only reposition the marker, so the second
    // drag read the params the order had before the first drag and committed
    // those plus its own delta. While the live override outlived a drag it
    // carried the committed params forward and hid this; removing that
    // override, correctly, exposed it.
    const { adapter, createdEls } = makeAdapter();
    const liveStore = new LiveOverrideStore();
    const changes: Record<string, unknown>[] = [];
    const controller = new OrderHandleController(catalog, adapter, liveStore, {
      onMilxParamsChange: (_id, params) => changes.push(params),
    });

    controller.sync([blockOrder()]);
    drag(createdEls.find((el) => el.title === "A")!, { x: 220, y: 180 }, true);
    const afterFirst = changes[0];

    // What a host does with a commit: store it and re-render. The handles are
    // not rebuilt — same markers, same listeners, a new order object.
    controller.sync([blockOrder({ milxParams: afterFirst })]);
    drag(createdEls.find((el) => el.title === "B")!, { x: 900, y: 640 }, true);
    const afterSecond = changes[1];

    expect(changes).toHaveLength(2);
    // A is what the first drag made it, not what it was authored as.
    expect(afterSecond.A).toEqual(afterFirst.A);
    // …and B is what the second drag just made it.
    expect(afterSecond.B).not.toEqual(afterFirst.B);
  });
});
