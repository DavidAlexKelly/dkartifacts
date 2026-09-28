/**
 * Pagination, including the last page and the empty case — the two places
 * every hand-rolled pager is wrong.
 */

import { describe, expect, it } from "vitest";
import { pageInfo, pageSummary, pageWindow } from "./pageMath.js";

describe("pageInfo", () => {
  it("describes a middle page", () => {
    const info = pageInfo({ page: 1, pageSize: 20, total: 96 });
    expect(info).toMatchObject({
      page: 1,
      pageCount: 5,
      from: 21,
      to: 40,
      hasPrevious: true,
      hasNext: true,
      start: 20,
      end: 40,
    });
  });

  it("gets the last page right when it is not full", () => {
    // 96 rows in pages of 20: the fifth page is 81–96, and `to` is 96 rather
    // than the 100 that `start + pageSize` would give.
    const info = pageInfo({ page: 4, pageSize: 20, total: 96 });
    expect(info.from).toBe(81);
    expect(info.to).toBe(96);
    expect(info.end).toBe(96);
    expect(info.hasNext).toBe(false);
  });

  it("says there are no pages for no rows", () => {
    // "Page 1 of 1" over an empty table claims there is a page of results.
    const info = pageInfo({ page: 0, pageSize: 20, total: 0 });
    expect(info.pageCount).toBe(0);
    expect(info.from).toBe(0);
    expect(info.to).toBe(0);
    expect(info.hasNext).toBe(false);
    expect(info.hasPrevious).toBe(false);
  });

  it("clamps a page beyond the end, which is what a stale URL gives you", () => {
    expect(pageInfo({ page: 99, pageSize: 20, total: 96 }).page).toBe(4);
    expect(pageInfo({ page: -3, pageSize: 20, total: 96 }).page).toBe(0);
  });

  it("survives a nonsense page size", () => {
    expect(pageInfo({ page: 0, pageSize: 0, total: 5 }).pageCount).toBe(5);
  });
});

describe("pageWindow", () => {
  it("lists every page when they all fit", () => {
    expect(pageWindow(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("always shows the first and last page", () => {
    const tokens = pageWindow(12, 24);
    expect(tokens[0]).toBe(0);
    expect(tokens[tokens.length - 1]).toBe(23);
  });

  it("puts gaps where pages are skipped", () => {
    expect(pageWindow(12, 24)).toEqual([0, null, 10, 11, 12, 13, 14, null, 23]);
  });

  it("keeps its width at both ends, rather than shrinking", () => {
    // A pager that changes size as you move through it makes you misclick.
    const atStart = pageWindow(0, 24);
    const atEnd = pageWindow(23, 24);
    expect(atStart).toHaveLength(atEnd.length);
    expect(atStart).toEqual([0, 1, 2, 3, 4, 5, null, 23]);
    expect(atEnd).toEqual([0, null, 18, 19, 20, 21, 22, 23]);
  });

  it("is empty for no pages", () => {
    expect(pageWindow(0, 0)).toEqual([]);
  });
});

describe("pageSummary", () => {
  it("says the range, the total and the noun", () => {
    expect(pageSummary(pageInfo({ page: 1, pageSize: 20, total: 96 }), "objects")).toBe(
      "21\u201340 of 96 objects",
    );
  });

  it("does not bother with a range when there is one page", () => {
    expect(pageSummary(pageInfo({ page: 0, pageSize: 20, total: 7 }), "objects")).toBe(
      "7 objects",
    );
  });

  it("says nothing found rather than 0–0 of 0", () => {
    expect(pageSummary(pageInfo({ page: 0, pageSize: 20, total: 0 }), "objects")).toBe(
      "No objects",
    );
  });
});
