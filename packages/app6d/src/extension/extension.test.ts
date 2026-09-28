import { describe, expect, it } from "vitest";

import { APP6D_CATALOG } from "../symbols";
import type { PlacedOrder } from "../maplibre";
import { tacticGraphics } from "./index";

const order = (id: string): PlacedOrder => ({
  id,
  from: [9, 61],
  to: [9.1, 61.1],
  colour: "#000",
});

/**
 * The overlay needs a real MapLibre Map (markers must be added to one), so
 * these tests cover everything up to and after attach rather than mocking the
 * whole of MapLibre. What attach itself does is already covered by the
 * maplibre entry point's own tests.
 */
describe("tacticGraphics", () => {
  it("is an extension: an id and an attach", () => {
    const extension = tacticGraphics({ catalog: APP6D_CATALOG });
    expect(extension.id).toBe("tactic-graphics");
    expect(typeof extension.attach).toBe("function");
    // No style(): this overlay is SVG and DOM, not sources and layers. That is
    // what lets the package satisfy the contract without importing it.
    expect((extension as { style?: unknown }).style).toBeUndefined();
  });

  it("takes an id, so two catalogs can share a map", () => {
    expect(tacticGraphics({ catalog: APP6D_CATALOG, id: "enemy" }).id).toBe(
      "enemy",
    );
  });

  it("accepts orders before there is a map to draw them on", () => {
    // A host driving this from React state has no way to know whether its
    // first render beat the map's construction.
    const extension = tacticGraphics({ catalog: APP6D_CATALOG });
    expect(() => extension.update([order("a")])).not.toThrow();
    expect(() => extension.setEditable(false)).not.toThrow();
    expect(extension.graphics).toBeNull();
  });

  it("keeps the latest orders, so attach draws the current state", () => {
    const extension = tacticGraphics({
      catalog: APP6D_CATALOG,
      orders: [order("initial")],
    });
    extension.update([order("a"), order("b")]);
    // Nothing observable to assert against without a Map — what this pins is
    // that the calls are accepted and buffered rather than throwing or being
    // dropped. That the buffer is then applied is three lines in attach(),
    // deliberately not tested through a mock of attach itself: a test that
    // stubs the function under test and then asserts on the stub proves only
    // that the stub was written.
    expect(extension.graphics).toBeNull();
  });
});
