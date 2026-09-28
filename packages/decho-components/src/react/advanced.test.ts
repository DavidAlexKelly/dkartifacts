/**
 * The tier-two engines: virtualisation, pivoting, trees, boards, Gantt scales,
 * month grids and file validation.
 *
 * All pure, all tested here, and between them they are most of what makes the
 * tier-two components correct. The components on top are mostly layout.
 */

import { describe, expect, it } from "vitest";
import { scrollToRow, virtualRange } from "./virtualRange.js";
import { pivot } from "./pivot.js";
import {
  countNodes,
  expandTo,
  expandableIds,
  filterTree,
  flattenTree,
  toggleNode,
  treeKey,
  type TreeNode,
} from "./tree.js";
import { moveCard, reorderColumn, type Board } from "./kanban.js";
import { ganttScale, ticksFor } from "./ganttScale.js";
import { monthGrid, shiftMonth } from "./monthGrid.js";
import { describeFile, validateFiles } from "./fileValidation.js";

/* -- virtualRange ------------------------------------------------------- */

describe("virtualRange", () => {
  const base = { rowCount: 1000, rowHeight: 32, viewportHeight: 320 };

  it("renders the visible window plus overscan", () => {
    const range = virtualRange({ ...base, scrollTop: 0 });
    expect(range.start).toBe(0);
    expect(range.end).toBe(17); // 11 visible + 6 overscan
    expect(range.paddingTop).toBe(0);
    expect(range.totalHeight).toBe(32000);
  });

  it("keeps the spacers exactly as tall as the rows they replace", () => {
    const range = virtualRange({ ...base, scrollTop: 3200 });
    expect(range.paddingTop).toBe(range.start * 32);
    expect(range.paddingBottom).toBe((1000 - range.end) * 32);
    expect(range.paddingTop + (range.end - range.start) * 32 + range.paddingBottom).toBe(32000);
  });

  it("survives an elastic overscroll, which gives a negative scrollTop", () => {
    const range = virtualRange({ ...base, scrollTop: -120 });
    expect(range.start).toBe(0);
    expect(range.paddingTop).toBe(0);
  });

  it("survives a scrollTop past the end, which happens when rows are removed", () => {
    const range = virtualRange({ ...base, scrollTop: 99_999 });
    expect(range.end).toBe(1000);
    expect(range.paddingBottom).toBe(0);
  });

  it("renders nothing for no rows, rather than one phantom row", () => {
    expect(virtualRange({ ...base, rowCount: 0, scrollTop: 0 })).toEqual({
      start: 0,
      end: 0,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
    });
  });

  it("renders everything when the viewport is taller than the content", () => {
    const range = virtualRange({ rowCount: 5, rowHeight: 32, viewportHeight: 900, scrollTop: 0 });
    expect(range.start).toBe(0);
    expect(range.end).toBe(5);
  });

  it("does not divide by a zero row height", () => {
    const range = virtualRange({ rowCount: 10, rowHeight: 0, viewportHeight: 100, scrollTop: 0 });
    expect(Number.isFinite(range.end)).toBe(true);
  });
});

describe("scrollToRow", () => {
  const view = { rowHeight: 32, viewportHeight: 320, scrollTop: 320 };

  it("scrolls up to a row above the viewport", () => {
    expect(scrollToRow(2, view)).toBe(64);
  });

  it("scrolls down just enough for a row below it", () => {
    // Row 20 ends at 672px; the viewport is 320 tall, so the smallest scroll
    // that reveals it is 352 — not 672, which would put the row at the top
    // and scroll further than asked.
    expect(scrollToRow(20, view)).toBe(352);
  });

  it("returns null for a row already visible, rather than the current position", () => {
    // Setting scrollTop to its own value cancels a smooth scroll in flight,
    // which makes keyboard navigation jerk.
    expect(scrollToRow(12, view)).toBeNull();
  });
});

/* -- pivot -------------------------------------------------------------- */

interface Fact {
  workstream: string;
  week: string;
  mapped: number | null;
}

const facts: Fact[] = [
  { workstream: "Finance", week: "W1", mapped: 10 },
  { workstream: "Finance", week: "W1", mapped: 30 },
  { workstream: "Finance", week: "W2", mapped: 50 },
  { workstream: "Supply", week: "W1", mapped: 80 },
  { workstream: "Supply", week: "W2", mapped: null },
];

describe("pivot", () => {
  const spec = {
    row: (fact: Fact) => fact.workstream,
    column: (fact: Fact) => fact.week,
    value: (fact: Fact) => fact.mapped,
  };

  it("aggregates the intersections", () => {
    const table = pivot(facts, { ...spec, aggregate: "sum" });
    expect(table.rowKeys).toEqual(["Finance", "Supply"]);
    expect(table.columnKeys).toEqual(["W1", "W2"]);
    expect(table.cell("Finance", "W1")).toBe(40);
    expect(table.cell("Supply", "W1")).toBe(80);
  });

  it("does not average averages", () => {
    // Finance W1 averages 20 (10, 30) and W2 is 50. The mean of those two
    // cells is 35; the actual average of the three values is 30. Totalling
    // the cells would report 35 and be wrong.
    const table = pivot(facts, { ...spec, aggregate: "avg" });
    expect(table.cell("Finance", "W1")).toBe(20);
    expect(table.cell("Finance", "W2")).toBe(50);
    expect(table.rowTotal("Finance")).toBe(30);
  });

  it("distinguishes an empty intersection from a zero", () => {
    // "No objects were mapped" and "zero were" are different facts.
    const table = pivot(facts, { ...spec, aggregate: "sum" });
    expect(table.cell("Supply", "W2")).toBeNull();
    expect(table.cell("Finance", "W3")).toBeNull();
  });

  it("counts rows, including the ones with no value", () => {
    const table = pivot(facts, { ...spec, aggregate: "count" });
    expect(table.cell("Finance", "W1")).toBe(2);
    // The Supply/W2 row exists but has no number; count sees the bucket.
    expect(table.cell("Supply", "W2")).toBe(0);
    expect(table.count("Supply", "W2")).toBe(0);
  });

  it("gives min, max and a grand total from the raw values", () => {
    expect(pivot(facts, { ...spec, aggregate: "min" }).grandTotal).toBe(10);
    expect(pivot(facts, { ...spec, aggregate: "max" }).grandTotal).toBe(80);
    expect(pivot(facts, { ...spec, aggregate: "sum" }).grandTotal).toBe(170);
  });

  it("keeps keys in first-appearance order rather than sorting them", () => {
    const reversed = pivot([...facts].reverse(), { ...spec, aggregate: "sum" });
    expect(reversed.rowKeys).toEqual(["Supply", "Finance"]);
  });

  it("is empty, not broken, for no rows", () => {
    const table = pivot([], { ...spec, aggregate: "sum" });
    expect(table.rowKeys).toEqual([]);
    expect(table.grandTotal).toBeNull();
  });
});

/* -- tree --------------------------------------------------------------- */

const tree: TreeNode<{ label: string }>[] = [
  {
    id: "finance",
    data: { label: "Finance" },
    children: [
      { id: "kna1", data: { label: "KNA1" } },
      {
        id: "gl",
        data: { label: "General ledger" },
        children: [{ id: "bkpf", data: { label: "BKPF" } }],
      },
    ],
  },
  { id: "supply", data: { label: "Supply chain" }, children: [{ id: "mara", data: { label: "MARA" } }] },
];

describe("flattenTree", () => {
  it("shows only the roots when nothing is expanded", () => {
    const rows = flattenTree(tree, new Set());
    expect(rows.map((row) => row.node.id)).toEqual(["finance", "supply"]);
    expect(rows[0]?.hasChildren).toBe(true);
    expect(rows[0]?.expanded).toBe(false);
  });

  it("walks into expanded nodes, with depth and path", () => {
    const rows = flattenTree(tree, new Set(["finance", "gl"]));
    expect(rows.map((row) => row.node.id)).toEqual(["finance", "kna1", "gl", "bkpf", "supply"]);
    expect(rows[3]?.depth).toBe(2);
    expect(rows[3]?.path).toEqual(["finance", "gl"]);
  });

  it("does not claim a childless node is expanded", () => {
    const rows = flattenTree(tree, new Set(["finance", "kna1"]));
    const leaf = rows.find((row) => row.node.id === "kna1");
    expect(leaf?.hasChildren).toBe(false);
    expect(leaf?.expanded).toBe(false);
  });
});

describe("expandTo", () => {
  it("opens every ancestor, not just the parent", () => {
    // Opening only "gl" leaves BKPF as hidden as it was.
    const expanded = expandTo(tree, "bkpf");
    expect([...expanded].sort()).toEqual(["finance", "gl"]);
  });

  it("leaves the set alone for a node that is not there", () => {
    expect(expandTo(tree, "nope", new Set(["finance"]))).toEqual(new Set(["finance"]));
  });
});

describe("filterTree", () => {
  it("keeps the ancestors of a match", () => {
    // Without this the matching leaf renders at the wrong indent with no
    // context — the commonest complaint about hand-rolled tree filters.
    const filtered = filterTree(tree, (node) => node.id === "bkpf");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("finance");
    expect(filtered[0]?.children?.[0]?.id).toBe("gl");
    expect(countNodes(filtered)).toBe(3);
  });

  it("keeps the whole subtree of a node that matches itself", () => {
    const filtered = filterTree(tree, (node) => node.id === "finance");
    expect(countNodes(filtered)).toBe(4);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterTree(tree, () => false)).toEqual([]);
  });
});

describe("toggleNode and expandableIds", () => {
  it("toggles without mutating the original", () => {
    const before = new Set(["finance"]);
    const after = toggleNode(before, "supply");
    expect(before.has("supply")).toBe(false);
    expect(after.has("supply")).toBe(true);
    expect(toggleNode(after, "finance").has("finance")).toBe(false);
  });

  it("lists only the nodes that can actually expand", () => {
    expect([...expandableIds(tree)].sort()).toEqual(["finance", "gl", "supply"]);
  });
});

describe("treeKey", () => {
  const expanded = new Set(["finance"]);
  const rows = flattenTree(tree, expanded);

  it("moves up and down the visible rows", () => {
    expect(treeKey(rows, 0, "ArrowDown", expanded).index).toBe(1);
    expect(treeKey(rows, 1, "ArrowUp", expanded).index).toBe(0);
    expect(treeKey(rows, 0, "ArrowUp", expanded).index).toBe(0);
  });

  it("opens a closed node with Right, then steps into it", () => {
    const closed = treeKey(rows, 2, "ArrowRight", expanded);
    expect(closed.expanded?.has("gl")).toBe(true);

    const openRows = flattenTree(tree, new Set(["finance", "gl"]));
    expect(treeKey(openRows, 2, "ArrowRight", new Set(["finance", "gl"])).index).toBe(3);
  });

  it("closes an open node with Left, then steps out of it", () => {
    const closing = treeKey(rows, 0, "ArrowLeft", expanded);
    expect(closing.expanded?.has("finance")).toBe(false);
    // From a leaf, Left goes to the parent row.
    expect(treeKey(rows, 1, "ArrowLeft", expanded).index).toBe(0);
  });

  it("does nothing useful on a key it does not own", () => {
    expect(treeKey(rows, 0, "a", expanded)).toEqual({ index: null, expanded: null });
  });
});

/* -- kanban ------------------------------------------------------------- */

const board: Board = {
  todo: ["a", "b", "c"],
  doing: ["d"],
  done: [],
};

describe("moveCard", () => {
  it("moves a card between columns at a position", () => {
    const next = moveCard(board, "b", "doing", 0);
    expect(next.todo).toEqual(["a", "c"]);
    expect(next.doing).toEqual(["b", "d"]);
  });

  it("appends when the index is past the end", () => {
    expect(moveCard(board, "a", "done", 99).done).toEqual(["a"]);
  });

  it("takes the index against the column as it will be, not as it was", () => {
    // ["a","b","c"], move "a" to index 2. After "a" is taken out the column
    // is ["b","c"], so index 2 is the end: ["b","c","a"]. Interpreting the
    // index against the ORIGINAL array is the classic bug — it gives
    // ["b","a","c"], i.e. one place short of where the pointer was.
    expect(moveCard(board, "a", "todo", 2).todo).toEqual(["b", "c", "a"]);
    expect(moveCard(board, "a", "todo", 1).todo).toEqual(["b", "a", "c"]);
  });

  it("leaves the board alone for a card that is not on it", () => {
    expect(moveCard(board, "nope", "done", 0)).toEqual(board);
  });

  it("does not mutate the board it was given", () => {
    moveCard(board, "a", "done", 0);
    expect(board.todo).toEqual(["a", "b", "c"]);
  });
});

describe("reorderColumn", () => {
  it("moves a card up and down within its column", () => {
    expect(reorderColumn(board, "todo", 2, -1).todo).toEqual(["a", "c", "b"]);
    expect(reorderColumn(board, "todo", 0, 1).todo).toEqual(["b", "a", "c"]);
  });

  it("stops at the ends rather than wrapping", () => {
    expect(reorderColumn(board, "todo", 0, -1).todo).toEqual(["a", "b", "c"]);
    expect(reorderColumn(board, "todo", 2, 1).todo).toEqual(["a", "b", "c"]);
  });
});

/* -- ganttScale --------------------------------------------------------- */

describe("ganttScale", () => {
  const scale = ganttScale({ from: "2026-03-01", to: "2026-03-31", width: 300 });

  it("maps a date to the left edge of its day", () => {
    expect(scale.x("2026-03-01")).toBe(0);
    // The 31st is the last of 31 days, so its left edge is 30/31 of the way
    // across — 290, not 300. 300 is the right edge of that day, which is what
    // `bar` returns and what the axis ends at.
    expect(Math.round(scale.x("2026-03-31"))).toBe(290);
    const lastDay = scale.bar("2026-03-31", "2026-03-31");
    expect(Math.round(lastDay.x + lastDay.width)).toBe(300);
  });

  it("measures a bar inclusively, so a one-day task is one day wide", () => {
    const bar = scale.bar("2026-03-01", "2026-03-01");
    expect(bar.width).toBeGreaterThan(0);
    expect(Math.round(bar.width)).toBe(10); // 1 of 31 days, minus the inclusive day
  });

  it("clamps a bar that starts before or ends after the window", () => {
    const bar = scale.bar("2026-02-01", "2026-04-30");
    expect(bar.x).toBe(0);
    expect(Math.round(bar.x + bar.width)).toBe(300);
    expect(bar.clippedStart).toBe(true);
    expect(bar.clippedEnd).toBe(true);
  });

  it("swaps a backwards window rather than producing negative widths", () => {
    // Almost always argument order. A negative width renders as nothing,
    // which reads as missing data; swapping shows the plan that was meant.
    const backwards = ganttScale({ from: "2026-03-31", to: "2026-03-01", width: 300 });
    expect(backwards.from).toBe("2026-03-01");
    expect(backwards.to).toBe("2026-03-31");
    expect(backwards.days).toBe(scale.days);
    expect(backwards.x("2026-03-15")).toBe(scale.x("2026-03-15"));
  });
});

describe("ticksFor", () => {
  it("ticks by day over a short window", () => {
    const ticks = ticksFor("2026-03-01", "2026-03-05");
    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.date).toBe("2026-03-01");
  });

  it("ticks by week over a quarter, starting on a Monday", () => {
    const ticks = ticksFor("2026-03-01", "2026-05-31");
    expect(ticks.length).toBeLessThan(20);
    // 2026-03-02 is a Monday.
    expect(ticks[0]?.date).toBe("2026-03-02");
  });

  it("ticks by month over a year, and labels the months", () => {
    const ticks = ticksFor("2026-01-01", "2026-12-31");
    expect(ticks).toHaveLength(12);
    expect(ticks[0]?.date).toBe("2026-01-01");
  });
});

/* -- monthGrid ---------------------------------------------------------- */

describe("monthGrid", () => {
  it("lays March 2026 out in weeks starting Monday", () => {
    const grid = monthGrid("2026-03", { weekStartsOn: 1 });
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks[0]?.[0]?.date).toBe("2026-02-23");
    expect(grid.weeks[0]?.[0]?.inMonth).toBe(false);
    expect(grid.weeks[0]?.[6]?.date).toBe("2026-03-01");
  });

  it("starts on Sunday when asked, which is the other half of the world", () => {
    // 1 March 2026 is itself a Sunday, so a Sunday-start grid needs no
    // leading days at all — where the Monday-start grid above needs six.
    const grid = monthGrid("2026-03", { weekStartsOn: 0 });
    expect(grid.weeks[0]?.[0]?.date).toBe("2026-03-01");
    expect(grid.weeks[0]?.[0]?.inMonth).toBe(true);
  });

  it("marks today only when today is in the month", () => {
    const grid = monthGrid("2026-03", { today: "2026-03-17" });
    const marked = grid.weeks.flat().filter((day) => day.isToday);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.date).toBe("2026-03-17");
    expect(monthGrid("2026-04", { today: "2026-03-17" }).weeks.flat().some((d) => d.isToday)).toBe(
      false,
    );
  });

  it("handles February in a leap year", () => {
    const grid = monthGrid("2024-02");
    const inMonth = grid.weeks.flat().filter((day) => day.inMonth);
    expect(inMonth).toHaveLength(29);
  });
});

describe("shiftMonth", () => {
  it("moves across a year boundary", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-03", 12)).toBe("2027-03");
  });
});

/* -- fileValidation ----------------------------------------------------- */

const file = (name: string, size: number, type = ""): File =>
  new File([new Uint8Array(Math.min(size, 1024))], name, { type });

describe("validateFiles", () => {
  it("accepts what it should", () => {
    const result = validateFiles([file("plan.csv", 1000, "text/csv")], {
      accept: [".csv"],
      maxBytes: 5000,
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it("rejects by extension, case-insensitively", () => {
    const result = validateFiles([file("PLAN.CSV", 10), file("notes.txt", 10)], {
      accept: [".csv"],
    });
    expect(result.accepted.map((entry) => entry.name)).toEqual(["PLAN.CSV"]);
    expect(result.rejected[0]?.reason).toContain("csv");
  });

  it("rejects by MIME type as well as by extension", () => {
    const result = validateFiles([file("plan", 10, "text/csv")], { accept: ["text/csv"] });
    expect(result.accepted).toHaveLength(1);
  });

  it("says how big the file was and how big it may be", () => {
    // "Too large" with no numbers is the least useful error message there is.
    const result = validateFiles([file("dump.csv", 900)], { maxBytes: 500 });
    expect(result.rejected[0]?.reason).toContain("500 B");
    expect(result.rejected[0]?.reason).toContain("900 B");
  });

  it("enforces a maximum count, keeping the first ones", () => {
    const result = validateFiles([file("a", 1), file("b", 1), file("c", 1)], { maxFiles: 2 });
    expect(result.accepted.map((entry) => entry.name)).toEqual(["a", "b"]);
    expect(result.rejected[0]?.reason).toContain("2");
  });

  it("accepts anything when no rules are given", () => {
    expect(validateFiles([file("whatever.bin", 10)], {}).accepted).toHaveLength(1);
  });
});

describe("describeFile", () => {
  it("uses units a person reads", () => {
    expect(describeFile(512)).toBe("512 B");
    expect(describeFile(2048)).toBe("2.0 kB");
    expect(describeFile(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("is kB, not KB, and decimal-free where it should be", () => {
    expect(describeFile(0)).toBe("0 B");
    expect(describeFile(1024)).toBe("1.0 kB");
  });
});
