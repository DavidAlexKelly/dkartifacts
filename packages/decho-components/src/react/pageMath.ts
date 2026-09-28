/**
 * Page arithmetic, and the window of page numbers to show.
 *
 * Pure because off-by-one errors are the whole of pagination, and they are
 * invisible until the last page. Both of the estate's hand-rolled pagers
 * have the same two: a final page that is one short, and a page count of 1
 * for an empty list (so an empty table says "Page 1 of 1").
 */

export interface PageRequest {
  /** Zero-based, because slicing an array is the common consumer. */
  page: number;
  pageSize: number;
  total: number;
}

export interface PageInfo {
  page: number;
  pageCount: number;
  /** Inclusive, one-based, for "Showing 21–40 of 96". Zeros when empty. */
  from: number;
  to: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** For `array.slice(...)`. */
  start: number;
  end: number;
}

export function pageInfo({ page, pageSize, total }: PageRequest): PageInfo {
  const size = Math.max(1, Math.floor(pageSize));
  const count = Math.ceil(Math.max(0, total) / size);
  // Zero pages for no rows, not one. "Page 1 of 1" over an empty table is a
  // claim that there is a page of results.
  const pageCount = count;
  const current = pageCount === 0 ? 0 : Math.min(Math.max(0, Math.floor(page)), pageCount - 1);
  const start = current * size;
  const end = Math.min(start + size, Math.max(0, total));

  return {
    page: current,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: end,
    total: Math.max(0, total),
    hasPrevious: current > 0,
    hasNext: pageCount > 0 && current < pageCount - 1,
    start,
    end,
  };
}

/** `null` is a gap: "1 … 7 8 9 … 24". */
export type PageToken = number | null;

/**
 * The page numbers to render, windowed around the current page.
 *
 * Always shows the first and last page, because "how many are there" and "take
 * me to the end" are the two questions a pager is for. The window is a fixed
 * width so the control does not change size as you move through it — a pager
 * that reflows under the cursor makes you misclick.
 */
export function pageWindow(page: number, pageCount: number, span = 5): PageToken[] {
  if (pageCount <= 0) {
    return [];
  }
  if (pageCount <= span + 2) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const half = Math.floor(span / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(pageCount - 2, page + half);

  // Slide the window when it runs into either end, so it keeps its width
  // rather than shrinking.
  if (page - half < 1) {
    end = Math.min(pageCount - 2, end + (1 - (page - half)));
  }
  if (page + half > pageCount - 2) {
    start = Math.max(1, start - (page + half - (pageCount - 2)));
  }

  const tokens: PageToken[] = [0];
  if (start > 1) {
    tokens.push(null);
  }
  for (let index = start; index <= end; index += 1) {
    tokens.push(index);
  }
  if (end < pageCount - 2) {
    tokens.push(null);
  }
  tokens.push(pageCount - 1);
  return tokens;
}

/** "Showing 21–40 of 96 objects" — the sentence, in one place. */
export function pageSummary(info: PageInfo, noun = "rows"): string {
  if (info.total === 0) {
    return `No ${noun}`;
  }
  if (info.pageCount === 1) {
    return `${info.total} ${noun}`;
  }
  return `${info.from}–${info.to} of ${info.total} ${noun}`;
}
