/**
 * Where a floating panel goes, as arithmetic on rectangles.
 *
 * Everything hard about a popover is this function, and everything this
 * function needs is four rectangles' worth of numbers — no DOM, no React, no
 * `ResizeObserver`. So it lives here and is tested exhaustively, and the
 * component becomes "measure, call this, apply the result".
 *
 * WHY NOT A POSITIONING LIBRARY
 * -----------------------------
 * Floating UI is the right answer in an application. It is the wrong answer in
 * this package, which has exactly one peer dependency (React) and is designed
 * to drop into a Foundry widget where every added kilobyte is loaded per
 * widget instance. What is here is a third of a positioning library: flip when
 * there is no room, clamp to the viewport, keep the anchor covered. No
 * arrows, no virtual middleware stack, no `autoUpdate`.
 *
 * WHY RECTANGLES RATHER THAN ELEMENTS
 * -----------------------------------
 * Because a right-click menu has no anchor element — its anchor is the pointer
 * — and a component that insisted on an element would force `ContextMenu` to
 * invent an invisible one, which is what the mil map's hand-rolled menu does
 * today (and why it is one pixel out on every zoom level).
 */

/** The bits of a `DOMRect` this needs. Any DOMRect satisfies it. */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";

export interface PlacementRequest {
  /** What to hang off: a trigger's rect, or a zero-size rect at a pointer. */
  anchor: Rect;
  /** The panel's own measured size. */
  floating: { width: number; height: number };
  /** Usually `{ width: innerWidth, height: innerHeight }`. */
  viewport: { width: number; height: number };
  side?: Side;
  align?: Align;
  /** Gap between anchor and panel. */
  offset?: number;
  /** Minimum distance kept from the viewport edge. */
  padding?: number;
}

export interface Placement {
  top: number;
  left: number;
  /** Where it actually went — `side` flipped if there was no room. */
  side: Side;
  align: Align;
  /**
   * The height the panel must not exceed to stay on screen.
   *
   * Returned rather than applied, because a panel that is too tall should
   * scroll internally — and only the component knows whether its content can.
   */
  maxHeight: number;
}

const vertical = (side: Side): boolean => side === "top" || side === "bottom";

/** Space available on each side of the anchor, inside the padding. */
function room(request: Required<Pick<PlacementRequest, "anchor" | "viewport" | "offset" | "padding">>) {
  const { anchor, viewport, offset, padding } = request;
  return {
    top: anchor.top - offset - padding,
    bottom: viewport.height - (anchor.top + anchor.height) - offset - padding,
    left: anchor.left - offset - padding,
    right: viewport.width - (anchor.left + anchor.width) - offset - padding,
  };
}

/** Clamp a coordinate so the panel stays inside the viewport. */
function clampAxis(value: number, size: number, limit: number, padding: number): number {
  const max = limit - size - padding;
  if (max < padding) {
    // The panel is wider (or taller) than the viewport: pin it to the near
    // edge rather than centring the overflow, so the start of the content is
    // the part that is visible.
    return padding;
  }
  return Math.min(Math.max(value, padding), max);
}

/**
 * Place the panel.
 *
 * Flips to the opposite side when the requested one cannot fit AND the
 * opposite one can — never when both are too small, because flipping into an
 * equally bad position only moves the problem and looks like a glitch. In that
 * case it keeps the requested side and reports a `maxHeight` instead.
 */
export function placeFloating(request: PlacementRequest): Placement {
  const {
    anchor,
    floating,
    viewport,
    side: wantedSide = "bottom",
    align: wantedAlign = "start",
    offset = 4,
    padding = 8,
  } = request;

  const space = room({ anchor, viewport, offset, padding });
  const needed = vertical(wantedSide) ? floating.height : floating.width;

  const opposite: Record<Side, Side> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };

  let side = wantedSide;
  if (space[wantedSide] < needed && space[opposite[wantedSide]] >= needed) {
    side = opposite[wantedSide];
  }

  let top: number;
  let left: number;

  if (vertical(side)) {
    top = side === "bottom" ? anchor.top + anchor.height + offset : anchor.top - floating.height - offset;
    const aligned =
      wantedAlign === "start"
        ? anchor.left
        : wantedAlign === "end"
          ? anchor.left + anchor.width - floating.width
          : anchor.left + anchor.width / 2 - floating.width / 2;
    left = clampAxis(aligned, floating.width, viewport.width, padding);
    top = clampAxis(top, floating.height, viewport.height, padding);
  } else {
    left = side === "right" ? anchor.left + anchor.width + offset : anchor.left - floating.width - offset;
    const aligned =
      wantedAlign === "start"
        ? anchor.top
        : wantedAlign === "end"
          ? anchor.top + anchor.height - floating.height
          : anchor.top + anchor.height / 2 - floating.height / 2;
    top = clampAxis(aligned, floating.height, viewport.height, padding);
    left = clampAxis(left, floating.width, viewport.width, padding);
  }

  // What is left between the panel's chosen edge and the viewport, so content
  // that can scroll knows how much it has.
  const maxHeight = vertical(side)
    ? Math.max(space[side], 0)
    : Math.max(viewport.height - 2 * padding, 0);

  return { top, left, side, align: wantedAlign, maxHeight };
}
