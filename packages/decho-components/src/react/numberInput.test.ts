/**
 * The three numeric failures this component exists to prevent, plus the
 * boundary cases the estate's hand-rolled versions get wrong.
 */

import { describe, expect, it } from "vitest";
import {
  clamp,
  outOfBounds,
  parseNumber,
  precisionOf,
  roundToStep,
  stepValue,
} from "./numberInput.js";

describe("parseNumber", () => {
  it("rejects what parseFloat would have accepted", () => {
    // The real bug: a threshold typed as "12abc" became 12 without a word.
    expect(Number.parseFloat("12abc")).toBe(12);
    expect(parseNumber("12abc")).toBeUndefined();
  });

  it("treats an empty field as empty, not as zero", () => {
    // A blanked-out "minimum quantity" that reads as 0 matches everything.
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
  });

  it("parses the numbers people type", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber("-3.5")).toBe(-3.5);
    expect(parseNumber(" 0.25 ")).toBe(0.25);
    expect(parseNumber("1e3")).toBe(1000);
  });

  it("returns undefined for half-typed numbers rather than erroring", () => {
    // These are all legitimate states on the way to a value; the component
    // keeps the text and says nothing to the caller.
    for (const halfway of ["-", ".", "1e", "-."]) {
      expect(parseNumber(halfway), halfway).toBeUndefined();
    }
  });

  it("rejects infinities, which are not values a form can hold", () => {
    expect(parseNumber("Infinity")).toBeUndefined();
    expect(parseNumber("NaN")).toBeUndefined();
  });
});

describe("precisionOf", () => {
  it("reads the decimal places out of a step", () => {
    expect(precisionOf(1)).toBe(0);
    expect(precisionOf(0.5)).toBe(1);
    expect(precisionOf(0.01)).toBe(2);
    expect(precisionOf(0.001)).toBe(3);
  });

  it("handles a step written in exponent form", () => {
    expect(precisionOf(1e-3)).toBe(3);
  });
});

describe("roundToStep", () => {
  it("removes the float dust that marked a clean form dirty", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(roundToStep(0.1 + 0.2, 0.1)).toBe(0.3);
  });

  it("leaves integers alone", () => {
    expect(roundToStep(7, 1)).toBe(7);
  });

  it("does NOT fix 1.005, and that is deliberate", () => {
    // Recorded rather than fixed. `1.005` is not 1.005 in binary64 — it is
    // 1.0049999999999998934 — so it is genuinely below the half-way point and
    // rounds down. No amount of cleverness changes that without decimal
    // arithmetic, and the popular workaround is worse than the problem:
    // `Math.round((v + Number.EPSILON) * 100) / 100` gives 1.01 here but also
    // rounds 1.0049 up to 1, which is wrong in the other direction and silent.
    //
    // It does not matter for what this function is for. Its job is removing
    // dust left by arithmetic the component did (0.1 + 0.2), not rounding
    // figures a user typed — typed values are parsed and kept exactly as
    // entered. If a workflow ever needs decimal-correct rounding, that is a
    // decimal library, not a one-liner.
    expect(roundToStep(1.005, 0.01)).toBe(1);
    expect(Math.round((1.0049 + Number.EPSILON) * 100) / 100).toBe(1);
  });
});

describe("clamp", () => {
  it("tolerates either bound being absent", () => {
    expect(clamp(5)).toBe(5);
    expect(clamp(5, { min: 10 })).toBe(10);
    expect(clamp(5, { max: 3 })).toBe(3);
    expect(clamp(5, { min: 0, max: 10 })).toBe(5);
  });
});

describe("stepValue", () => {
  it("steps from the minimum when the field is empty", () => {
    // A spinner that does nothing on an empty field is the commonest
    // complaint about every hand-rolled one here.
    expect(stepValue(null, 1, 1, { min: 3 })).toBe(4);
    expect(stepValue(null, 1, 1)).toBe(1);
  });

  it("stays on the step grid", () => {
    let value = 0.1;
    value = stepValue(value, 1, 0.1);
    value = stepValue(value, -1, 0.1);
    expect(value).toBe(0.1);
  });

  it("stops at the bounds rather than passing them", () => {
    expect(stepValue(10, 1, 1, { max: 10 })).toBe(10);
    expect(stepValue(0, -1, 1, { min: 0 })).toBe(0);
  });
});

describe("outOfBounds", () => {
  it("is false for an empty field, which cannot be out of range", () => {
    expect(outOfBounds(null, { min: 1 })).toBe(false);
  });

  it("flags a value outside its own bounds", () => {
    expect(outOfBounds(11, { max: 10 })).toBe(true);
    expect(outOfBounds(10, { max: 10 })).toBe(false);
  });
});
