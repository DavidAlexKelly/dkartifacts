/**
 * Print layouts: a page with a title, the map, a legend, a scale bar, a north
 * arrow, an optional coordinate frame (lat/lon or MGRS ticks around the map
 * border), an optional overview inset, notes and attributions — as a PDF
 * (vector text through jsPDF, the map an embedded image) and/or a PNG.
 *
 * The map is rendered at the page's print size: the map container is resized
 * to the frame's size in CSS pixels (1 CSS px = 1/96 in, so symbols and labels
 * print at their nominal size) and the pixel ratio raised to reach the DPI;
 * everything is restored afterwards.
 *
 * Page geometry and every decoration are computed by pure functions in
 * millimetres and drawn through a small `Painter` interface, with one
 * implementation for jsPDF and one for a 2D canvas. Tests drive the pure
 * parts with a recording painter.
 */
import { legendFor } from "../map/symbology";
import type { Feature } from "geojson";
import type { jsPDF } from "jspdf";
import type { Map as MlMap } from "maplibre-gl";
import { latLonTickLabel, niceDegreeInterval, utmTickLabel } from "../coords/grid";
import { tmForward, tmInverse, toMgrsParts, utmZone } from "../coords/utm";
import type { CatalogLayerNode, Project, VectorLayerNode } from "../project/types";

// ---------------------------------------------------------------- paper

export type Paper = "A4" | "A3" | "A2" | "Letter" | "Tabloid";
export type Orientation = "landscape" | "portrait";

/** Portrait width × height in millimetres. */
export const PAPER_MM: Record<Paper, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  Letter: [215.9, 279.4],
  Tabloid: [279.4, 431.8],
};

export const MM_PER_INCH = 25.4;
export const PT_TO_MM = 25.4 / 72;
/** CSS reference pixels per inch. */
export const CSS_DPI = 96;

export function paperSizeMm(paper: Paper, orientation: Orientation): [number, number] {
  const [w, h] = PAPER_MM[paper];
  return orientation === "landscape" ? [h, w] : [w, h];
}

export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}

/** Page size in device pixels at a DPI (rounded). A4 portrait at 300 dpi → [2480, 3508]. */
export function paperSizePx(paper: Paper, orientation: Orientation, dpi: number): [number, number] {
  const [w, h] = paperSizeMm(paper, orientation);
  return [Math.round(mmToPx(w, dpi)), Math.round(mmToPx(h, dpi))];
}

export function clampDpi(dpi: number): number {
  return Math.max(96, Math.min(300, Math.round(Number.isFinite(dpi) ? dpi : 150)));
}

// ---------------------------------------------------------------- options

export interface LegendItem {
  label: string;
  color: string;
  kind: "fill" | "line" | "point" | "swatch" | "heading";
  /** Outline colour for fill / point symbols (defaults to `color`). */
  strokeColor?: string;
}

export type GridKind = "none" | "latlon" | "mgrs";

export interface PrintProgress {
  /** 0..1 */
  fraction: number;
  stage: string;
  page?: number;
  pages?: number;
}

export interface LayoutOptions {
  paper: Paper;
  orientation: Orientation;
  /** 96..300 */
  dpi: number;
  title: string;
  subtitle?: string;
  notes?: string;
  legend: LegendItem[];
  scaleBar: boolean;
  northArrow: boolean;
  grid: GridKind;
  /** Also draw the grid's lines across the map (the frame ticks are always drawn when grid ≠ "none"). */
  gridLines?: boolean;
  /** A small inset locating the map extent on a lon/lat world frame (no coastlines). */
  overview?: boolean;
  attribution: string;
  format: "pdf" | "png" | "both";
  /** How the map image is embedded in the PDF. Default "jpeg" (quality 0.92). */
  mapImage?: "jpeg" | "png";
  jpegQuality?: number;
  /**
   * What the map frame shows: "view" (default) zooms so the frame covers at
   * least what is on screen; "zoom" keeps the on-screen zoom; a number is a
   * scale denominator (25000 → 1:25 000 at the map centre).
   */
  extent?: "view" | "zoom" | number;
  /** Footer date; false hides it. Default today (ISO). */
  date?: string | false;
  onProgress?: (p: PrintProgress) => void;
  signal?: AbortSignal;
  /** Give up waiting for tiles after this long and print what is drawn (default 60 s). */
  idleTimeoutMs?: number;
}

export interface PrintResult {
  pdf?: Blob;
  png?: Blob;
  /** The DPI the map image actually has (lower than asked when the GPU's canvas limit was hit). */
  effectiveDpi: number;
  warnings: string[];
}

// ---------------------------------------------------------------- geometry

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Text width in millimetres for a font size in points. */
export type Measure = (text: string, sizePt: number, bold?: boolean) => number;

/** A width estimate for Helvetica (average glyph ≈ 0.52 em); good enough for tests and fallbacks. */
export const approxMeasure: Measure = (text, sizePt, bold) => text.length * sizePt * PT_TO_MM * (bold ? 0.56 : 0.52);

export interface PageLayout {
  width: number;
  height: number;
  /** Size factor relative to A4 (fonts, gaps). */
  k: number;
  margin: number;
  title: { x: number; y: number; size: number; maxWidth: number };
  subtitle: { x: number; y: number; size: number; maxWidth: number } | null;
  /** The map frame (the image fills it exactly). */
  map: Rect;
  /** Room around the frame for grid labels (0 without a grid). */
  gutter: number;
  panel: Rect | null;
  legend: Rect | null;
  notes: Rect | null;
  notesLines: string[];
  overview: Rect | null;
  scaleBar: Rect | null;
  northArrow: Rect | null;
  footer: { y: number; x0: number; x1: number; size: number };
}

export interface LayoutContent {
  title: string;
  subtitle?: string;
  notes?: string;
  legend: LegendItem[];
  scaleBar: boolean;
  northArrow: boolean;
  grid: GridKind;
  overview?: boolean;
}

/** Greedy word wrap; words longer than the width are hard-split. Honors newlines. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {out.push(""); continue;}
    let cur = "";
    for (let word of words) {
      while (measure(word) > maxWidth && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && measure(word.slice(0, n)) > maxWidth) {n--;}
        if (cur) {out.push(cur); cur = "";}
        out.push(word.slice(0, n));
        word = word.slice(n);
      }
      const next = cur ? `${cur} ${word}` : word;
      if (measure(next) <= maxWidth || !cur) {cur = next;}
      else {out.push(cur); cur = word;}
    }
    out.push(cur);
  }
  return out;
}

/** Shorten text with "…" to fit a width. */
export function ellipsize(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) {return text;}
  let n = text.length;
  while (n > 0 && measure(`${text.slice(0, n)}…`) > maxWidth) {n--;}
  return n > 0 ? `${text.slice(0, n).trimEnd()}…` : "";
}

const NOTES_PT = 8;
const MAX_NOTES_LINES = 14;

/** Where everything goes on the page, in millimetres. */
export function computeLayout(paperMm: [number, number], c: LayoutContent, measure: Measure = approxMeasure): PageLayout {
  const [W, H] = paperMm;
  const k = Math.max(0.9, Math.min(1.6, Math.sqrt(Math.min(W, H) / 210)));
  const m = 10 * k;
  const gap = 4 * k;
  const titleSize = 18 * k;
  const subSize = 11 * k;
  const title = { x: m, y: m, size: titleSize, maxWidth: W - 2 * m };
  let y = m + titleSize * PT_TO_MM * 1.15;
  const subtitle = c.subtitle ? { x: m, y: y + 1 * k, size: subSize, maxWidth: W - 2 * m } : null;
  if (subtitle) {y += 1 * k + subSize * PT_TO_MM * 1.2;}
  y += gap;
  const footerSize = 7 * k;
  const footerH = footerSize * PT_TO_MM * 1.4;
  const footerY = H - m - footerH;
  const body: Rect = { x: m, y, w: W - 2 * m, h: footerY - gap * 0.5 - y };

  const hasPanel = c.legend.length > 0 || !!c.notes?.trim() || !!c.overview || c.scaleBar || c.northArrow;
  let mapArea: Rect = body;
  let panel: Rect | null = null;
  let legend: Rect | null = null;
  let notes: Rect | null = null;
  let overview: Rect | null = null;
  let scaleBar: Rect | null = null;
  let northArrow: Rect | null = null;
  let notesLines: string[] = [];
  const notesSize = NOTES_PT * k;
  const notesLineH = notesSize * PT_TO_MM * 1.3;
  const wrapNotes = (width: number) => {
    const lines = c.notes?.trim() ? wrapText(c.notes.trim(), width, (s) => measure(s, notesSize)) : [];
    if (lines.length > MAX_NOTES_LINES) {
      const kept = lines.slice(0, MAX_NOTES_LINES);
      kept[MAX_NOTES_LINES - 1] = ellipsize(`${kept[MAX_NOTES_LINES - 1]} …`, width, (s) => measure(s, notesSize));
      return kept;
    }
    return lines;
  };

  if (hasPanel && W >= H) {
    const pw = Math.min(65 * k, body.w * 0.3);
    panel = { x: body.x + body.w - pw, y: body.y, w: pw, h: body.h };
    mapArea = { x: body.x, y: body.y, w: body.w - pw - gap * 1.5, h: body.h };
    let bottom = panel.y + panel.h;
    if (c.scaleBar || c.northArrow) {
      const rowH = 22 * k;
      const row: Rect = { x: panel.x, y: bottom - rowH, w: pw, h: rowH };
      if (c.northArrow) {northArrow = { x: row.x + row.w - 16 * k, y: row.y + 2 * k, w: 16 * k, h: 16 * k };}
      if (c.scaleBar) {scaleBar = { x: row.x, y: row.y, w: row.w - (c.northArrow ? 19 * k : 0), h: rowH };}
      bottom = row.y - gap;
    }
    if (c.overview) {
      const oh = pw / 2 + 4 * k;
      overview = { x: panel.x, y: bottom - oh, w: pw, h: oh };
      bottom = overview.y - gap;
    }
    notesLines = wrapNotes(pw);
    if (notesLines.length) {
      const nh = notesLines.length * notesLineH;
      notes = { x: panel.x, y: bottom - nh, w: pw, h: nh };
      bottom = notes.y - gap;
    }
    if (c.legend.length) {legend = { x: panel.x, y: panel.y, w: pw, h: Math.max(0, bottom - panel.y) };}
  } else if (hasPanel) {
    const ph = Math.min(52 * k, body.h * 0.3);
    panel = { x: body.x, y: body.y + body.h - ph, w: body.w, h: ph };
    mapArea = { x: body.x, y: body.y, w: body.w, h: body.h - ph - gap * 1.5 };
    let right = panel.x + panel.w;
    if (c.scaleBar || c.northArrow) {
      const cw = 46 * k;
      const col: Rect = { x: right - cw, y: panel.y, w: cw, h: ph };
      if (c.northArrow) {northArrow = { x: col.x + (cw - 16 * k) / 2, y: col.y, w: 16 * k, h: 16 * k };}
      if (c.scaleBar) {scaleBar = { x: col.x, y: col.y + (c.northArrow ? 19 * k : 0), w: cw, h: 22 * k };}
      right = col.x - gap;
    }
    if (c.overview) {
      const ow = Math.min(ph * 1.6, (right - panel.x) * 0.5);
      overview = { x: right - ow, y: panel.y, w: ow, h: Math.min(ph, ow / 2 + 4 * k) };
      right = overview.x - gap;
    }
    const colW = right - panel.x;
    notesLines = wrapNotes(colW);
    let bottom = panel.y + ph;
    if (notesLines.length) {
      const maxLines = Math.max(1, Math.floor((ph * 0.45) / notesLineH));
      if (notesLines.length > maxLines) {
        notesLines = notesLines.slice(0, maxLines);
        notesLines[maxLines - 1] = ellipsize(`${notesLines[maxLines - 1]} …`, colW, (s) => measure(s, notesSize));
      }
      const nh = notesLines.length * notesLineH;
      notes = { x: panel.x, y: bottom - nh, w: colW, h: nh };
      bottom = notes.y - gap * 0.5;
    }
    if (c.legend.length) {legend = { x: panel.x, y: panel.y, w: colW, h: Math.max(0, bottom - panel.y) };}
  }

  const gutter = c.grid === "none" ? 0 : 5.5 * k;
  const map: Rect = { x: mapArea.x + gutter, y: mapArea.y + gutter, w: mapArea.w - 2 * gutter, h: mapArea.h - 2 * gutter };
  return {
    width: W,
    height: H,
    k,
    margin: m,
    title,
    subtitle,
    map,
    gutter,
    panel,
    legend,
    notes,
    notesLines,
    overview,
    scaleBar,
    northArrow,
    footer: { y: footerY, x0: m, x1: W - m, size: footerSize },
  };
}

/** The map frame's size in CSS pixels (what the map container is resized to). */
export function frameCssSize(frame: Rect): [number, number] {
  return [Math.max(1, Math.round(mmToPx(frame.w, CSS_DPI))), Math.max(1, Math.round(mmToPx(frame.h, CSS_DPI)))];
}

// ---------------------------------------------------------------- scale

const EARTH_CIRCUMFERENCE = 40075016.686;

/** Great-circle distance in metres (spherical, R = 6371008.8 m). */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The largest 1 / 2 / 5 × 10ⁿ not above `max`. */
export function niceDistance(max: number): number {
  if (!(max > 0) || !Number.isFinite(max)) {return 0;}
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const f of [5, 2, 1]) {if (f * pow <= max * (1 + 1e-9)) {return f * pow;}}
  return pow;
}

export function formatDistance(metres: number): string {
  if (metres >= 1000) {return `${+(metres / 1000).toPrecision(6)} km`;}
  if (metres >= 1) {return `${+metres.toPrecision(6)} m`;}
  return `${+(metres * 100).toPrecision(6)} cm`;
}

export interface ScaleBar {
  metres: number;
  /** Bar length on paper, mm. */
  lengthMm: number;
  label: string;
  /** Alternating segments the bar is divided into. */
  segments: number;
}

/** A scale bar of a nice length no longer than `maxMm`. */
export function niceScaleBar(metresPerMm: number, maxMm: number): ScaleBar | null {
  if (!(metresPerMm > 0) || !(maxMm > 0) || !Number.isFinite(metresPerMm)) {return null;}
  const metres = niceDistance(metresPerMm * maxMm);
  if (!metres) {return null;}
  const lead = Math.round(metres / 10 ** Math.floor(Math.log10(metres)));
  return { metres, lengthMm: metres / metresPerMm, label: formatDistance(metres), segments: lead === 2 ? 4 : lead === 5 ? 5 : 4 };
}

/** Scale denominator from metres on the ground per millimetre on paper. */
export function scaleDenominator(metresPerMm: number): number {
  return metresPerMm * 1000;
}

/** "1:25 000" (rounded to three significant figures). */
export function formatScale(denominator: number): string {
  if (!(denominator > 0) || !Number.isFinite(denominator)) {return "";}
  const p = 10 ** Math.max(0, Math.floor(Math.log10(denominator)) - 2);
  const r = Math.round(denominator / p) * p;
  return `1:${String(r).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

/** The MapLibre zoom (512 px tiles) at which the map is at `denominator` on paper, at a latitude. */
export function zoomForScale(denominator: number, lat: number): number {
  const metresPerCssPx = denominator * (MM_PER_INCH / 1000 / CSS_DPI);
  return Math.log2((EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (512 * metresPerCssPx));
}

// ---------------------------------------------------------------- frame ticks

export type Edge = "top" | "bottom" | "left" | "right";

export interface FrameTick {
  edge: Edge;
  /** Distance along the edge from its start (left for top/bottom, top for left/right), in the sampler's units. */
  offset: number;
  value: number;
  label: string;
}

export interface FrameTicks {
  ticks: FrameTick[];
  interval: number;
  /** UTM zone the MGRS ticks are in. */
  zone?: number;
  /** "Lat/lon 10' (WGS 84)" or "MGRS 32V MP, UTM zone 32, 1 km grid (WGS 84)". */
  description: string;
}

/** px → [lon, lat] */
export type Unproject = (x: number, y: number) => [number, number];

const EDGE_SAMPLES = 240;

function sampleEdge(unproject: Unproject, edge: Edge, w: number, h: number): Array<{ t: number; ll: [number, number] }> {
  const out: Array<{ t: number; ll: [number, number] }> = [];
  const len = edge === "top" || edge === "bottom" ? w : h;
  let prevLon: number | null = null;
  for (let i = 0; i <= EDGE_SAMPLES; i++) {
    const t = (len * i) / EDGE_SAMPLES;
    const [x, y] = edge === "top" ? [t, 0] : edge === "bottom" ? [t, h] : edge === "left" ? [0, t] : [w, t];
    const ll = unproject(x, y);
    if (!Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) {continue;}
    let lon = ll[0];
    if (prevLon !== null) {lon += Math.round((prevLon - lon) / 360) * 360;}
    prevLon = lon;
    out.push({ t, ll: [lon, ll[1]] });
  }
  return out;
}

/** Positions along a sampled edge where `f` crosses a multiple of `interval`. */
function crossings(samples: Array<{ t: number; v: number }>, interval: number): Array<{ t: number; value: number }> {
  const out: Array<{ t: number; value: number }> = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (a.v === b.v) {continue;}
    const lo = Math.min(a.v, b.v);
    const hi = Math.max(a.v, b.v);
    for (let k = Math.ceil(lo / interval - 1e-9); k * interval <= hi + 1e-9 * interval; k++) {
      const value = k * interval;
      // Each crossing once: include the segment's start value only on the first segment.
      if ((value === a.v && i > 0) || (value < lo || value > hi)) {continue;}
      const f = (value - a.v) / (b.v - a.v);
      out.push({ t: a.t + f * (b.t - a.t), value });
    }
  }
  return out;
}

function niceUtmInterval(spanM: number): number {
  for (const sp of [100000, 10000, 1000, 100]) {if (spanM / sp >= 3) {return sp;}}
  return 100;
}

/**
 * Ticks and labels around a map frame, from a px → lon/lat function sampled
 * along its four edges. Lat/lon: meridian crossings on top and bottom,
 * parallel crossings on left and right. MGRS: UTM easting crossings on top and
 * bottom and northing crossings on left and right, in the zone of the frame
 * centre, labelled with principal digits (1 km / 10 km) or kilometres.
 */
export function frameTicks(unproject: Unproject, width: number, height: number, kind: Exclude<GridKind, "none">, opts: { interval?: number; zone?: number } = {}): FrameTicks {
  const edges: Edge[] = ["top", "bottom", "left", "right"];
  const samples = Object.fromEntries(edges.map((e) => [e, sampleEdge(unproject, e, width, height)])) as Record<Edge, Array<{ t: number; ll: [number, number] }>>;
  const ticks: FrameTick[] = [];
  const corner = Math.min(width, height) * 0.004;
  const keep = (edge: Edge, t: number) => {
    const len = edge === "top" || edge === "bottom" ? width : height;
    return t > corner && t < len - corner;
  };
  if (kind === "latlon") {
    const lons = [...samples.top, ...samples.bottom].map((s) => s.ll[0]);
    const lats = [...samples.left, ...samples.right].map((s) => s.ll[1]);
    const span = Math.max(Math.max(...lons) - Math.min(...lons), (Math.max(...lats) - Math.min(...lats)) * (width / Math.max(1, height)));
    const interval = opts.interval ?? niceDegreeInterval(Math.max(span, 1e-6) / 4);
    for (const edge of edges) {
      const axis = edge === "top" || edge === "bottom" ? "lon" : "lat";
      const vals = samples[edge].map((s) => ({ t: s.t, v: axis === "lon" ? s.ll[0] : s.ll[1] }));
      for (const c of crossings(vals, interval)) {
        if (keep(edge, c.t)) {ticks.push({ edge, offset: c.t, value: c.value, label: latLonTickLabel(c.value, axis, interval) });}
      }
    }
    const sec = Math.round(interval * 3600);
    const ivLabel = sec % 3600 === 0 ? `${sec / 3600}°` : sec % 60 === 0 ? `${sec / 60}'` : `${sec}"`;
    return { ticks, interval, description: `Lat/lon grid ${ivLabel} (WGS 84)` };
  }
  const centre = unproject(width / 2, height / 2);
  const zone = opts.zone ?? utmZone(centre[0], centre[1]);
  const en = (ll: [number, number]) => tmForward(ll[0], ll[1], zone);
  const es = [...samples.top, ...samples.bottom].map((s) => en(s.ll).easting);
  const interval = opts.interval ?? niceUtmInterval(Math.max(...es) - Math.min(...es));
  for (const edge of edges) {
    const axis = edge === "top" || edge === "bottom" ? "e" : "n";
    const vals = samples[edge].map((s) => {
      const p = en(s.ll);
      return { t: s.t, v: axis === "e" ? p.easting : p.northing };
    });
    for (const c of crossings(vals, interval)) {
      if (!keep(edge, c.t)) {continue;}
      const value = axis === "n" && c.value < 0 ? c.value + 10000000 : c.value;
      ticks.push({ edge, offset: c.t, value, label: utmTickLabel(value, interval) });
    }
  }
  const parts = toMgrsParts(centre[0], centre[1], 0);
  const where = parts ? `MGRS ${parts.gzd} ${parts.square}, ` : "";
  return { ticks, interval, zone, description: `${where}UTM zone ${zone}, ${formatDistance(interval)} grid (WGS 84)` };
}

/**
 * Grid lines across the frame for the ticks' interval, as polylines in px
 * (via `project`). Lat/lon: meridians and parallels; MGRS: UTM easting and
 * northing lines in the ticks' zone.
 */
export function gridPolylines(
  unproject: Unproject,
  project: (lon: number, lat: number) => [number, number],
  width: number,
  height: number,
  kind: Exclude<GridKind, "none">,
  ft: FrameTicks,
): Array<Array<[number, number]>> {
  const pts: Array<[number, number]> = [];
  for (const e of ["top", "bottom", "left", "right"] as Edge[]) {for (const s of sampleEdge(unproject, e, width, height)) {pts.push(s.ll);}}
  if (!pts.length) {return [];}
  const out: Array<Array<[number, number]>> = [];
  const iv = ft.interval;
  const steps = 48;
  if (kind === "latlon") {
    const [w, e] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    const [s, n] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
    if ((e - w) / iv + (n - s) / iv > 400) {return [];}
    for (let k = Math.ceil(w / iv); k * iv <= e; k++) {
      out.push(Array.from({ length: steps + 1 }, (_, i) => project(k * iv, s + ((n - s) * i) / steps)));
    }
    for (let k = Math.ceil(s / iv); k * iv <= n; k++) {
      out.push(Array.from({ length: steps + 1 }, (_, i) => project(w + ((e - w) * i) / steps, k * iv)));
    }
    return out;
  }
  const zone = ft.zone ?? utmZone(pts[0][0], pts[0][1]);
  const ens = pts.map((p) => tmForward(p[0], p[1], zone));
  const [e0, e1] = [Math.min(...ens.map((p) => p.easting)), Math.max(...ens.map((p) => p.easting))];
  const [n0, n1] = [Math.min(...ens.map((p) => p.northing)), Math.max(...ens.map((p) => p.northing))];
  if ((e1 - e0) / iv + (n1 - n0) / iv > 400) {return [];}
  const ll = (e: number, n: number) => {
    const p = tmInverse(e, n, zone);
    return project(p.lon, p.lat);
  };
  for (let k = Math.ceil(e0 / iv); k * iv <= e1; k++) {out.push(Array.from({ length: steps + 1 }, (_, i) => ll(k * iv, n0 + ((n1 - n0) * i) / steps)));}
  for (let k = Math.ceil(n0 / iv); k * iv <= n1; k++) {out.push(Array.from({ length: steps + 1 }, (_, i) => ll(e0 + ((e1 - e0) * i) / steps, k * iv)));}
  return out;
}

/**
 * Which tick labels to print so they do not collide: walks each edge in order
 * and keeps a label only when it starts at least `minGap` after the previous
 * kept one ends. `width(label)` is the label's extent along the edge.
 */
export function placeTickLabels(ticks: FrameTick[], width: (label: string) => number, minGap: number): Set<FrameTick> {
  const kept = new Set<FrameTick>();
  for (const edge of ["top", "bottom", "left", "right"] as Edge[]) {
    let end = -Infinity;
    for (const t of ticks.filter((x) => x.edge === edge).sort((a, b) => a.offset - b.offset)) {
      const half = width(t.label) / 2;
      if (t.offset - half >= end + minGap) {
        kept.add(t);
        end = t.offset + half;
      }
    }
  }
  return kept;
}

// ---------------------------------------------------------------- north arrow, legend, overview

export type Pt = [number, number];

/**
 * The north arrow's two halves (left filled dark, right light) and where the
 * "N" goes, for a map bearing in degrees. Bearing 0 points straight up; the
 * map's north is rotated counter-clockwise by the bearing.
 */
export function northArrowGeometry(cx: number, cy: number, size: number, bearing: number): { left: Pt[]; right: Pt[]; label: Pt } {
  const a = (-bearing * Math.PI) / 180;
  const rot = ([x, y]: Pt): Pt => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
  const r = size / 2;
  const tip: Pt = [0, -r * 0.62];
  const notch: Pt = [0, r * 0.25];
  const wl: Pt = [-r * 0.36, r * 0.62];
  const wr: Pt = [r * 0.36, r * 0.62];
  return {
    left: [tip, wl, notch].map(rot),
    right: [tip, notch, wr].map(rot),
    label: rot([0, -r * 0.62 - size * 0.06]),
  };
}

export interface LegendEntry {
  item: LegendItem;
  /** Symbol box (empty for headings). */
  symbol: Rect;
  text: { x: number; y: number; value: string; bold: boolean };
}

export interface LegendLayout {
  title: { x: number; y: number; size: number };
  entries: LegendEntry[];
  /** Items that did not fit (summarised as "… N more"). */
  hidden: number;
  more: { x: number; y: number } | null;
  itemSize: number;
}

/** Legend rows in one or more columns inside a rectangle. */
export function legendLayout(items: LegendItem[], rect: Rect, k: number, measure: Measure = approxMeasure): LegendLayout {
  const titleSize = 10 * k;
  const itemSize = 8 * k;
  const rowH = 5 * k;
  const sym = { w: 6.5 * k, h: 3.6 * k };
  const titleH = titleSize * PT_TO_MM * 1.6;
  const textW = Math.max(0, ...items.map((i) => measure(i.label, itemSize, i.kind === "heading")));
  const colW = Math.min(rect.w, sym.w + 2 * k + textW + 4 * k);
  const cols = Math.max(1, Math.floor((rect.w + 4 * k) / Math.max(colW, 1)));
  const rows = Math.max(0, Math.floor((rect.h - titleH) / rowH));
  const capacity = rows * cols;
  let shown = items.length;
  let hidden = 0;
  if (items.length > capacity) {
    shown = Math.max(0, capacity - 1);
    hidden = items.length - shown;
  }
  const realColW = cols > 1 ? (rect.w + 4 * k) / cols - 4 * k : rect.w;
  const entries: LegendEntry[] = [];
  for (let i = 0; i < shown; i++) {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const x = rect.x + col * (realColW + 4 * k);
    const y = rect.y + titleH + row * rowH;
    const item = items[i];
    const heading = item.kind === "heading";
    const tx = heading ? x : x + sym.w + 2 * k;
    const maxW = realColW - (tx - x);
    entries.push({
      item,
      symbol: heading ? { x, y, w: 0, h: 0 } : { x, y: y + (rowH - sym.h) / 2, w: sym.w, h: sym.h },
      text: { x: tx, y: y + rowH / 2, value: ellipsize(item.label, maxW, (s) => measure(s, itemSize, heading)), bold: heading },
    });
  }
  let more: { x: number; y: number } | null = null;
  if (hidden && rows > 0) {
    const col = Math.floor(shown / rows);
    more = { x: rect.x + col * (realColW + 4 * k), y: rect.y + titleH + (shown % rows) * rowH + rowH / 2 };
  }
  return { title: { x: rect.x, y: rect.y, size: titleSize }, entries, hidden, more, itemSize };
}

/** The world (equirectangular, 2:1) fitted and centred in a rectangle, and a lon/lat → mm mapping. */
export function overviewFrame(rect: Rect): { world: Rect; toMm: (lon: number, lat: number) => Pt } {
  const w = Math.min(rect.w, rect.h * 2);
  const h = w / 2;
  const world = { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
  return { world, toMm: (lon, lat) => [world.x + ((lon + 180) / 360) * w, world.y + ((90 - lat) / 180) * h] };
}

// ---------------------------------------------------------------- legend from a project

/** Legend items for a project's visible layers, top layer first. */
export function legendFromProject(project: Project): LegendItem[] {
  const out: LegendItem[] = [];
  for (const node of [...project.layers].reverse()) {
    if (!node.visible) {continue;}
    if (node.kind === "vector") {
      const v = node as VectorLayerNode;
      const geoms = new Set(v.data.features.map((f) => f.geometry?.type.replace("Multi", "")));
      const kind = geoms.has("Polygon") ? "fill" : geoms.has("LineString") ? "line" : "point";
      const classes = legendFor(v);
      if (classes.length) {
        out.push({ label: v.title, color: "#000", kind: "heading" });
        for (const e of classes) {out.push({ label: e.label, color: e.color, kind });}
      } else {
        out.push({ label: v.title, color: v.style.color, kind, strokeColor: v.style.strokeColor });
      }
    } else {
      const c = node as CatalogLayerNode;
      out.push({ label: c.title, color: c.options.color ?? "#999999", kind: "swatch" });
    }
  }
  return out;
}

// ---------------------------------------------------------------- colours

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
  orange: "#ffa500", purple: "#800080", gray: "#808080", grey: "#808080", brown: "#a52a2a", pink: "#ffc0cb",
  cyan: "#00ffff", magenta: "#ff00ff", navy: "#000080", teal: "#008080", olive: "#808000", maroon: "#800000",
  lime: "#00ff00", silver: "#c0c0c0",
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** CSS colour → RGBA (hex, rgb[a](), hsl[a](), a few names, "transparent"); null if unknown. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === "transparent") {return { r: 0, g: 0, b: 0, a: 0 };}
  const hex = NAMED[s] ?? s;
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(hex);
  if (m) {
    let h = m[1];
    if (h.length <= 4) {h = [...h].map((c) => c + c).join("");}
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (!m) {return null;}
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) {return null;}
  const num = (p: string, scale: number) => (p.endsWith("%") ? (parseFloat(p) / 100) * scale : parseFloat(p));
  const a = parts[3] !== undefined ? Math.max(0, Math.min(1, num(parts[3], 1))) : 1;
  if (m[1].startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((p) => Math.round(Math.max(0, Math.min(255, num(p, 255)))));
    return [r, g, b].some((v) => Number.isNaN(v)) ? null : { r, g, b, a };
  }
  const h = ((parseFloat(parts[0]) % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, parseFloat(parts[1]) / 100));
  const l = Math.max(0, Math.min(1, parseFloat(parts[2]) / 100));
  if ([h, sat, l].some((v) => Number.isNaN(v))) {return null;}
  const [r, g, b] = hslToRgb(h, sat, l);
  return { r, g, b, a };
}

function colorOf(c: string | undefined, fallback: Rgba = { r: 0, g: 0, b: 0, a: 1 }): Rgba {
  if (!c) {return fallback;}
  const parsed = parseColor(c);
  if (parsed) {return parsed;}
  // Let the browser resolve anything else (named colours, color()).
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      const resolved = parseColor(String(ctx.fillStyle));
      if (resolved) {return resolved;}
    }
  }
  return fallback;
}

function hex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------- painter

export interface PaintStyle {
  fill?: string;
  stroke?: string;
  /** mm */
  lineWidth?: number;
  dash?: number[];
}

export interface TextStyle {
  /** points */
  size: number;
  bold?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "bottom" | "alphabetic";
  /** Degrees, counter-clockwise. */
  angle?: number;
}

/** Drawing in millimetres; implemented for jsPDF and for a 2D canvas. */
export interface Painter {
  rect(r: Rect, style: PaintStyle): void;
  polyline(points: Pt[], style: PaintStyle & { closed?: boolean }): void;
  circle(cx: number, cy: number, r: number, style: PaintStyle): void;
  text(value: string, x: number, y: number, style: TextStyle): void;
  measure: Measure;
  image(canvas: HTMLCanvasElement, r: Rect): void;
  clip(r: Rect, draw: () => void): void;
}

/** Characters jsPDF's standard (WinAnsi) fonts can show; others become close ASCII or "?". */
export function pdfSafeText(s: string): string {
  return s
    .replace(/[′‘’‛]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/[−‐-―]/g, (c) => (c === "–" || c === "—" ? c : "-"))
    .replace(/…/g, "...")
    .replace(/[  -​ ]/g, " ")
    .replace(/[^\u0000-ÿ–—•€]/g, "?");
}

export function pdfPainter(doc: jsPDF, GStateCtor: new (p: { opacity?: number; "stroke-opacity"?: number }) => unknown, imageFormat: "jpeg" | "png" = "jpeg", jpegQuality = 0.92): Painter {
  let opacity = 1;
  const setOpacity = (a: number) => {
    if (a === opacity) {return;}
    opacity = a;
    doc.setGState(new GStateCtor({ opacity: a, "stroke-opacity": a }));
  };
  const apply = (s: PaintStyle): string | null => {
    const fill = s.fill ? colorOf(s.fill) : null;
    const stroke = s.stroke ? colorOf(s.stroke) : null;
    const f = fill && fill.a > 0 ? fill : null;
    const st = stroke && stroke.a > 0 ? stroke : null;
    if (!f && !st) {return null;}
    if (f) {doc.setFillColor(hex(f));}
    if (st) {
      doc.setDrawColor(hex(st));
      doc.setLineWidth(s.lineWidth ?? 0.2);
      doc.setLineDashPattern(s.dash ?? [], 0);
    }
    setOpacity(Math.min(f ? f.a : 1, st ? st.a : 1));
    return f && st ? "FD" : f ? "F" : "S";
  };
  const font = (size: number, bold?: boolean) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
  };
  return {
    rect(r, style) {
      const mode = apply(style);
      if (mode) {doc.rect(r.x, r.y, r.w, r.h, mode);}
      setOpacity(1);
    },
    polyline(points, style) {
      if (points.length < 2) {return;}
      const mode = apply(style.closed ? style : { ...style, fill: undefined });
      if (!mode) {return;}
      doc.moveTo(points[0][0], points[0][1]);
      for (const p of points.slice(1)) {doc.lineTo(p[0], p[1]);}
      if (style.closed) {doc.close();}
      if (mode === "FD") {doc.fillStroke();}
      else if (mode === "F") {doc.fill();}
      else {doc.stroke();}
      setOpacity(1);
    },
    circle(cx, cy, r, style) {
      const mode = apply(style);
      if (mode) {doc.circle(cx, cy, r, mode);}
      setOpacity(1);
    },
    text(value, x, y, style) {
      font(style.size, style.bold);
      const c = colorOf(style.color ?? "#111111");
      doc.setTextColor(hex(c));
      setOpacity(c.a);
      const txt = pdfSafeText(value);
      if (style.angle) {
        // jsPDF aligns rotated text along the page axes; align it along the text's own axes instead.
        const em = style.size * PT_TO_MM;
        const w = doc.getTextWidth(txt);
        const dx = style.align === "center" ? -w / 2 : style.align === "right" ? -w : 0;
        const b = style.baseline ?? "alphabetic";
        const dy = b === "top" ? 0.75 * em : b === "middle" ? 0.35 * em : b === "bottom" ? -0.22 * em : 0;
        const a = (style.angle * Math.PI) / 180;
        const px = x + dx * Math.cos(a) + dy * Math.sin(a);
        const py = y - dx * Math.sin(a) + dy * Math.cos(a);
        doc.text(txt, px, py, { angle: style.angle, baseline: "alphabetic" });
      } else {
        doc.text(txt, x, y, { align: style.align ?? "left", baseline: style.baseline ?? "alphabetic" });
      }
      setOpacity(1);
    },
    measure(text, size, bold) {
      font(size, bold);
      return doc.getTextWidth(pdfSafeText(text));
    },
    image(canvas, r) {
      const data = imageFormat === "png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", jpegQuality);
      doc.addImage(data, imageFormat === "png" ? "PNG" : "JPEG", r.x, r.y, r.w, r.h, undefined, imageFormat === "png" ? "FAST" : undefined);
    },
    clip(r, draw) {
      doc.saveGraphicsState();
      doc.rect(r.x, r.y, r.w, r.h, null);
      doc.clip();
      doc.discardPath();
      draw();
      doc.restoreGraphicsState();
      opacity = 1;
    },
  };
}

const CANVAS_FONT = "Helvetica, Arial, sans-serif";

/** A painter over a 2D context whose units are millimetres at `pxPerMm`. */
export function canvasPainter(ctx: CanvasRenderingContext2D, pxPerMm: number): Painter {
  const fontPx = (size: number) => size * PT_TO_MM * pxPerMm;
  const setFont = (size: number, bold?: boolean) => {
    ctx.font = `${bold ? "bold " : ""}${fontPx(size)}px ${CANVAS_FONT}`;
  };
  const S = (v: number) => v * pxPerMm;
  const stroke = (s: PaintStyle) => {
    if (!s.stroke) {return false;}
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = S(s.lineWidth ?? 0.2);
    ctx.setLineDash((s.dash ?? []).map(S));
    return true;
  };
  return {
    rect(r, style) {
      if (style.fill) {ctx.fillStyle = style.fill; ctx.fillRect(S(r.x), S(r.y), S(r.w), S(r.h));}
      if (stroke(style)) {ctx.strokeRect(S(r.x), S(r.y), S(r.w), S(r.h));}
    },
    polyline(points, style) {
      if (points.length < 2) {return;}
      ctx.beginPath();
      ctx.moveTo(S(points[0][0]), S(points[0][1]));
      for (const p of points.slice(1)) {ctx.lineTo(S(p[0]), S(p[1]));}
      if (style.closed) {ctx.closePath();}
      if (style.closed && style.fill) {ctx.fillStyle = style.fill; ctx.fill();}
      if (stroke(style)) {ctx.stroke();}
    },
    circle(cx, cy, r, style) {
      ctx.beginPath();
      ctx.arc(S(cx), S(cy), S(r), 0, Math.PI * 2);
      if (style.fill) {ctx.fillStyle = style.fill; ctx.fill();}
      if (stroke(style)) {ctx.stroke();}
    },
    text(value, x, y, style) {
      setFont(style.size, style.bold);
      ctx.fillStyle = style.color ?? "#111111";
      ctx.textAlign = style.align ?? "left";
      ctx.textBaseline = style.baseline ?? "alphabetic";
      if (style.angle) {
        ctx.save();
        ctx.translate(S(x), S(y));
        ctx.rotate((-style.angle * Math.PI) / 180);
        ctx.fillText(value, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(value, S(x), S(y));
      }
    },
    measure(text, size, bold) {
      setFont(size, bold);
      return ctx.measureText(text).width / pxPerMm;
    },
    image(canvas, r) {
      ctx.drawImage(canvas, S(r.x), S(r.y), S(r.w), S(r.h));
    },
    clip(r, draw) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(S(r.x), S(r.y), S(r.w), S(r.h));
      ctx.clip();
      draw();
      ctx.restore();
    },
  };
}

// ---------------------------------------------------------------- drawing (painter-agnostic)

const INK = "#111111";
const MUTED = "#555555";

export function drawLegend(p: Painter, rect: Rect, items: LegendItem[], k: number): void {
  const L = legendLayout(items, rect, k, p.measure);
  p.text("Legend", L.title.x, L.title.y, { size: L.title.size, bold: true, baseline: "top" });
  for (const e of L.entries) {
    const { item, symbol: s } = e;
    const c = item.color;
    if (item.kind === "fill") {
      p.rect(s, { fill: withAlpha(c, 0.55), stroke: item.strokeColor ?? c, lineWidth: 0.35 * k });
    } else if (item.kind === "line") {
      p.polyline([[s.x, s.y + s.h / 2], [s.x + s.w, s.y + s.h / 2]], { stroke: c, lineWidth: 0.8 * k });
    } else if (item.kind === "point") {
      p.circle(s.x + s.w / 2, s.y + s.h / 2, Math.min(s.w, s.h) * 0.38, { fill: c, stroke: item.strokeColor ?? "#ffffff", lineWidth: 0.25 * k });
    } else if (item.kind === "swatch") {
      p.rect(s, { fill: c, stroke: "#999999", lineWidth: 0.15 * k });
    }
    p.text(e.text.value, e.text.x, e.text.y, { size: L.itemSize, bold: e.text.bold, baseline: "middle" });
  }
  if (L.more) {p.text(`… ${L.hidden} more`, L.more.x, L.more.y, { size: L.itemSize, color: MUTED, baseline: "middle" });}
}

function withAlpha(c: string, a: number): string {
  const rgba = colorOf(c);
  return `rgba(${rgba.r},${rgba.g},${rgba.b},${(rgba.a * a).toFixed(3)})`;
}

export function drawScaleBar(p: Painter, rect: Rect, metresPerMm: number, k: number, extraLines: string[] = []): ScaleBar | null {
  const pad = 2 * k;
  const bar = niceScaleBar(metresPerMm, rect.w - 2 * pad - 8 * k);
  const size = 7 * k;
  let y = rect.y + 4 * k;
  if (bar) {
    const barH = 1.6 * k;
    const x0 = rect.x + pad;
    const seg = bar.lengthMm / bar.segments;
    for (let i = 0; i < bar.segments; i++) {
      p.rect({ x: x0 + i * seg, y, w: seg, h: barH }, { fill: i % 2 ? "#ffffff" : INK, stroke: INK, lineWidth: 0.2 * k });
    }
    p.text("0", x0, y - 0.8 * k, { size, align: "center", baseline: "bottom" });
    p.text(bar.label, x0 + bar.lengthMm, y - 0.8 * k, { size, align: "center", baseline: "bottom" });
    y += barH + 2 * k;
  }
  for (const line of [formatScale(scaleDenominator(metresPerMm)), ...extraLines].filter(Boolean)) {
    for (const l of wrapText(line, rect.w - pad, (s) => p.measure(s, size))) {
      p.text(l, rect.x + pad, y, { size, color: MUTED, baseline: "top" });
      y += size * PT_TO_MM * 1.3;
    }
  }
  return bar;
}

export function drawNorthArrow(p: Painter, rect: Rect, bearing: number, k: number): void {
  const size = Math.min(rect.w, rect.h);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2 + size * 0.06;
  const g = northArrowGeometry(cx, cy, size * 0.85, bearing);
  p.polyline(g.left, { closed: true, fill: INK, stroke: INK, lineWidth: 0.2 * k });
  p.polyline(g.right, { closed: true, fill: "#ffffff", stroke: INK, lineWidth: 0.2 * k });
  p.text("N", g.label[0], g.label[1], { size: 8 * k, bold: true, align: "center", baseline: "bottom" });
}

/** Ticks and labels around the map frame; `scale` turns sampler units (CSS px) into mm. */
export function drawFrameTicks(p: Painter, frame: Rect, ft: FrameTicks, scale: number, k: number): void {
  const len = 1.6 * k;
  const size = 6 * k;
  const style = { stroke: INK, lineWidth: 0.2 * k };
  const kept = placeTickLabels(ft.ticks.map((t) => ({ ...t, offset: t.offset * scale })), (l) => p.measure(l, size), 1.5 * k);
  for (const t of kept) {
    const o = t.offset;
    if (t.edge === "top") {
      p.polyline([[frame.x + o, frame.y], [frame.x + o, frame.y - len]], style);
      p.text(t.label, frame.x + o, frame.y - len - 0.4 * k, { size, align: "center", baseline: "bottom" });
    } else if (t.edge === "bottom") {
      p.polyline([[frame.x + o, frame.y + frame.h], [frame.x + o, frame.y + frame.h + len]], style);
      p.text(t.label, frame.x + o, frame.y + frame.h + len + 0.4 * k, { size, align: "center", baseline: "top" });
    } else if (t.edge === "left") {
      p.polyline([[frame.x, frame.y + o], [frame.x - len, frame.y + o]], style);
      p.text(t.label, frame.x - len - 0.4 * k, frame.y + o, { size, align: "center", baseline: "bottom", angle: 90 });
    } else {
      p.polyline([[frame.x + frame.w, frame.y + o], [frame.x + frame.w + len, frame.y + o]], style);
      p.text(t.label, frame.x + frame.w + len + 0.4 * k, frame.y + o, { size, align: "center", baseline: "bottom", angle: -90 });
    }
  }
  // Unlabelled ticks still get their mark.
  for (const t of ft.ticks) {
    const o = t.offset * scale;
    if ([...kept].some((x) => x.edge === t.edge && Math.abs(x.offset - o) < 1e-9)) {continue;}
    if (t.edge === "top") {p.polyline([[frame.x + o, frame.y], [frame.x + o, frame.y - len]], style);}
    else if (t.edge === "bottom") {p.polyline([[frame.x + o, frame.y + frame.h], [frame.x + o, frame.y + frame.h + len]], style);}
    else if (t.edge === "left") {p.polyline([[frame.x, frame.y + o], [frame.x - len, frame.y + o]], style);}
    else {p.polyline([[frame.x + frame.w, frame.y + o], [frame.x + frame.w + len, frame.y + o]], style);}
  }
}

/**
 * The overview inset: a lon/lat world frame with a 30° graticule (no
 * coastlines: the studio carries no world geometry) and the map's extent.
 */
export function drawOverview(p: Painter, rect: Rect, extent: Pt[], k: number): void {
  const captionSize = 6 * k;
  const capH = captionSize * PT_TO_MM * 1.5;
  const area = { x: rect.x, y: rect.y, w: rect.w, h: rect.h - capH };
  const { world, toMm } = overviewFrame(area);
  p.rect(world, { fill: "#eef3f7", stroke: "#8a99a6", lineWidth: 0.2 * k });
  for (let lon = -150; lon <= 150; lon += 30) {
    p.polyline([toMm(lon, 90), toMm(lon, -90)], { stroke: lon === 0 ? "#8a99a6" : "#c9d3dc", lineWidth: 0.12 * k });
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    p.polyline([toMm(-180, lat), toMm(180, lat)], { stroke: lat === 0 ? "#8a99a6" : "#c9d3dc", lineWidth: 0.12 * k });
  }
  if (extent.length >= 3) {
    // Unwrap longitudes around the first vertex so a ring across 180° stays whole.
    const ref = extent[0][0];
    const ring = extent.map(([lon, lat]): Pt => [lon + Math.round((ref - lon) / 360) * 360, Math.max(-90, Math.min(90, lat))]);
    const shift = ref > 180 ? -360 : ref < -180 ? 360 : 0;
    const mm = ring.map(([lon, lat]) => toMm(lon + shift, lat));
    const xs = mm.map((q) => q[0]);
    const ys = mm.map((q) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    p.clip(world, () => {
      p.polyline(mm, { closed: true, fill: "rgba(214,39,40,0.25)", stroke: "#d62728", lineWidth: 0.35 * k });
      if (Math.max(...xs) - Math.min(...xs) < world.w * 0.04 && Math.max(...ys) - Math.min(...ys) < world.h * 0.04) {
        const r = 2.2 * k;
        p.polyline([[cx - r, cy], [cx + r, cy]], { stroke: "#d62728", lineWidth: 0.3 * k });
        p.polyline([[cx, cy - r], [cx, cy + r]], { stroke: "#d62728", lineWidth: 0.3 * k });
        p.circle(cx, cy, r * 0.6, { stroke: "#d62728", lineWidth: 0.3 * k });
      }
    });
  }
  p.text("Map extent on a lon/lat world frame", rect.x + rect.w / 2, rect.y + rect.h, { size: captionSize, color: MUTED, align: "center", baseline: "bottom" });
}

/** Everything known about one page once the map has been captured. */
export interface PageContent {
  title: string;
  subtitle?: string;
  legend: LegendItem[];
  attribution: string;
  date?: string | false;
  mapImage: HTMLCanvasElement | null;
  /** Frame size in CSS px the ticks/lines are measured in. */
  frameCss: [number, number];
  bearing: number;
  metresPerMm: number | null;
  ticks: FrameTicks | null;
  gridLines: Array<Array<[number, number]>> | null;
  overviewExtent: Pt[] | null;
  extraScaleLines?: string[];
}

export function drawPage(p: Painter, L: PageLayout, c: PageContent): void {
  const k = L.k;
  p.rect({ x: 0, y: 0, w: L.width, h: L.height }, { fill: "#ffffff" });
  p.text(ellipsize(c.title, L.title.maxWidth, (s) => p.measure(s, L.title.size, true)), L.title.x, L.title.y, { size: L.title.size, bold: true, baseline: "top" });
  if (L.subtitle && c.subtitle) {
    p.text(ellipsize(c.subtitle, L.subtitle.maxWidth, (s) => p.measure(s, L.subtitle!.size)), L.subtitle.x, L.subtitle.y, { size: L.subtitle.size, color: MUTED, baseline: "top" });
  }
  const f = L.map;
  if (c.mapImage) {p.image(c.mapImage, f);}
  else {p.rect(f, { fill: "#f2f2f2" });}
  const sx = f.w / c.frameCss[0];
  if (c.gridLines?.length) {
    p.clip(f, () => {
      for (const line of c.gridLines!) {
        p.polyline(line.map(([x, y]): Pt => [f.x + x * sx, f.y + y * sx]), { stroke: "rgba(20,20,20,0.55)", lineWidth: 0.15 * k });
      }
    });
  }
  p.rect(f, { stroke: INK, lineWidth: 0.3 * k });
  if (c.ticks) {drawFrameTicks(p, f, c.ticks, sx, k);}
  if (L.legend && c.legend.length) {drawLegend(p, L.legend, c.legend, k);}
  if (L.notes && L.notesLines.length) {
    const size = NOTES_PT * k;
    L.notesLines.forEach((line, i) => p.text(line, L.notes!.x, L.notes!.y + i * size * PT_TO_MM * 1.3, { size, color: INK, baseline: "top" }));
  }
  if (L.overview && c.overviewExtent) {drawOverview(p, L.overview, c.overviewExtent, k);}
  const extra = [...(c.extraScaleLines ?? []), ...(c.ticks ? [c.ticks.description] : [])];
  if (L.scaleBar && c.metresPerMm) {drawScaleBar(p, L.scaleBar, c.metresPerMm, k, extra);}
  if (L.northArrow) {drawNorthArrow(p, L.northArrow, c.bearing, k);}
  const fy = L.footer.y + L.footer.size * PT_TO_MM;
  const right = [`Decho Studio`, c.date === false ? "" : c.date ?? new Date().toISOString().slice(0, 10)].filter(Boolean).join(" · ");
  const rw = p.measure(right, L.footer.size);
  const left = [!L.scaleBar && c.ticks ? c.ticks.description : "", c.attribution].filter(Boolean).join(" · ");
  p.text(ellipsize(left, L.footer.x1 - L.footer.x0 - rw - 6, (s) => p.measure(s, L.footer.size)), L.footer.x0, fy, { size: L.footer.size, color: MUTED, baseline: "middle" });
  p.text(right, L.footer.x1, fy, { size: L.footer.size, color: MUTED, align: "right", baseline: "middle" });
}

// ---------------------------------------------------------------- live map

function abortError(): Error {
  return typeof DOMException !== "undefined" ? new DOMException("Print cancelled", "AbortError") : Object.assign(new Error("Print cancelled"), { name: "AbortError" });
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {throw abortError();}
}

/** Resolves true on the map's next "idle", false on timeout; rejects on abort. */
export function waitForIdle(map: MlMap, signal?: AbortSignal, timeoutMs = 60000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (r: boolean | Error) => {
      if (done) {return;}
      done = true;
      map.off("idle", onIdle);
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (r instanceof Error) {reject(r);} else {resolve(r);}
    };
    const onIdle = () => finish(true);
    const onAbort = () => finish(abortError());
    if (signal?.aborted) {finish(abortError()); return;}
    map.on("idle", onIdle);
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => finish(false), timeoutMs);
    map.triggerRepaint();
  });
}

interface MapInternals {
  _overridePixelRatio?: number | null;
  _maxCanvasSize?: [number, number];
}

interface PrintSession {
  layout: PageLayout;
  css: [number, number];
  restore: () => Promise<void>;
  warnings: string[];
}

function glCanvasLimit(map: MlMap): number {
  const canvas = map.getCanvas();
  const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
  if (!gl) {return 4096;}
  const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | number[] | null;
  return Math.min(
    Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096,
    Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 4096,
    dims ? Math.min(Number(dims[0]), Number(dims[1])) : 4096,
    16384,
  );
}

/** Resize the map to the frame's print size; `restore` puts everything back. */
async function beginPrint(map: MlMap, opts: LayoutOptions, measure: Measure): Promise<PrintSession> {
  const layout = computeLayout(paperSizeMm(opts.paper, opts.orientation), opts, measure);
  const css = frameCssSize(layout.map);
  const dpi = clampDpi(opts.dpi);
  const container = map.getContainer();
  const internals = map as unknown as MapInternals;
  const saved = {
    cssText: container.style.cssText,
    override: internals._overridePixelRatio,
    ratio: map.getPixelRatio(),
    maxCanvas: internals._maxCanvasSize ? ([...internals._maxCanvasSize] as [number, number]) : undefined,
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    width: container.clientWidth || css[0],
    height: container.clientHeight || css[1],
  };
  const warnings: string[] = [];
  let restored = false;
  const restore = async () => {
    if (restored) {return;}
    restored = true;
    container.style.cssText = saved.cssText;
    if (saved.maxCanvas) {internals._maxCanvasSize = saved.maxCanvas;}
    map.setPixelRatio((saved.override ?? null) as number);
    map.resize();
    map.jumpTo({ center: saved.center, zoom: saved.zoom, bearing: saved.bearing, pitch: saved.pitch });
    map.triggerRepaint();
  };
  try {
    if (internals._maxCanvasSize) {
      const lim = glCanvasLimit(map);
      internals._maxCanvasSize = [lim, lim];
    }
    const st = container.style;
    st.width = `${css[0]}px`;
    st.height = `${css[1]}px`;
    st.minWidth = st.minHeight = "0";
    st.maxWidth = st.maxHeight = "none";
    st.flex = "none";
    map.setPixelRatio(dpi / CSS_DPI);
    map.resize();
    let zoom = saved.zoom;
    if (typeof opts.extent === "number") {zoom = zoomForScale(opts.extent, saved.center.lat);}
    else if (opts.extent !== "zoom") {zoom = saved.zoom + Math.log2(Math.min(css[0] / saved.width, css[1] / saved.height));}
    map.jumpTo({ center: saved.center, zoom, bearing: saved.bearing, pitch: saved.pitch });
  } catch (e) {
    await restore();
    throw e;
  }
  return { layout, css, restore, warnings };
}

/** Wait for the map to settle and gather everything a page needs. */
async function capture(map: MlMap, s: PrintSession, opts: LayoutOptions, title: string, subtitle?: string): Promise<{ content: PageContent; dpi: number }> {
  const finished = await waitForIdle(map, opts.signal, opts.idleTimeoutMs ?? 60000);
  if (!finished) {s.warnings.push("The map had not finished loading when the page was printed.");}
  const src = map.getCanvas();
  const img = document.createElement("canvas");
  img.width = src.width;
  img.height = src.height;
  const ctx = img.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.drawImage(src, 0, 0);
  const dpi = (src.width / s.css[0]) * CSS_DPI;
  const wanted = clampDpi(opts.dpi);
  if (dpi < wanted * 0.98 && !s.warnings.some((w) => w.startsWith("The map image"))) {
    s.warnings.push(`The map image is ${Math.round(dpi)} dpi (the GPU limits the canvas to ${src.width}×${src.height} px).`);
  }

  const [w, h] = s.css;
  const unproject: Unproject = (x, y) => {
    const ll = map.unproject([x, y]);
    return [ll.lng, ll.lat];
  };
  const mmPerCss = s.layout.map.w / w;
  let metresPerMm: number | null = null;
  const a = unproject(w / 2 - 50, h / 2);
  const b = unproject(w / 2 + 50, h / 2);
  const d = haversine(a, b);
  if (d > 0 && Number.isFinite(d)) {metresPerMm = d / 100 / mmPerCss;}
  let ticks: FrameTicks | null = null;
  let gridLines: PageContent["gridLines"] = null;
  if (opts.grid !== "none") {
    ticks = frameTicks(unproject, w, h, opts.grid);
    if (opts.gridLines) {
      gridLines = gridPolylines(unproject, (lon, lat) => {
        const p = map.project([lon, lat]);
        return [p.x, p.y];
      }, w, h, opts.grid, ticks);
    }
  }
  let overviewExtent: Pt[] | null = null;
  if (opts.overview) {
    const ring: Pt[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {ring.push(unproject((w * i) / n, 0));}
    for (let i = 0; i < n; i++) {ring.push(unproject(w, (h * i) / n));}
    for (let i = n; i > 0; i--) {ring.push(unproject((w * i) / n, h));}
    for (let i = n; i > 0; i--) {ring.push(unproject(0, (h * i) / n));}
    overviewExtent = ring.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }
  const extra = map.getPitch() > 1 ? ["Tilted view: the scale is true at the map centre only."] : [];
  return {
    dpi,
    content: {
      title,
      subtitle,
      legend: opts.legend,
      attribution: opts.attribution,
      date: opts.date,
      mapImage: img,
      frameCss: s.css,
      bearing: map.getBearing(),
      metresPerMm,
      ticks,
      gridLines,
      overviewExtent,
      extraScaleLines: extra,
    },
  };
}

async function loadJsPdf() {
  const mod = await import("jspdf");
  return { JsPDF: mod.jsPDF, GState: mod.GState as unknown as new (p: { opacity?: number }) => unknown };
}

function newDoc(JsPDF: typeof jsPDF, opts: LayoutOptions): jsPDF {
  const [w, h] = paperSizeMm(opts.paper, opts.orientation);
  return new JsPDF({ orientation: opts.orientation, unit: "mm", format: [w, h], compress: true });
}

function pngOf(L: PageLayout, content: PageContent, dpi: number): Promise<Blob> {
  const pxPerMm = dpi / MM_PER_INCH;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(L.width * pxPerMm);
  canvas.height = Math.round(L.height * pxPerMm);
  const ctx = canvas.getContext("2d");
  if (!ctx) {return Promise.reject(new Error("No 2D canvas available for the PNG."));}
  drawPage(canvasPainter(ctx, pxPerMm), L, content);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}

/**
 * Render a print layout of the live map as PDF and/or PNG. The map container
 * is temporarily resized and its pixel ratio raised; size, pixel ratio and
 * view are restored before this resolves (also on error or abort).
 */
export async function renderLayout(map: MlMap, opts: LayoutOptions): Promise<PrintResult> {
  checkAbort(opts.signal);
  const progress = (fraction: number, stage: string) => opts.onProgress?.({ fraction, stage });
  progress(0, "Preparing");
  const { JsPDF, GState } = await loadJsPdf();
  const doc = newDoc(JsPDF, opts);
  const measurer = pdfPainter(doc, GState).measure;
  const session = await beginPrint(map, opts, measurer);
  const result: PrintResult = { effectiveDpi: clampDpi(opts.dpi), warnings: session.warnings };
  try {
    progress(0.1, "Rendering the map");
    const { content, dpi } = await capture(map, session, opts, opts.title, opts.subtitle);
    result.effectiveDpi = Math.round(dpi);
    await session.restore();
    checkAbort(opts.signal);
    if (opts.format !== "png") {
      progress(0.6, "Writing the PDF");
      drawPage(pdfPainter(doc, GState, opts.mapImage ?? "jpeg", opts.jpegQuality ?? 0.92), session.layout, content);
      result.pdf = doc.output("blob");
    }
    if (opts.format !== "pdf") {
      progress(0.8, "Writing the PNG");
      result.png = await pngOf(session.layout, content, clampDpi(opts.dpi));
    }
    progress(1, "Done");
    return result;
  } finally {
    await session.restore();
  }
}

export interface AtlasOptions extends LayoutOptions {
  /** Feature property used as each page's title (default: "<title> — page n"). */
  titleField?: string;
  /** Margin around each feature, % of the frame's shorter side (default 10). */
  marginPct?: number;
}

/** [w, s, e, n] of any GeoJSON geometry. */
export function featureBounds(f: Feature): [number, number, number, number] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      if (Number.isFinite(x) && Number.isFinite(y)) {w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);}
    } else if (Array.isArray(c)) {c.forEach(visit);}
  };
  const g = f.geometry;
  if (!g) {return null;}
  if (g.type === "GeometryCollection") {g.geometries.forEach((x) => visit((x as { coordinates?: unknown }).coordinates));}
  else {visit(g.coordinates);}
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/**
 * One PDF page per feature: the map is fitted to each feature in turn,
 * rendered and laid out with the same decorations. The view is restored at
 * the end. Features without geometry are skipped.
 */
export async function renderAtlas(map: MlMap, features: Feature[], opts: AtlasOptions): Promise<Blob> {
  checkAbort(opts.signal);
  const { JsPDF, GState } = await loadJsPdf();
  const doc = newDoc(JsPDF, opts);
  const painter = pdfPainter(doc, GState, opts.mapImage ?? "jpeg", opts.jpegQuality ?? 0.92);
  const pageSubtitle = opts.titleField ? opts.title : opts.subtitle;
  const session = await beginPrint(map, { ...opts, subtitle: pageSubtitle }, painter.measure);
  const total = features.length;
  const report = (i: number, stage: string) => opts.onProgress?.({ fraction: total ? i / total : 1, stage, page: i + 1, pages: total });
  try {
    const margin = (Math.max(0, Math.min(45, opts.marginPct ?? 10)) / 100) * Math.min(...session.css);
    const bearing = map.getBearing();
    let pages = 0;
    for (let i = 0; i < total; i++) {
      checkAbort(opts.signal);
      const f = features[i];
      const b = featureBounds(f);
      if (!b) {continue;}
      report(i, "Rendering");
      if (b[0] === b[2] && b[1] === b[3]) {
        map.jumpTo({ center: [b[0], b[1]], zoom: typeof opts.extent === "number" ? zoomForScale(opts.extent, b[1]) : map.getZoom() });
      } else {
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: margin, animate: false, bearing });
      }
      const raw = opts.titleField ? f.properties?.[opts.titleField] : undefined;
      const title = raw !== undefined && raw !== null && String(raw) !== "" ? String(raw) : `${opts.title} — page ${pages + 1}`;
      const { content } = await capture(map, session, opts, title, pageSubtitle);
      if (pages > 0) {doc.addPage([session.layout.width, session.layout.height], opts.orientation);}
      drawPage(painter, session.layout, content);
      pages++;
    }
    if (!pages) {throw new Error("None of the features has a geometry to print.");}
    opts.onProgress?.({ fraction: 1, stage: "Done", page: total, pages: total });
    return doc.output("blob");
  } finally {
    await session.restore();
  }
}
