/**
 * Summary statistics of one field, as QGIS's statistics panel shows them.
 */
import type { StudioFeature } from "../project/types";
import { toNumber } from "./expression";

export interface NumericSummary {
  sum: number;
  mean: number;
  min: number;
  max: number;
  median: number;
  /** Sample standard deviation (n - 1); 0 for a single value. */
  stdev: number;
}

export interface FieldSummary {
  /** Features with a value (not null or missing). */
  count: number;
  /** Features where the field is null or missing. */
  nulls: number;
  /** Set when every value reads as a number; strings like "12" count. */
  numeric: NumericSummary | null;
  /** The 20 most frequent values, most frequent first (ties by value). */
  unique: Array<{ value: string; count: number }>;
}

const TOP = 20;

export function summarize(features: StudioFeature[], field: string): FieldSummary {
  let nulls = 0;
  const values: unknown[] = [];
  for (const f of features) {
    const v = f.properties[field];
    if (v === null || v === undefined) {nulls++;}
    else {values.push(v);}
  }
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = typeof v === "object" ? JSON.stringify(v) : String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const unique = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
    .slice(0, TOP);

  let numeric: NumericSummary | null = null;
  const nums = values.map((v) => (typeof v === "string" || typeof v === "number" ? toNumber(v) : null));
  if (nums.length > 0 && nums.every((n) => n !== null)) {
    const xs = (nums as number[]).slice().sort((a, b) => a - b);
    const n = xs.length;
    const sum = xs.reduce((s, x) => s + x, 0);
    const mean = sum / n;
    const median = n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
    const stdev = n > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
    numeric = { sum, mean, min: xs[0], max: xs[n - 1], median, stdev };
  }
  return { count: values.length, nulls, numeric, unique };
}
