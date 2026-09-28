import { describe, expect, it } from "vitest";

import { DEFAULT_UNIT_SCALE, unitSizeForZoom } from "./unitScale";

const scale = { base: 26, ...DEFAULT_UNIT_SCALE };

describe("unitSizeForZoom", () => {
  it("is the base size at the anchor zoom", () => {
    expect(unitSizeForZoom(scale.anchorZoom, scale)).toBe(26);
  });

  it("doubles per zoom level, which is what fixed-on-the-ground means", () => {
    // One zoom level is a factor of two in scale. This is the whole feature:
    // the symbol grows with the order arrow attached to it instead of staying
    // a postage stamp at the tail of a kilometre-long axis.
    expect(unitSizeForZoom(13, scale)).toBe(52);
    // z11 would be 13px, which is already under the floor — the first level
    // out is where the clamp starts to bite.
    expect(unitSizeForZoom(11, scale)).toBe(scale.min);
  });

  it("pins at the bounds rather than vanishing or filling the screen", () => {
    // Taken literally, ground-fixed is 0.4px at z6 and 1,664px at z18. A unit
    // is a thing standing ON the ground, not a piece of it, and its size is a
    // cartographic convention.
    expect(unitSizeForZoom(6, scale)).toBe(scale.min);
    expect(unitSizeForZoom(18, scale)).toBe(scale.max);
    expect(unitSizeForZoom(0, scale)).toBe(scale.min);
  });

  it("keeps a fully zoomed-in unit to a readable size", () => {
    // The ceiling was 96px, which a symbol reaches by z14 — one battalion
    // covering a village. Growing with the map has to stop somewhere well
    // short of that.
    expect(unitSizeForZoom(16, scale)).toBeLessThanOrEqual(64);
    // And still obviously bigger than it is zoomed out, or the feature is
    // pointless.
    expect(unitSizeForZoom(16, scale)).toBeGreaterThan(
      unitSizeForZoom(11, scale) * 2,
    );
  });

  it("scales freely across the working window", () => {
    // z11 to z13 with these defaults, which is the range a planner actually
    // reads these maps at. The clamps must not bite inside it.
    const sizes = [11.5, 12, 12.5, 13].map((z) => unitSizeForZoom(z, scale));
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
    expect(sizes[sizes.length - 1]).toBeLessThan(scale.max);
  });

  it("survives a zoom it cannot use", () => {
    // getZoom() before the map has settled, in practice.
    expect(unitSizeForZoom(Number.NaN, scale)).toBe(26);
  });

  it("rounds, because the caller re-renders when this changes", () => {
    // A continuous value would re-render every marker on every frame of a
    // pinch for differences below a pixel.
    for (const zoom of [10.1, 11.37, 12.5, 13.9]) {
      expect(Number.isInteger(unitSizeForZoom(zoom, scale))).toBe(true);
    }
  });
});
