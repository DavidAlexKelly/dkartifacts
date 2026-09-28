/**
 * The placement arithmetic, including the cases that make hand-rolled
 * popovers look broken: a menu opening off the bottom of a widget, a dropdown
 * whose right edge is past the viewport, and a panel taller than the screen.
 */

import { describe, expect, it } from "vitest";
import { placeFloating, type Rect } from "./placement.js";

const viewport = { width: 1000, height: 600 };
const anchor: Rect = { top: 200, left: 400, width: 120, height: 28 };
const floating = { width: 200, height: 160 };

describe("placeFloating", () => {
  it("puts the panel under the anchor, left edges aligned", () => {
    const place = placeFloating({ anchor, floating, viewport });
    expect(place.side).toBe("bottom");
    expect(place.top).toBe(232); // 200 + 28 + 4
    expect(place.left).toBe(400);
  });

  it("flips above when there is no room below", () => {
    const low: Rect = { ...anchor, top: 520 };
    const place = placeFloating({ anchor: low, floating, viewport });
    expect(place.side).toBe("top");
    expect(place.top).toBe(356); // 520 - 160 - 4
  });

  it("keeps the requested side when neither side fits", () => {
    // Flipping into an equally impossible position moves the problem and
    // reads as a glitch. The caller gets a maxHeight instead.
    const tall = { width: 200, height: 900 };
    const place = placeFloating({ anchor, floating: tall, viewport });
    expect(place.side).toBe("bottom");
    expect(place.maxHeight).toBeLessThan(tall.height);
  });

  it("reports how much height there is on the side it chose", () => {
    const place = placeFloating({ anchor, floating, viewport });
    // 600 - (200 + 28) - 4 - 8
    expect(place.maxHeight).toBe(360);
  });

  it("clamps a panel that would hang off the right edge", () => {
    const right: Rect = { ...anchor, left: 950 };
    const place = placeFloating({ anchor: right, floating, viewport });
    expect(place.left).toBe(792); // 1000 - 200 - 8
  });

  it("clamps a panel that would hang off the left edge", () => {
    const left: Rect = { ...anchor, left: -40 };
    const place = placeFloating({ anchor: left, floating, viewport, align: "end" });
    expect(place.left).toBe(8);
  });

  it("aligns to the anchor's end when asked", () => {
    const place = placeFloating({ anchor, floating, viewport, align: "end" });
    expect(place.left).toBe(320); // 400 + 120 - 200
  });

  it("centres on the anchor when asked", () => {
    const place = placeFloating({ anchor, floating, viewport, align: "center" });
    expect(place.left).toBe(360); // 400 + 60 - 100
  });

  it("places to the side, and flips side-to-side too", () => {
    const place = placeFloating({ anchor, floating, viewport, side: "right" });
    expect(place.left).toBe(524); // 400 + 120 + 4

    const nearRight: Rect = { ...anchor, left: 900 };
    const flipped = placeFloating({ anchor: nearRight, floating, viewport, side: "right" });
    expect(flipped.side).toBe("left");
    expect(flipped.left).toBe(696); // 900 - 200 - 4
  });

  it("pins to the near edge when the panel is wider than the viewport", () => {
    // Centring the overflow would hide the start of the content, which is the
    // part that matters.
    const wide = { width: 1200, height: 100 };
    const place = placeFloating({ anchor, floating: wide, viewport });
    expect(place.left).toBe(8);
  });

  it("works with a zero-size anchor, which is what a right-click is", () => {
    const pointer: Rect = { top: 300, left: 500, width: 0, height: 0 };
    const place = placeFloating({ anchor: pointer, floating, viewport, offset: 0 });
    expect(place.top).toBe(300);
    expect(place.left).toBe(500);
  });

  it("respects a custom offset and padding", () => {
    const place = placeFloating({ anchor, floating, viewport, offset: 12, padding: 24 });
    expect(place.top).toBe(240); // 200 + 28 + 12
    const right: Rect = { ...anchor, left: 950 };
    expect(placeFloating({ anchor: right, floating, viewport, padding: 24 }).left).toBe(776);
  });
});
