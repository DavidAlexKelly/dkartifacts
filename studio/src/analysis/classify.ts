/**
 * Classification for graduated styling: class breaks and colour ramps.
 *
 * Breaks are the upper bound of each class, ascending, so a value v is in
 * the first class whose break is >= v, and the last break is the maximum.
 */

export type ClassifyMethod = "quantile" | "equal" | "jenks" | "stddev";

/** Above this many values, Jenks runs on an evenly spaced sample of the sorted values. */
const JENKS_SAMPLE = 1000;

/**
 * Upper bounds of `classes` classes over the finite values (NaN, ±Infinity
 * are ignored). Returns [] when there are no finite values or classes < 1.
 * When values repeat heavily, breaks may repeat too (they never decrease).
 */
export function classify(values: number[], method: ClassifyMethod, classes: number): number[] {
  const k = Math.floor(classes);
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (k < 1 || sorted.length === 0) {return [];}
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) {return new Array<number>(k).fill(max);}
  let breaks: number[];
  switch (method) {
    case "equal":
      breaks = Array.from({ length: k }, (_, i) => min + ((max - min) * (i + 1)) / k);
      break;
    case "quantile":
      breaks = Array.from({ length: k }, (_, i) => sorted[Math.max(0, Math.ceil(((i + 1) * sorted.length) / k) - 1)]);
      break;
    case "jenks":
      breaks = jenks(sorted, k);
      break;
    case "stddev": {
      const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
      const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length);
      // Classes one standard deviation wide, centred on the mean.
      breaks = Array.from({ length: k }, (_, i) => mean + sd * (i + 1 - k / 2));
      break;
    }
    default:
      throw new Error(`Unknown classification method: ${String(method)}`);
  }
  breaks[k - 1] = max;
  // Keep inside the data range and non-decreasing.
  let prev = -Infinity;
  return breaks.map((b) => {
    const c = Math.max(prev, Math.min(max, Math.max(min, b)));
    prev = c;
    return c;
  });
}

/** Fisher-Jenks natural breaks over sorted values. */
function jenks(sortedAll: number[], k: number): number[] {
  let data = sortedAll;
  if (data.length > JENKS_SAMPLE) {
    const step = (data.length - 1) / (JENKS_SAMPLE - 1);
    data = Array.from({ length: JENKS_SAMPLE }, (_, i) => sortedAll[Math.round(i * step)]);
  }
  const n = data.length;
  if (k >= n) {
    // Every value its own class; pad with the maximum.
    return Array.from({ length: k }, (_, i) => data[Math.min(i, n - 1)]);
  }
  // lower[l][m]: index (1-based) where class m starts in the best split of data[0..l-1].
  const lower: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(k + 1).fill(0));
  const variance: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(k + 1).fill(Infinity));
  for (let m = 1; m <= k; m++) {
    lower[1][m] = 1;
    variance[1][m] = 0;
  }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0, v = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1;
      const val = data[i3 - 1];
      s2 += val * val;
      s1 += val;
      w += 1;
      v = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= k; j++) {
          if (variance[l][j] >= v + variance[i4][j - 1]) {
            lower[l][j] = i3;
            variance[l][j] = v + variance[i4][j - 1];
          }
        }
      }
    }
    lower[l][1] = 1;
    variance[l][1] = v;
  }
  const breaks = new Array<number>(k);
  breaks[k - 1] = data[n - 1];
  let end = n;
  for (let j = k; j >= 2; j--) {
    const start = lower[end][j] - 1; // 0-based start of class j
    breaks[j - 2] = data[start - 1];
    end = start;
  }
  return breaks;
}

/** Class index (0-based) of a value for the given breaks; -1 for null or non-finite. */
export function classOf(value: number, breaks: number[]): number {
  if (!Number.isFinite(value) || breaks.length === 0) {return -1;}
  for (let i = 0; i < breaks.length; i++) {if (value <= breaks[i]) {return i;}}
  return breaks.length - 1;
}

// ── Colour ramps ───────────────────────────────────────────────────────────

export type RampName = "viridis" | "magma" | "blues" | "reds" | "greens" | "spectral" | "rdylgn";

const RAMPS: Record<RampName, string[]> = {
  viridis: ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
  magma: ["#000004", "#180f3d", "#440f76", "#721f81", "#9e2f7f", "#cd4071", "#f1605d", "#fd9668", "#feca8d", "#fcfdbf"],
  blues: ["#f7fbff", "#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08519c", "#08306b"],
  reds: ["#fff5f0", "#fee0d2", "#fcbba1", "#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#a50f15", "#67000d"],
  greens: ["#f7fcf5", "#e5f5e0", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#006d2c", "#00441b"],
  spectral: ["#9e0142", "#d53e4f", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#e6f598", "#abdda4", "#66c2a5", "#3288bd", "#5e4fa2"],
  rdylgn: ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850", "#006837"],
};

export const RAMP_NAMES = Object.keys(RAMPS) as RampName[];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");
}

/** The colour at t in [0, 1] along a ramp. */
export function rampColor(name: RampName, t: number): string {
  const stops = RAMPS[name];
  if (!stops) {throw new Error(`Unknown colour ramp: ${String(name)}`);}
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

/** n colours evenly spaced along a ramp, first to last ([] for n < 1). */
export function colorRamp(name: RampName, n: number): string[] {
  const count = Math.floor(n);
  if (count < 1) {return [];}
  if (count === 1) {return [rampColor(name, 0.5)];}
  return Array.from({ length: count }, (_, i) => rampColor(name, i / (count - 1)));
}
