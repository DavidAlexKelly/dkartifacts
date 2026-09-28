/**
 * The four slider bugs from the estate, pinned.
 */

import { describe, expect, it } from "vitest";
import {
  decimals,
  fraction,
  keyStep,
  moveRangeEnd,
  nearestEnd,
  snap,
  valueAt,
} from "./sliderMath.js";

const percent = { min: 0, max: 100, step: 1 };
const offset = { min: 10, max: 20, step: 1 };
const fine = { min: 0, max: 1, step: 0.1 };

describe("fraction", () => {
  it("measures against the span, not against the maximum", () => {
    // The opacity slider bug: min 10, max 20, value 10 rendered half-filled
    // because it divided by max.
    expect(fraction(10, offset)).toBe(0);
    expect(fraction(15, offset)).toBe(0.5);
    expect(fraction(20, offset)).toBe(1);
  });

  it("clamps rather than overflowing the track", () => {
    expect(fraction(-20, percent)).toBe(0);
    expect(fraction(140, percent)).toBe(1);
  });

  it("returns 0 rather than NaN for a zero-width scale", () => {
    // NaN is an invisible handle; 0 is a wrong-looking but visible one.
    expect(fraction(5, { min: 5, max: 5 })).toBe(0);
  });
});

describe("snap", () => {
  it("snaps from the minimum, so the maximum stays reachable", () => {
    // 5–25 step 10 offers 5, 15, 25. Snapping to multiples of the step would
    // offer 10 and 20 and make 25 unreachable.
    const scale = { min: 5, max: 25, step: 10 };
    expect(snap(7, scale)).toBe(5);
    expect(snap(12, scale)).toBe(15);
    expect(snap(24, scale)).toBe(25);
  });

  it("does not leave float dust", () => {
    expect(snap(0.3000000004, fine)).toBe(0.3);
    expect(snap(0.25, fine)).toBe(0.3);
  });

  it("stays inside the bounds", () => {
    expect(snap(999, percent)).toBe(100);
    expect(snap(-4, percent)).toBe(0);
  });

  it("survives a nonsense step instead of returning NaN", () => {
    expect(snap(5, { min: 0, max: 10, step: 0 })).toBe(5);
    expect(snap(5, { min: 0, max: 10, step: Number.NaN })).toBe(5);
  });
});

describe("valueAt", () => {
  it("converts a track fraction to a snapped value", () => {
    expect(valueAt(0, percent)).toBe(0);
    expect(valueAt(0.5, percent)).toBe(50);
    expect(valueAt(1, percent)).toBe(100);
    expect(valueAt(0.37, fine)).toBe(0.4);
  });

  it("clamps a fraction outside the track — a drag past the end", () => {
    expect(valueAt(-0.5, percent)).toBe(0);
    expect(valueAt(1.5, percent)).toBe(100);
  });
});

describe("decimals", () => {
  it("counts the places a step implies", () => {
    expect(decimals(1)).toBe(0);
    expect(decimals(0.25)).toBe(2);
    expect(decimals(1e-3)).toBe(3);
  });
});

describe("keyStep", () => {
  it("moves one step with the arrows", () => {
    expect(keyStep("ArrowRight", 50, percent)).toBe(51);
    expect(keyStep("ArrowLeft", 50, percent)).toBe(49);
  });

  it("moves ten with Page keys, which is what makes a long slider usable", () => {
    expect(keyStep("PageUp", 50, percent)).toBe(60);
    expect(keyStep("PageDown", 50, percent)).toBe(40);
  });

  it("jumps to the ends with Home and End", () => {
    expect(keyStep("Home", 50, percent)).toBe(0);
    expect(keyStep("End", 50, percent)).toBe(100);
  });

  it("reverses left and right in a right-to-left layout, but not up and down", () => {
    expect(keyStep("ArrowRight", 50, percent, { rtl: true })).toBe(49);
    expect(keyStep("ArrowUp", 50, percent, { rtl: true })).toBe(51);
  });

  it("ignores keys that are not its business", () => {
    expect(keyStep("a", 50, percent)).toBeNull();
    expect(keyStep("Enter", 50, percent)).toBeNull();
  });
});

describe("moveRangeEnd", () => {
  it("stops the handles crossing rather than swapping them", () => {
    // Crossing produces min > max, which the consumer sends to a filter that
    // then matches nothing. Swapping makes the handle under the finger change
    // identity mid-drag.
    expect(moveRangeEnd([20, 60], 0, 80, percent)).toEqual([60, 60]);
    expect(moveRangeEnd([20, 60], 1, 5, percent)).toEqual([20, 20]);
  });

  it("keeps a minimum span when asked", () => {
    expect(moveRangeEnd([20, 60], 0, 80, percent, { minSpan: 10 })).toEqual([50, 60]);
  });

  it("snaps the end it moves and leaves the other exactly as it was", () => {
    expect(moveRangeEnd([0.2, 0.6], 0, 0.37, fine)).toEqual([0.4, 0.6]);
  });
});

describe("nearestEnd", () => {
  it("picks the handle closest to the click", () => {
    expect(nearestEnd([20, 60], 25)).toBe(0);
    expect(nearestEnd([20, 60], 55)).toBe(1);
  });

  it("gives ties to the upper handle, so a collapsed range can be opened", () => {
    expect(nearestEnd([50, 50], 50)).toBe(1);
  });
});
