/**
 * Turning pointer positions into values, and values into percentages.
 *
 * Pure, because this is where sliders go wrong and none of it needs a DOM:
 * the estate's three hand-rolled sliders (opacity, elevation exaggeration,
 * route cost) each compute their own percentage and each has a different one
 * of these bugs:
 *
 *   - Dividing by `max` instead of by `(max - min)`, so a slider from 10 to 20
 *     starts half-filled.
 *   - Not snapping to the step, so a "whole numbers only" slider emits 7.3.
 *   - Snapping with `Math.round(value / step) * step`, which reintroduces
 *     float dust: step 0.1 gives 0.30000000000000004.
 *   - Letting the two handles of a range cross, producing min > max, which
 *     the consumer then sends to a filter that matches nothing.
 */

export interface Scale {
  min: number;
  max: number;
  step: number;
}

/** Where a value sits on the track, 0–1. Clamped, never NaN. */
export function fraction(value: number, { min, max }: Pick<Scale, "min" | "max">): number {
  const span = max - min;
  if (span <= 0) {
    // A zero-width scale is a caller mistake, but a NaN width is an invisible
    // handle — so it renders at the start rather than nowhere.
    return 0;
  }
  return Math.min(1, Math.max(0, (value - min) / span));
}

/** The value at a fraction of the track, snapped to the step. */
export function valueAt(f: number, scale: Scale): number {
  const { min, max } = scale;
  const raw = min + Math.min(1, Math.max(0, f)) * (max - min);
  return snap(raw, scale);
}

/**
 * Snap to the nearest step from `min`, then round off the float dust.
 *
 * From `min` rather than from zero: a scale of 5–25 with step 10 should offer
 * 5, 15, 25 — not 10 and 20, which is what snapping to multiples of the step
 * gives and which makes the maximum unreachable.
 */
export function snap(value: number, { min, max, step }: Scale): number {
  if (!Number.isFinite(step) || step <= 0) {
    return Math.min(max, Math.max(min, value));
  }
  const steps = Math.round((value - min) / step);
  const snapped = min + steps * step;
  const places = decimals(step);
  const rounded = places > 0 ? Number(snapped.toFixed(places)) : snapped;
  return Math.min(max, Math.max(min, rounded));
}

/** Decimal places in a step, so snapping cannot produce 0.30000000000000004. */
export function decimals(step: number): number {
  const text = `${step}`;
  const exponent = text.indexOf("e-");
  if (exponent >= 0) {
    return Number(text.slice(exponent + 2));
  }
  const point = text.indexOf(".");
  return point >= 0 ? text.length - point - 1 : 0;
}

/**
 * A keyboard press, as a change in value.
 *
 * PageUp/PageDown move ten steps, which is the convention every native range
 * input follows and which turns a 0–100 slider from 100 presses into 10.
 */
export function keyStep(
  key: string,
  value: number,
  scale: Scale,
  options: { rtl?: boolean } = {},
): number | null {
  const away = options.rtl === true ? -1 : 1;
  switch (key) {
    case "ArrowRight":
      return snap(value + away * scale.step, scale);
    case "ArrowLeft":
      return snap(value - away * scale.step, scale);
    case "ArrowUp":
      return snap(value + scale.step, scale);
    case "ArrowDown":
      return snap(value - scale.step, scale);
    case "PageUp":
      return snap(value + scale.step * 10, scale);
    case "PageDown":
      return snap(value - scale.step * 10, scale);
    case "Home":
      return scale.min;
    case "End":
      return scale.max;
    default:
      return null;
  }
}

/**
 * Move one end of a range without letting it pass the other.
 *
 * Clamps rather than swapping. Swapping is what native double-thumb widgets
 * sometimes do, and it means the handle you are dragging is suddenly the other
 * one — which under the finger feels like the control jumping.
 */
export function moveRangeEnd(
  range: readonly [number, number],
  end: 0 | 1,
  to: number,
  scale: Scale,
  options: { minSpan?: number } = {},
): [number, number] {
  const gap = options.minSpan ?? 0;
  const snapped = snap(to, scale);
  if (end === 0) {
    return [Math.min(snapped, range[1] - gap), range[1]];
  }
  return [range[0], Math.max(snapped, range[0] + gap)];
}

/** Which end of a range a click at this value should move — the nearer one. */
export function nearestEnd(range: readonly [number, number], value: number): 0 | 1 {
  const toLow = Math.abs(value - range[0]);
  const toHigh = Math.abs(value - range[1]);
  // Ties go to the upper handle: dragging out from a collapsed range is the
  // common intent, and moving the lower one would pin it at zero width.
  return toLow < toHigh ? 0 : 1;
}
