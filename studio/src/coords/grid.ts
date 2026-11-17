/**
 * Overlay grids for a map view, as GeoJSON a line + symbol layer can draw.
 *
 *  graticule(bounds, zoom)  meridians and parallels at a "nice" interval for
 *                           the zoom, with label points.
 *  mgrsGrid(bounds, zoom)   MGRS: grid zone designators (6° × 8°, with the
 *                           Norway and Svalbard exceptions, and the UPS caps),
 *                           100 km squares with their two-letter IDs, then
 *                           10 km and 1 km lines as the zoom allows. Lines
 *                           follow constant UTM easting / northing (curves in
 *                           lon/lat, densified) and are clipped to their zone.
 *
 * Every line has `level`; every label is a Point with `label` (and `level`).
 * Bounds are [west, south, east, north] in degrees; west may be < -180 or east
 * > 180 when the view crosses the antimeridian (as MapLibre's getBounds gives).
 */
import type { Feature, FeatureCollection, LineString, Point, Position } from "geojson";
import { BANDS, bandRange, gzdLonRange, tmForward, tmInverse, utmSquareId } from "./utm";

export type Bounds = [number, number, number, number];
export type MgrsLevel = "gzd" | "100km" | "10km" | "1km";

export interface GridLineProps {
  level: MgrsLevel | "graticule";
  axis?: "lon" | "lat" | "e" | "n";
  value?: number;
  zone?: number;
}

export interface GridLabelProps {
  level: MgrsLevel | "graticule";
  label: string;
  axis?: "lon" | "lat" | "e" | "n";
  /** The grid zone designator a 100 km label lies in. */
  gzd?: string;
}

export type GridFeature = Feature<LineString, GridLineProps> | Feature<Point, GridLabelProps>;
export type GridCollection = FeatureCollection<LineString | Point, GridLineProps | GridLabelProps>;

/** The most features a grid returns; finer levels are dropped to stay under it. */
export const MAX_GRID_FEATURES = 5000;

// ---------------------------------------------------------------- labels and intervals

const NICE_DEGREES = [
  90, 45, 30, 20, 15, 10, 5, 2, 1,
  30 / 60, 20 / 60, 15 / 60, 10 / 60, 5 / 60, 2 / 60, 1 / 60,
  30 / 3600, 20 / 3600, 15 / 3600, 10 / 3600, 5 / 3600, 2 / 3600, 1 / 3600,
];

/** The largest nice degree interval not above `maxDeg` (1″ at the smallest). */
export function niceDegreeInterval(maxDeg: number): number {
  for (const d of NICE_DEGREES) {if (d <= maxDeg * (1 + 1e-9)) {return d;}}
  return NICE_DEGREES[NICE_DEGREES.length - 1];
}

/** A graticule interval for a zoom: lines about 180 CSS pixels apart (512 px tiles). */
export function graticuleInterval(zoom: number): number {
  const degPerPx = 360 / (512 * 2 ** zoom);
  return niceDegreeInterval(degPerPx * 180);
}

function wrap180(lon: number): number {
  const w = ((((lon + 180) % 360) + 360) % 360) - 180;
  return w === -180 && lon > 0 ? 180 : w;
}

/**
 * "8°E", "61°30'N", "8°15'30\"E" — as precise as the interval needs. 0° and
 * 180° get no hemisphere letter.
 */
export function latLonTickLabel(value: number, axis: "lat" | "lon", interval: number): string {
  const v = axis === "lon" ? wrap180(value) : value;
  const totalSec = Math.round(Math.abs(v) * 3600);
  const d = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ivSec = Math.round(interval * 3600);
  let txt = `${d}°`;
  if (ivSec % 3600 !== 0 || m || s) {txt += `${String(m).padStart(2, "0")}'`;}
  if ((ivSec % 60 !== 0 && ivSec < 3600) || s) {txt += `${String(s).padStart(2, "0")}"`;}
  if (totalSec === 0 || (axis === "lon" && totalSec === 180 * 3600)) {return txt;}
  const hemi = axis === "lat" ? (v < 0 ? "S" : "N") : v < 0 ? "W" : "E";
  return txt + hemi;
}

/**
 * A UTM grid value as map sheets print it: two "principal digits" (the
 * kilometres within the 100 km square) for 1 km and 10 km lines, kilometres
 * for coarser ones. 6833000 at 1 km → "33"; 400000 at 100 km → "400".
 */
export function utmTickLabel(value: number, spacing: number): string {
  const km = Math.round(value / 1000);
  if (spacing >= 100000) {return String(km);}
  return String(((km % 100) + 100) % 100).padStart(2, "0");
}

// ---------------------------------------------------------------- geometry helpers

type Rect = [number, number, number, number];

function intersect(a: Rect, b: Rect): Rect | null {
  const r: Rect = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[0] < r[2] && r[1] < r[3] ? r : null;
}

/** Clip a polyline to a rectangle (Liang–Barsky per segment); returns the inside pieces. */
export function clipPolyline(points: Position[], r: Rect): Position[][] {
  const out: Position[][] = [];
  let cur: Position[] = [];
  const flush = () => {
    if (cur.length >= 2) {out.push(cur);}
    cur = [];
  };
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [p, q] of [[-dx, x0 - r[0]], [dx, r[2] - x0], [-dy, y0 - r[1]], [dy, r[3] - y0]]) {
      if (p === 0) {
        if (q < 0) {ok = false; break;}
      } else {
        const t = q / p;
        if (p < 0) {if (t > t1) {ok = false; break;} if (t > t0) {t0 = t;}}
        else {if (t < t0) {ok = false; break;} if (t < t1) {t1 = t;}}
      }
    }
    if (!ok) {flush(); continue;}
    const a: Position = [x0 + t0 * dx, y0 + t0 * dy];
    const b: Position = [x0 + t1 * dx, y0 + t1 * dy];
    if (t0 > 0 || !cur.length) {flush(); cur.push(a);}
    cur.push(b);
    if (t1 < 1) {flush();}
  }
  flush();
  return out;
}

function line(coords: Position[], props: GridLineProps): Feature<LineString, GridLineProps> {
  return { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: props };
}

function point(coord: Position, props: GridLabelProps): Feature<Point, GridLabelProps> {
  return { type: "Feature", geometry: { type: "Point", coordinates: coord }, properties: props };
}

function round(v: number): number {
  return Math.round(v * 1e9) / 1e9;
}

function densify(a: Position, b: Position, maxStep: number): Position[] {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / maxStep));
  const out: Position[] = [];
  for (let i = 0; i <= n; i++) {out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);}
  return out;
}

function shift(f: GridFeature, dx: number): GridFeature {
  if (!dx) {return f;}
  if (f.geometry.type === "Point") {
    const [x, y] = f.geometry.coordinates;
    return { ...f, geometry: { type: "Point", coordinates: [x + dx, y] } } as GridFeature;
  }
  return { ...f, geometry: { type: "LineString", coordinates: f.geometry.coordinates.map(([x, y]) => [x + dx, y]) } } as GridFeature;
}

/** The parts of the bounds in each 360° period, moved into [-180, 180], with the offset that moves them back. */
function periods(bounds: Bounds): Array<{ rect: Rect; off: number }> {
  const [w0, s0, e0, n0] = bounds;
  const s = Math.max(-90, s0);
  const n = Math.min(90, n0);
  if (!(n > s) || !(e0 > w0)) {return [];}
  const w = e0 - w0 >= 360 ? -180 : w0;
  const e = e0 - w0 >= 360 ? 180 : e0;
  const out: Array<{ rect: Rect; off: number }> = [];
  for (let k = Math.floor((w + 180) / 360); k <= Math.floor((e + 180) / 360 - 1e-12); k++) {
    const off = k * 360;
    const rect = intersect([w - off, s, e - off, n], [-180, -90, 180, 90]);
    if (rect) {out.push({ rect, off });}
  }
  return out;
}

/** Run `fn` once per 360° period the bounds cover, shifting its results back. */
function perPeriod(bounds: Bounds, fn: (b: Rect) => GridFeature[]): GridFeature[] {
  return periods(bounds).flatMap(({ rect, off }) => fn(rect).map((f) => shift(f, off)));
}

function collection(features: GridFeature[]): GridCollection {
  return { type: "FeatureCollection", features };
}

// ---------------------------------------------------------------- graticule

/**
 * Meridians and parallels for a view. Lines carry `axis` ("lon" | "lat") and
 * `value`; label points sit just inside the view's south edge (meridians) and
 * west edge (parallels), with `label` and `axis`. `interval` overrides the
 * zoom-derived spacing (degrees).
 */
export function graticule(bounds: Bounds, zoom: number, interval?: number): GridCollection {
  const [w0, s0, e0, n0] = bounds;
  const s = Math.max(-90, s0);
  const n = Math.min(90, n0);
  let iv = interval ?? graticuleInterval(zoom);
  // Keep it bounded whatever the bounds/zoom combination.
  while (((e0 - w0) / iv + (n - s) / iv) > 1000) {iv = iv * 2;}
  const feats: GridFeature[] = [];
  if (!(n > s) || !(e0 > w0)) {return collection(feats);}
  const dxLabel = (e0 - w0) * 0.01;
  const dyLabel = (n - s) * 0.01;
  const step = Math.max((n - s) / 32, 1e-6);
  for (let k = Math.ceil(w0 / iv - 1e-9); k * iv <= e0 + 1e-9; k++) {
    const lon = round(k * iv);
    feats.push(line(densify([lon, s], [lon, n], step), { level: "graticule", axis: "lon", value: wrap180(lon) }));
    feats.push(point([lon, s + dyLabel], { level: "graticule", axis: "lon", label: latLonTickLabel(lon, "lon", iv) }));
  }
  const stepX = Math.max((e0 - w0) / 32, 1e-6);
  for (let k = Math.ceil(s / iv - 1e-9); k * iv <= n + 1e-9; k++) {
    const lat = round(k * iv);
    if (Math.abs(lat) >= 90) {continue;}
    feats.push(line(densify([w0, lat], [e0, lat], stepX), { level: "graticule", axis: "lat", value: lat }));
    feats.push(point([w0 + dxLabel, lat], { level: "graticule", axis: "lat", label: latLonTickLabel(lat, "lat", iv) }));
  }
  return collection(feats);
}

// ---------------------------------------------------------------- MGRS

/** Which MGRS levels a zoom shows (512 px tiles; lines no closer than ~50 px at the equator). */
export function mgrsLevelsForZoom(zoom: number): MgrsLevel[] {
  const levels: MgrsLevel[] = ["gzd"];
  if (zoom >= 6) {levels.push("100km");}
  if (zoom >= 9) {levels.push("10km");}
  if (zoom >= 12) {levels.push("1km");}
  return levels;
}

const SPACING: Record<Exclude<MgrsLevel, "gzd">, number> = { "100km": 100000, "10km": 10000, "1km": 1000 };

interface Strip {
  zone: number;
  rect: Rect; // clipped to the view
}

function gzdFeatures(b: Rect): GridFeature[] {
  const out: GridFeature[] = [];
  const [bw, bs, be, bn] = b;
  const addMeridian = (lon: number, s: number, n: number) => {
    if (lon < bw || lon > be) {return;}
    const lo = Math.max(s, bs);
    const hi = Math.min(n, bn);
    if (hi > lo) {out.push(line(densify([lon, lo], [lon, hi], 1), { level: "gzd", axis: "lon", value: lon }));}
  };
  const addParallel = (lat: number, w: number, e: number) => {
    if (lat < bs || lat > bn) {return;}
    const lo = Math.max(w, bw);
    const hi = Math.min(e, be);
    if (hi > lo) {out.push(line(densify([lo, lat], [hi, lat], 1), { level: "gzd", axis: "lat", value: lat }));}
  };
  const label = (cell: Rect, text: string) => {
    const vis = intersect(cell, b);
    if (vis) {out.push(point([(vis[0] + vis[2]) / 2, (vis[1] + vis[3]) / 2], { level: "gzd", label: text }));}
  };
  for (let i = 0; i < BANDS.length; i++) {
    const band = BANDS[i];
    const [rs, rn] = bandRange(band)!;
    if (rn < bs || rs > bn) {continue;}
    const z0 = Math.max(1, Math.floor((bw + 180) / 6) - 1);
    const z1 = Math.min(60, Math.floor((be + 180) / 6) + 2);
    for (let zone = z0; zone <= z1; zone++) {
      const rng = gzdLonRange(zone, band);
      if (!rng) {continue;}
      const [rw, re] = rng;
      if (re < bw || rw > be) {continue;}
      addMeridian(rw, rs, rn);
      if (re === 180) {addMeridian(180, rs, rn);}
      addParallel(rs, rw, re);
      if (band === "X") {addParallel(rn, rw, re);}
      label([rw, rs, re, rn], `${zone}${band}`);
    }
  }
  // UPS caps: split at 0° / 180°.
  if (bn > 84) {
    addMeridian(0, 84, 90);
    addMeridian(180, 84, 90);
    addMeridian(-180, 84, 90);
    label([-180, 84, 0, 90], "Y");
    label([0, 84, 180, 90], "Z");
  }
  if (bs < -80) {
    addMeridian(0, -90, -80);
    addMeridian(180, -90, -80);
    addMeridian(-180, -90, -80);
    label([-180, -90, 0, -80], "A");
    label([0, -90, 180, -80], "B");
  }
  return out;
}

/** The UTM strips (one zone, consecutive bands of the same width) inside a view. */
function strips(b: Rect): Strip[] {
  const out: Strip[] = [];
  const [bw, bs, be, bn] = b;
  const z0 = Math.max(1, Math.floor((bw + 180) / 6) - 1);
  const z1 = Math.min(60, Math.floor((be + 180) / 6) + 2);
  for (let zone = z0; zone <= z1; zone++) {
    let cur: { w: number; e: number; s: number; n: number } | null = null;
    const push = () => {
      if (!cur) {return;}
      const r = intersect([cur.w, cur.s, cur.e, cur.n], b);
      if (r) {out.push({ zone, rect: r });}
      cur = null;
    };
    for (const band of BANDS) {
      const [rs, rn] = bandRange(band)!;
      const rng = gzdLonRange(zone, band);
      if (!rng || rn <= bs || rs >= bn) {push(); continue;}
      if (cur && cur.w === rng[0] && cur.e === rng[1]) {cur.n = rn;}
      else {push(); cur = { w: rng[0], e: rng[1], s: rs, n: rn };}
    }
    push();
  }
  return out;
}

/** Min/max true easting and northing of a lon/lat rectangle in a zone. */
function utmExtent(zone: number, r: Rect): [number, number, number, number] {
  let e0 = Infinity;
  let e1 = -Infinity;
  let n0 = Infinity;
  let n1 = -Infinity;
  const k = 24;
  const visit = (lon: number, lat: number) => {
    const p = tmForward(lon, lat, zone);
    e0 = Math.min(e0, p.easting);
    e1 = Math.max(e1, p.easting);
    n0 = Math.min(n0, p.northing);
    n1 = Math.max(n1, p.northing);
  };
  for (let i = 0; i <= k; i++) {
    const t = i / k;
    visit(r[0] + (r[2] - r[0]) * t, r[1]);
    visit(r[0] + (r[2] - r[0]) * t, r[3]);
    visit(r[0], r[1] + (r[3] - r[1]) * t);
    visit(r[2], r[1] + (r[3] - r[1]) * t);
  }
  return [e0, n0, e1, n1];
}

function countLines(ext: [number, number, number, number], sp: number): number {
  return Math.max(0, Math.floor(ext[2] / sp) - Math.ceil(ext[0] / sp) + 1) + Math.max(0, Math.floor(ext[3] / sp) - Math.ceil(ext[1] / sp) + 1);
}

function trace(zone: number, fixed: number, axis: "e" | "n", from: number, to: number, step: number): Position[] {
  const pts: Position[] = [];
  const n = Math.max(1, Math.ceil((to - from) / step));
  for (let i = 0; i <= n; i++) {
    const v = from + ((to - from) * i) / n;
    const ll = axis === "e" ? tmInverse(fixed, v, zone) : tmInverse(v, fixed, zone);
    pts.push([ll.lon, ll.lat]);
  }
  return pts;
}

function levelFeatures(st: Strip, level: Exclude<MgrsLevel, "gzd">, ext: [number, number, number, number]): GridFeature[] {
  const out: GridFeature[] = [];
  const sp = SPACING[level];
  const step = Math.max(250, Math.min(sp / 4, 10000));
  const [emin, nmin, emax, nmax] = ext;
  const pad = sp * 0.01;
  for (const axis of ["e", "n"] as const) {
    const [lo, hi, from, to] = axis === "e" ? [emin, emax, nmin - pad, nmax + pad] : [nmin, nmax, emin - pad, emax + pad];
    for (let k = Math.ceil(lo / sp); k * sp <= hi; k++) {
      const v = k * sp;
      const pieces = clipPolyline(trace(st.zone, v, axis, from, to, step), st.rect);
      for (const p of pieces) {out.push(line(p, { level, axis, value: axis === "n" && v < 0 ? v + 10000000 : v, zone: st.zone }));}
      if (level !== "100km" && pieces.length) {
        out.push(point(pieces[0][0], { level, axis, label: utmTickLabel(v, sp) }));
      }
    }
  }
  if (level === "100km") {
    for (let ce = Math.floor(emin / sp); ce * sp < emax; ce++) {
      for (let cn = Math.floor(nmin / sp); cn * sp < nmax; cn++) {
        let sx = 0;
        let sy = 0;
        let c = 0;
        for (let i = 0; i < 5; i++) {
          for (let j = 0; j < 5; j++) {
            const ll = tmInverse((ce + (i + 0.5) / 5) * sp, (cn + (j + 0.5) / 5) * sp, st.zone);
            const r = st.rect;
            if (ll.lon >= r[0] && ll.lon <= r[2] && ll.lat >= r[1] && ll.lat <= r[3]) {sx += ll.lon; sy += ll.lat; c++;}
          }
        }
        if (!c) {continue;}
        const id = utmSquareId(st.zone, (ce + 0.5) * sp, (cn + 0.5) * sp);
        if (!id) {continue;}
        const lat = sy / c;
        const band = BANDS[Math.min(19, Math.max(0, Math.floor((lat + 80) / 8)))];
        out.push(point([sx / c, lat], { level, label: id, gzd: `${st.zone}${band}` }));
      }
    }
  }
  return out;
}

export interface MgrsGridOptions {
  /** Levels to draw; defaults to mgrsLevelsForZoom(zoom). */
  levels?: MgrsLevel[];
  /** Feature cap (default MAX_GRID_FEATURES): finer levels that would exceed it are left out. */
  maxFeatures?: number;
}

/**
 * The MGRS grid for a view: GZD boundaries and labels, then 100 km / 10 km /
 * 1 km lines (and labels) for the levels the zoom allows. A finer level that
 * would push the total past the cap is dropped together with everything finer.
 * No 100 km squares are drawn inside the UPS caps (only their boundaries and
 * Y / Z / A / B labels).
 */
export function mgrsGrid(bounds: Bounds, zoom: number, options: MgrsGridOptions = {}): GridCollection {
  const levels = options.levels ?? mgrsLevelsForZoom(zoom);
  const cap = options.maxFeatures ?? MAX_GRID_FEATURES;
  const feats: GridFeature[] = [];
  if (levels.includes("gzd")) {feats.push(...perPeriod(bounds, gzdFeatures));}
  for (const level of ["100km", "10km", "1km"] as const) {
    if (!levels.includes(level)) {continue;}
    const sp = SPACING[level];
    // Estimate first, so a huge 1 km request costs nothing.
    const jobs = periods(bounds).flatMap(({ rect, off }) =>
      strips(rect).map((st) => ({ st, off, ext: utmExtent(st.zone, st.rect) })),
    );
    let estimate = 0;
    for (const { ext } of jobs) {
      const lines = countLines(ext, sp);
      estimate += level === "100km" ? lines + Math.ceil((ext[2] - ext[0]) / sp + 1) * Math.ceil((ext[3] - ext[1]) / sp + 1) : lines * 2;
    }
    if (feats.length + estimate > cap) {break;}
    const added = jobs.flatMap(({ st, off, ext }) => levelFeatures(st, level, ext).map((f) => shift(f, off)));
    if (feats.length + added.length > cap) {break;}
    feats.push(...added);
  }
  return collection(feats);
}
