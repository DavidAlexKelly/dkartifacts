/**
 * Which rows are on screen, as arithmetic.
 *
 * This is the whole of virtualisation. Everything else — the scroll listener,
 * the spacer divs — is five lines of React around it, which is why it is worth
 * doing here rather than taking a dependency: `@tanstack/virtual` is excellent
 * and is 12kB this package would carry into every widget instance, for a
 * fixed-row-height table that needs sixty lines of maths.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * Variable row heights. Measuring rows, caching measurements and correcting
 * the scroll position as estimates are replaced is where a virtualiser stops
 * being sixty lines — and every table in this estate has rows of one height.
 * If a workflow ever needs variable heights, that is the moment to take the
 * dependency rather than to grow this into a worse copy of it.
 *
 * THE BUG THIS PREVENTS
 * ---------------------
 * `DataTable` renders every row. Eight hundred objects with a status chip and
 * a progress bar each is ~4,000 DOM nodes, and the readiness table visibly
 * stutters on scroll at that size. The fix is not "fewer columns".
 */

export interface VirtualRangeRequest {
  rowCount: number;
  /** Every row is this tall, in pixels. */
  rowHeight: number;
  /** `scrollTop` of the scrolling element. */
  scrollTop: number;
  /** Its visible height. */
  viewportHeight: number;
  /**
   * Rows rendered beyond each edge.
   *
   * Six by default: enough that a fast scroll does not show blank space before
   * React catches up, few enough that the DOM stays small. Zero is correct
   * only in a test.
   */
  overscan?: number;
}

export interface VirtualRange {
  /** First rendered row, inclusive. */
  start: number;
  /** Last rendered row, EXCLUSIVE — so `rows.slice(start, end)` is the set. */
  end: number;
  /** Height of the spacer above, in pixels. */
  paddingTop: number;
  /** Height of the spacer below. */
  paddingBottom: number;
  /** Total scrollable height, for the container. */
  totalHeight: number;
}

export function virtualRange({
  rowCount,
  rowHeight,
  scrollTop,
  viewportHeight,
  overscan = 6,
}: VirtualRangeRequest): VirtualRange {
  const height = Math.max(1, rowHeight);
  const total = Math.max(0, rowCount) * height;

  if (rowCount <= 0) {
    return { start: 0, end: 0, paddingTop: 0, paddingBottom: 0, totalHeight: 0 };
  }

  // A negative scrollTop is what an elastic overscroll gives you on macOS, and
  // a scrollTop past the end happens when rows are removed while scrolled.
  const top = Math.min(Math.max(0, scrollTop), Math.max(0, total - 1));

  const firstVisible = Math.floor(top / height);
  const visibleCount = Math.ceil(Math.max(0, viewportHeight) / height) + 1;

  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(rowCount, firstVisible + visibleCount + overscan);

  return {
    start,
    end,
    paddingTop: start * height,
    // Computed from the remaining rows rather than as `total - paddingTop -
    // renderedHeight`: the subtraction form drifts by a pixel per rounding and
    // the scrollbar then twitches as you scroll.
    paddingBottom: Math.max(0, (rowCount - end) * height),
    totalHeight: total,
  };
}

/**
 * Where to scroll so that a row is visible, or `null` if it already is.
 *
 * Null rather than the current position, so a caller can skip the scroll
 * entirely — setting `scrollTop` to its own value still cancels a smooth
 * scroll that is in flight, which makes keyboard navigation jerk.
 */
export function scrollToRow(
  index: number,
  { rowHeight, scrollTop, viewportHeight }: Omit<VirtualRangeRequest, "rowCount" | "overscan">,
): number | null {
  const height = Math.max(1, rowHeight);
  const rowTop = index * height;
  const rowBottom = rowTop + height;

  if (rowTop < scrollTop) {
    return rowTop;
  }
  if (rowBottom > scrollTop + viewportHeight) {
    return rowBottom - viewportHeight;
  }
  return null;
}
