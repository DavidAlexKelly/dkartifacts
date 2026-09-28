import { describe, it, expect } from "vitest";
import { SymbolCatalog } from "../engine/catalog";
import { getSymbolAnchorPoint } from "../core/tacticOrders";
import { resolveFromForUnitPosition } from "./unitAttachment";
import { seizeSymbol, SEIZE_NAME } from "../symbols/catalog/individual/seize";
import { blockSymbol, BLOCK_NAME } from "../symbols/catalog/individual/block";
import type { MapAdapter } from "../adapter/types";

const catalog = new SymbolCatalog({ [SEIZE_NAME]: seizeSymbol, [BLOCK_NAME]: blockSymbol });

// A trivial 1-unit-world = 1px-screen adapter, offset by a fixed pan so
// world (0,0) isn't screen (0,0) either — exercises the full
// project/unproject round-trip rather than accidentally passing due to
// both being identity.
const PAN = { x: 500, y: 300 };
function makeAdapter(zoom: number): MapAdapter {
  return {
    project: ([x, y]) => ({ x: x + PAN.x, y: y + PAN.y }),
    unproject: (p) => [p.x - PAN.x, p.y - PAN.y],
    getContainer: () => ({} as HTMLElement), // never called by resolveFromForUnitPosition
    getZoom: () => zoom,
    onCameraChange: () => () => {},
    createMarker: () => {
      throw new Error("not needed for this test");
    },
  };
}

describe("resolveFromForUnitPosition", () => {
  it("keeps a symbol's declared anchor point glued to the unit's world position, not just `from`", () => {
    const adapter = makeAdapter(15);
    const unitWorldPos: [number, number] = [10, 20];

    const from = resolveFromForUnitPosition(catalog, adapter, "SVGSEIZE", unitWorldPos);

    // Render the symbol at the resolved `from` and confirm its OWN declared
    // anchor point — not the raw translation origin — lands exactly on the
    // unit's screen position. This is the exact bug: naively assigning
    // order.from = unitWorldPos (skipping this function) leaves Seize's
    // anchor offset by a fixed, symbol-specific amount instead.
    const fromScreen = adapter.project(from);
    const zoomScale = Math.pow(2, 15 - 7);
    const s = 0.004 * zoomScale;
    const ORIGIN = { x: 1050, y: 950 };
    const anchorParamSpace = getSymbolAnchorPoint(catalog, "svg-seize")!;
    const renderedAnchorScreen = {
      x: fromScreen.x + (anchorParamSpace.x - ORIGIN.x) * s,
      y: fromScreen.y + (anchorParamSpace.y - ORIGIN.y) * s,
    };
    const unitScreen = adapter.project(unitWorldPos);
    expect(renderedAnchorScreen.x).toBeCloseTo(unitScreen.x, 6);
    expect(renderedAnchorScreen.y).toBeCloseTo(unitScreen.y, 6);
  });

  it("naive direct assignment (order.from = unitWorldPos) would NOT do this — demonstrates the bug this function fixes", () => {
    const adapter = makeAdapter(15);
    const unitWorldPos: [number, number] = [10, 20];

    const correctFrom = resolveFromForUnitPosition(catalog, adapter, "SVGBLOCK", unitWorldPos);
    // Block's declared anchor ("A") sits nowhere near MILX_ORIGIN, so the
    // naive `from` (just the unit's own position) must differ substantially
    // from the correct one.
    expect(correctFrom).not.toEqual(unitWorldPos);
    const dx = correctFrom[0] - unitWorldPos[0];
    const dy = correctFrom[1] - unitWorldPos[1];
    expect(Math.hypot(dx, dy)).toBeGreaterThan(100);
  });

  it("returns unitWorldPos unchanged for a sidc with no declared unitAnchor", () => {
    const noAnchorCatalog = new SymbolCatalog({
      plain: {
        title: "Plain",
        params: { A: { x: 0, y: 0 } },
        generate: () => [],
        handles: (p) => [{ id: "A", kind: "point", pos: p.A, set: (pos) => ({ A: pos }) }],
      },
    });
    const adapter = makeAdapter(10);
    const unitWorldPos: [number, number] = [5, 5];
    expect(resolveFromForUnitPosition(noAnchorCatalog, adapter, "PLAIN", unitWorldPos)).toEqual(unitWorldPos);
  });

  it("returns unitWorldPos unchanged when sidc is undefined", () => {
    const adapter = makeAdapter(10);
    const unitWorldPos: [number, number] = [5, 5];
    expect(resolveFromForUnitPosition(catalog, adapter, undefined, unitWorldPos)).toEqual(unitWorldPos);
  });
});
