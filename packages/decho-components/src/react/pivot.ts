/**
 * Crosstab: group rows two ways and aggregate the intersection.
 *
 * The engine behind `PivotTable`, and pure, because this is where a pivot is
 * either right or quietly wrong. The classic failure is the **average of
 * averages**: totalling a row of cells that are themselves averages gives a
 * number that is not the average of anything. Every total here is computed
 * from the raw values, never from the cells — there is a test that pins it.
 *
 * A second, quieter one: a missing intersection is `null`, not `0`. "No
 * objects in Finance were signed off in week 3" and "zero per cent were" are
 * different facts, and a pivot that renders both as `0` is a pivot that hides
 * the gap in the data.
 */

export type Aggregation = "sum" | "count" | "avg" | "min" | "max";

export interface PivotSpec<Row> {
  /** The row dimension: "Finance", "Supply chain". */
  row: (row: Row) => string;
  /** The column dimension: "W1", "W2". */
  column: (row: Row) => string;
  /**
   * The number being aggregated.
   *
   * `null` means this row contributes nothing — different from `0`, which
   * contributes a zero and moves an average.
   */
  value: (row: Row) => number | null;
  aggregate: Aggregation;
}

export interface PivotTable {
  rowKeys: string[];
  columnKeys: string[];
  /** `cell(rowKey, columnKey)` — `null` where nothing landed. */
  cell: (rowKey: string, columnKey: string) => number | null;
  /** How many source rows landed in a cell, for "avg of 12". */
  count: (rowKey: string, columnKey: string) => number;
  rowTotal: (rowKey: string) => number | null;
  columnTotal: (columnKey: string) => number | null;
  grandTotal: number | null;
}

/** The raw values that landed somewhere, kept so totals can re-aggregate. */
type Bucket = number[];

const key = (row: string, column: string): string => `${row}\u0000${column}`;

function aggregateBucket(values: Bucket, how: Aggregation): number | null {
  if (how === "count") {
    return values.length;
  }
  if (values.length === 0) {
    return null;
  }
  switch (how) {
    case "sum":
      return values.reduce((total, value) => total + value, 0);
    case "avg":
      return values.reduce((total, value) => total + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return null;
  }
}

/**
 * Build the crosstab.
 *
 * Keys come out in first-appearance order, not sorted: the caller has usually
 * ordered its input for a reason (weeks in week order, workstreams by size),
 * and re-sorting silently is how a pivot table starts looking random. Sort the
 * input if you want sorted output.
 */
export function pivot<Row>(rows: readonly Row[], spec: PivotSpec<Row>): PivotTable {
  const rowKeys: string[] = [];
  const columnKeys: string[] = [];
  const seenRows = new Set<string>();
  const seenColumns = new Set<string>();

  const cells = new Map<string, Bucket>();
  const byRow = new Map<string, Bucket>();
  const byColumn = new Map<string, Bucket>();
  const all: Bucket = [];

  for (const row of rows) {
    const rowKey = spec.row(row);
    const columnKey = spec.column(row);

    if (!seenRows.has(rowKey)) {
      seenRows.add(rowKey);
      rowKeys.push(rowKey);
    }
    if (!seenColumns.has(columnKey)) {
      seenColumns.add(columnKey);
      columnKeys.push(columnKey);
    }

    const value = spec.value(row);
    if (value == null || !Number.isFinite(value)) {
      // The row still establishes that the intersection exists — a cell with
      // rows but no values is meaningfully different from one with no rows —
      // but contributes no number.
      if (!cells.has(key(rowKey, columnKey))) {
        cells.set(key(rowKey, columnKey), []);
      }
      continue;
    }

    const cell = cells.get(key(rowKey, columnKey)) ?? [];
    cell.push(value);
    cells.set(key(rowKey, columnKey), cell);

    const rowBucket = byRow.get(rowKey) ?? [];
    rowBucket.push(value);
    byRow.set(rowKey, rowBucket);

    const columnBucket = byColumn.get(columnKey) ?? [];
    columnBucket.push(value);
    byColumn.set(columnKey, columnBucket);

    all.push(value);
  }

  return {
    rowKeys,
    columnKeys,
    cell: (rowKey, columnKey) => {
      const bucket = cells.get(key(rowKey, columnKey));
      // No bucket at all means no rows landed here: `null`, not zero.
      return bucket == null ? null : aggregateBucket(bucket, spec.aggregate);
    },
    count: (rowKey, columnKey) => cells.get(key(rowKey, columnKey))?.length ?? 0,
    // Totals aggregate the RAW values, which is what stops a row of averages
    // being averaged again.
    rowTotal: (rowKey) => aggregateBucket(byRow.get(rowKey) ?? [], spec.aggregate),
    columnTotal: (columnKey) => aggregateBucket(byColumn.get(columnKey) ?? [], spec.aggregate),
    grandTotal: aggregateBucket(all, spec.aggregate),
  };
}
