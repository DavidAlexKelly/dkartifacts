/**
 * The arithmetic behind `NumberInput`, as pure functions.
 *
 * Separate from the component because this is where numeric inputs actually go
 * wrong, and none of it needs React to be tested. Three real failures from the
 * estate, all reproduced in `numberInput.test.ts`:
 *
 *   1. `parseFloat("12abc")` is `12`, so a fat-fingered threshold became a
 *      silently different threshold.
 *   2. `0.1 + 0.2` is `0.30000000000000004`, so stepping a weight up and down
 *      once left a value that failed an equality check against its own default
 *      and marked a clean form dirty.
 *   3. An empty field is not zero. A blanked-out "minimum quantity" that reads
 *      as `0` is a filter that matches everything.
 */

/** A parsed value: a number, or `null` for "the field is empty". */
export type NumberValue = number | null;

/**
 * Parse what the user typed, strictly.
 *
 * Returns `undefined` for input that is not a number at all, which the caller
 * keeps as in-progress text rather than committing. `"-"`, `"."` and `"1e"`
 * are all legitimate halfway states on the way to a number, so they parse as
 * `undefined` rather than as an error.
 */
export function parseNumber(text: string): NumberValue | undefined {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  // Deliberately not `parseFloat`: it stops at the first character it cannot
  // use and returns what it has. `Number` rejects the whole string, which is
  // what "is this a number" should mean.
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** Decimal places implied by a step, so stepping cannot create float dust. */
export function precisionOf(step: number): number {
  if (!Number.isFinite(step) || Number.isInteger(step)) {
    return 0;
  }
  const text = `${step}`;
  const exponent = text.indexOf("e-");
  if (exponent >= 0) {
    // 1e-3 → 3 decimal places.
    return Number(text.slice(exponent + 2));
  }
  const point = text.indexOf(".");
  return point >= 0 ? text.length - point - 1 : 0;
}

/**
 * Round to the precision a step implies: `0.1 + 0.2` → `0.3`.
 *
 * NOT decimal-correct rounding, and not pretending to be. `1.005` is stored as
 * 1.0049999999999998934, so it rounds *down* — correctly, for the number that
 * is actually there. The usual workaround (`Math.round((v + EPSILON) * 100)`)
 * fixes that case and breaks 1.0049 in the opposite direction, silently, which
 * is a worse trade.
 *
 * This exists to remove dust left by arithmetic the component did, not to
 * round what a user typed — typed values are kept exactly as entered. A
 * workflow needing decimal-correct rounding needs a decimal library.
 */
export function roundToStep(value: number, step: number): number {
  const places = precisionOf(step);
  if (places === 0) {
    return value;
  }
  return Number(value.toFixed(places));
}

export interface Bounds {
  min?: number;
  max?: number;
}

/** Clamp into range, tolerating either bound being absent. */
export function clamp(value: number, bounds: Bounds = {}): number {
  let result = value;
  if (typeof bounds.min === "number" && result < bounds.min) {
    result = bounds.min;
  }
  if (typeof bounds.max === "number" && result > bounds.max) {
    result = bounds.max;
  }
  return result;
}

/**
 * One press of the up or down control.
 *
 * Starts from `min` (or zero) when the field is empty, because a spinner that
 * does nothing on an empty field is the commonest complaint about every
 * hand-rolled one in this estate.
 */
export function stepValue(
  value: NumberValue,
  direction: 1 | -1,
  step: number,
  bounds: Bounds = {},
): number {
  const from = value ?? bounds.min ?? 0;
  return clamp(roundToStep(from + direction * step, step), bounds);
}

/** Whether a committed value breaks its own bounds — for `aria-invalid`. */
export function outOfBounds(value: NumberValue, bounds: Bounds = {}): boolean {
  if (value == null) {
    return false;
  }
  return clamp(value, bounds) !== value;
}
