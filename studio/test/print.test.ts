import { describe, expect, it } from "vitest";
import { fromUtm } from "../src/coords/utm";
import {
  approxMeasure,
  computeLayout,
  drawPage,
  featureBounds,
  formatDistance,
  formatScale,
  frameCssSize,
  frameTicks,
  gridPolylines,
  haversine,
  legendFromProject,
  legendLayout,
  niceDistance,
  niceScaleBar,
  northArrowGeometry,
  overviewFrame,
  paperSizeMm,
  paperSizePx,
  parseColor,
  pdfPainter,
  pdfSafeText,
  placeTickLabels,
  scaleDenominator,
  wrapText,
  zoomForScale,
  type LayoutContent,
  type LegendItem,
  type PageContent,
  type Painter,
  type Rect,
} from "../src/print/layout";
import { defaultVectorStyle, newProject, type VectorLayerNode } from "../src/project/types";

const content = (over: Partial<LayoutContent> = {}): LayoutContent => ({
  title: "Jotunheimen",
  legend: [{ label: "Trails", color: "#d00", kind: "line" }],
  scaleBar: true,
  northArrow: true,
  grid: "none",
  ...over,
});

const inside = (r: Rect, outer: Rect) => r.x >= outer.x - 1e-9 && r.y >= outer.y - 1e-9 && r.x + r.w <= outer.x + outer.w + 1e-9 && r.y + r.h <= outer.y + outer.h + 1e-9;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("paper", () => {
  it("sizes in mm and px", () => {
    expect(paperSizeMm("A4", "portrait")).toEqual([210, 297]);
    expect(paperSizeMm("A4", "landscape")).toEqual([297, 210]);
    expect(paperSizePx("A4", "portrait", 300)).toEqual([2480, 3508]);
    expect(paperSizePx("A4", "landscape", 96)).toEqual([1123, 794]);
    expect(paperSizePx("A3", "portrait", 150)).toEqual([1754, 2480]);
    expect(paperSizePx("A2", "landscape", 300)).toEqual([7016, 4961]);
    expect(paperSizePx("Letter", "portrait", 300)).toEqual([2550, 3300]);
    expect(paperSizePx("Tabloid", "portrait", 200)).toEqual([2200, 3400]);
  });
});

describe("scale", () => {
  it("nice distances", () => {
    expect(niceDistance(1480)).toBe(1000);
    expect(niceDistance(2000)).toBe(2000);
    expect(niceDistance(4999)).toBe(2000);
    expect(niceDistance(0.37)).toBe(0.2);
    expect(niceDistance(0)).toBe(0);
  });

  it("scale bars", () => {
    expect(niceScaleBar(25, 40)).toEqual({ metres: 1000, lengthMm: 40, label: "1 km", segments: 4 });
    expect(niceScaleBar(50, 40)).toMatchObject({ metres: 2000, lengthMm: 40, label: "2 km", segments: 4 });
    const b = niceScaleBar(37, 40)!;
    expect(b.metres).toBe(1000);
    expect(b.lengthMm).toBeCloseTo(27.027, 3);
    expect(niceScaleBar(2.5, 50)).toMatchObject({ metres: 100, label: "100 m", segments: 4 });
    expect(niceScaleBar(12, 50)).toMatchObject({ metres: 500, label: "500 m", segments: 5 });
    expect(niceScaleBar(Number.NaN, 50)).toBeNull();
    expect(formatDistance(0.5)).toBe("50 cm");
    expect(formatDistance(1500)).toBe("1.5 km");
  });

  it("scale text and zoom for a scale", () => {
    expect(scaleDenominator(25)).toBe(25000);
    expect(formatScale(24987)).toBe("1:25 000");
    expect(formatScale(1234567)).toBe("1:1 230 000");
    expect(formatScale(850)).toBe("1:850");
    // At zoom z a 512 px tile spans the circumference: metres per CSS px = C cos φ / (512 · 2^z).
    const z = zoomForScale(25000, 60);
    const mPerPx = (40075016.686 * Math.cos(Math.PI / 3)) / (512 * 2 ** z);
    expect(mPerPx / (0.0254 / 96)).toBeCloseTo(25000, 3);
    expect(haversine([0, 0], [1, 0])).toBeCloseTo(111195, -1);
  });
});

describe("layout", () => {
  it("A4 landscape: map left, panel right, nothing overlaps", () => {
    const L = computeLayout(paperSizeMm("A4", "landscape"), content({ overview: true, notes: "Surveyed 2026." }));
    const page = { x: 0, y: 0, w: L.width, h: L.height };
    expect(L.panel).not.toBeNull();
    for (const r of [L.map, L.panel!, L.legend!, L.overview!, L.scaleBar!, L.northArrow!, L.notes!]) {expect(inside(r, page)).toBe(true);}
    for (const r of [L.legend!, L.overview!, L.scaleBar!, L.northArrow!, L.notes!]) {
      expect(inside(r, L.panel!)).toBe(true);
      expect(overlaps(r, L.map)).toBe(false);
    }
    expect(overlaps(L.legend!, L.overview!)).toBe(false);
    expect(overlaps(L.notes!, L.overview!)).toBe(false);
    expect(L.panel!.x).toBeGreaterThan(L.map.x + L.map.w);
    expect(L.map.w).toBeGreaterThan(180);
    expect(L.notesLines).toEqual(["Surveyed 2026."]);
  });

  it("portrait: panel below the map", () => {
    const L = computeLayout(paperSizeMm("A3", "portrait"), content({ overview: true }));
    expect(L.panel!.y).toBeGreaterThan(L.map.y + L.map.h);
    expect(L.k).toBeGreaterThan(1);
    for (const r of [L.legend!, L.overview!, L.scaleBar!, L.northArrow!]) {expect(inside(r, L.panel!)).toBe(true);}
    expect(overlaps(L.legend!, L.overview!)).toBe(false);
    expect(overlaps(L.overview!, L.scaleBar!)).toBe(false);
  });

  it("a grid leaves a gutter for labels; no decorations, no panel", () => {
    const plain = computeLayout([297, 210], content({ legend: [], scaleBar: false, northArrow: false }));
    expect(plain.panel).toBeNull();
    const grid = computeLayout([297, 210], content({ legend: [], scaleBar: false, northArrow: false, grid: "mgrs" }));
    expect(grid.gutter).toBeGreaterThan(0);
    expect(grid.map.x - plain.map.x).toBeCloseTo(grid.gutter, 9);
    expect(plain.map.w - grid.map.w).toBeCloseTo(2 * grid.gutter, 9);
  });

  it("frame size in CSS px (1/96 in)", () => {
    expect(frameCssSize({ x: 0, y: 0, w: 254, h: 127 })).toEqual([960, 480]);
  });

  it("wraps and fits text", () => {
    const m = (s: string) => s.length;
    expect(wrapText("one two three four", 9, m)).toEqual(["one two", "three", "four"]);
    expect(wrapText("abcdefghijkl", 5, m)).toEqual(["abcde", "fghij", "kl"]);
    expect(wrapText("a\nb", 9, m)).toEqual(["a", "b"]);
  });
});

describe("frame ticks", () => {
  it("lat/lon ticks on a north-up frame", () => {
    // 1000 × 800 px; lon 8°→9° left to right, lat 62°→61.6° top to bottom.
    const un = (x: number, y: number): [number, number] => [8 + x * 0.001, 62 - y * 0.0005];
    const ft = frameTicks(un, 1000, 800, "latlon");
    expect(ft.interval).toBeCloseTo(0.25, 12);
    const top = ft.ticks.filter((t) => t.edge === "top");
    expect(top.map((t) => Math.round(t.offset))).toEqual([250, 500, 750]);
    expect(top.map((t) => t.label)).toEqual(["8°15'E", "8°30'E", "8°45'E"]);
    expect(ft.ticks.filter((t) => t.edge === "bottom").length).toBe(3);
    const left = ft.ticks.filter((t) => t.edge === "left");
    expect(left.map((t) => [Math.round(t.offset), t.label])).toEqual([[500, "61°45'N"]]);
    expect(ft.description).toContain("15'");
  });

  it("MGRS ticks follow UTM eastings and northings", () => {
    // A frame laid out in UTM zone 32: E = 460 000 + 10x, N = 6 840 000 − 10y.
    const un = (x: number, y: number): [number, number] => {
      const p = fromUtm(32, "N", 460000 + 10 * x, 6840000 - 10 * y);
      return [p.lon, p.lat];
    };
    const ft = frameTicks(un, 1000, 800, "mgrs");
    expect(ft.zone).toBe(32);
    expect(ft.interval).toBe(1000);
    const top = ft.ticks.filter((t) => t.edge === "top");
    expect(top.map((t) => t.label)).toEqual(["61", "62", "63", "64", "65", "66", "67", "68", "69"]);
    top.forEach((t, i) => expect(t.offset).toBeCloseTo(100 * (i + 1), 3));
    const left = ft.ticks.filter((t) => t.edge === "left");
    expect(left.map((t) => t.label)).toEqual(["39", "38", "37", "36", "35", "34", "33"]);
    expect(ft.description).toMatch(/MGRS 32V M[NP], UTM zone 32, 1 km grid/);
    const lines = gridPolylines(un, () => [0, 0], 1000, 800, "mgrs", ft);
    // eastings 461–469 km and northings 6833–6839 km inside, plus up to 4 on the frame edges
    expect(lines.length).toBeGreaterThanOrEqual(16);
    expect(lines.length).toBeLessThanOrEqual(20);
  });

  it("drops labels that would collide", () => {
    const ticks = [0, 4, 8, 20].map((o) => ({ edge: "top" as const, offset: o, value: o, label: "xx" }));
    const kept = placeTickLabels(ticks, () => 5, 1);
    expect([...kept].map((t) => t.offset)).toEqual([0, 8, 20]);
  });
});

describe("north arrow, legend, overview", () => {
  it("points the arrow at north for the bearing", () => {
    const up = northArrowGeometry(0, 0, 10, 0);
    expect(up.left[0][0]).toBeCloseTo(0, 9);
    expect(up.left[0][1]).toBeLessThan(0);
    expect(up.label[1]).toBeLessThan(up.left[0][1]);
    // Map turned to face east: north is to the left on paper.
    const east = northArrowGeometry(0, 0, 10, 90);
    expect(east.left[0][0]).toBeLessThan(0);
    expect(east.left[0][1]).toBeCloseTo(0, 9);
  });

  it("lays out legend rows and summarises overflow", () => {
    const items: LegendItem[] = [
      { label: "Roads", color: "#333", kind: "heading" },
      { label: "Main", color: "#f00", kind: "line" },
      { label: "Lakes", color: "#00f", kind: "fill" },
    ];
    const L = legendLayout(items, { x: 0, y: 0, w: 60, h: 40 }, 1);
    expect(L.entries.length).toBe(3);
    expect(L.hidden).toBe(0);
    expect(L.entries[0].text.bold).toBe(true);
    expect(L.entries[0].symbol.w).toBe(0);
    expect(L.entries[1].text.y).toBeGreaterThan(L.entries[0].text.y);
    const many = Array.from({ length: 100 }, (_, i): LegendItem => ({ label: `Class ${i}`, color: "#0a0", kind: "swatch" }));
    const M = legendLayout(many, { x: 0, y: 0, w: 60, h: 40 }, 1);
    expect(M.entries.length + M.hidden).toBe(100);
    expect(M.hidden).toBeGreaterThan(0);
    expect(M.more).not.toBeNull();
    for (const e of M.entries) {expect(e.symbol.x + e.symbol.w).toBeLessThanOrEqual(60);}
  });

  it("maps lon/lat into the overview frame", () => {
    const { world, toMm } = overviewFrame({ x: 0, y: 0, w: 100, h: 40 });
    expect(world).toEqual({ x: 10, y: 0, w: 80, h: 40 });
    expect(toMm(0, 0)).toEqual([50, 20]);
    expect(toMm(-180, 90)).toEqual([10, 0]);
  });

  it("builds a legend from a project", () => {
    const p = newProject();
    const layer: VectorLayerNode = {
      kind: "vector", id: "v1", title: "Huts", visible: true, opacity: 1, style: defaultVectorStyle(0), fields: [],
      data: { type: "FeatureCollection", features: [{ type: "Feature", id: "f1", properties: {}, geometry: { type: "Point", coordinates: [8, 61] } }] },
    };
    p.layers.push(layer);
    expect(legendFromProject(p)).toEqual([{ label: "Huts", color: layer.style.color, kind: "point", strokeColor: layer.style.strokeColor }]);
  });
});

describe("colours and text", () => {
  it("parses CSS colours", () => {
    expect(parseColor("#f80")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parseColor("#11223380")!.a).toBeCloseTo(0.502, 3);
    expect(parseColor("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor("rgb(10 20 30 / 50%)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor("hsl(120, 100%, 25%)")).toEqual({ r: 0, g: 128, b: 0, a: 1 });
    expect(parseColor("grey")).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    expect(parseColor("transparent")!.a).toBe(0);
    expect(parseColor("nonsense")).toBeNull();
  });

  it("keeps PDF text in the standard fonts' character set", () => {
    expect(pdfSafeText("61°38′12″N — Galdhøpiggen…")).toBe(`61°38'12"N — Galdhøpiggen...`);
    expect(pdfSafeText("東京")).toBe("??");
  });

  it("finds feature bounds", () => {
    expect(featureBounds({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[1, 2], [3, 2], [3, 5], [1, 2]]] } })).toEqual([1, 2, 3, 5]);
    expect(featureBounds({ type: "Feature", properties: {}, geometry: null as never })).toBeNull();
  });
});

class RecordingPainter implements Painter {
  calls: Array<{ op: string; args: unknown[] }> = [];
  texts: string[] = [];
  measure = approxMeasure;
  rect(...args: unknown[]) {this.calls.push({ op: "rect", args });}
  polyline(...args: unknown[]) {this.calls.push({ op: "polyline", args });}
  circle(...args: unknown[]) {this.calls.push({ op: "circle", args });}
  text(value: string, ...args: unknown[]) {this.texts.push(value); this.calls.push({ op: "text", args: [value, ...args] });}
  image(...args: unknown[]) {this.calls.push({ op: "image", args });}
  clip(_r: Rect, draw: () => void) {this.calls.push({ op: "clip", args: [] }); draw();}
}

function pageContent(L: ReturnType<typeof computeLayout>): PageContent {
  const css = frameCssSize(L.map);
  const un = (x: number, y: number): [number, number] => [8 + x * 0.001, 62 - y * 0.0005];
  return {
    title: "Jotunheimen",
    subtitle: "Summer trails",
    legend: [{ label: "Trails", color: "#d00", kind: "line" }, { label: "Huts", color: "#00d", kind: "point" }],
    attribution: "© Kartverket",
    date: "2026-11-17",
    mapImage: null,
    frameCss: css,
    bearing: 15,
    metresPerMm: 25,
    ticks: frameTicks(un, css[0], css[1], "latlon"),
    gridLines: [[[0, 0], [100, 100]]],
    overviewExtent: [[8, 61], [9, 61], [9, 62], [8, 62]],
  };
}

describe("drawing a page", () => {
  it("draws every part through the painter", () => {
    const L = computeLayout(paperSizeMm("A4", "landscape"), content({ grid: "latlon", overview: true, notes: "Note text", subtitle: "Summer trails" }));
    const p = new RecordingPainter();
    drawPage(p, L, pageContent(L));
    expect(p.texts).toEqual(expect.arrayContaining(["Jotunheimen", "Summer trails", "Legend", "Trails", "Huts", "N", "500 m", "1:25 000", "Lat/lon grid 10' (WGS 84)", "Note text", "Decho Studio · 2026-11-17"]));
    expect(p.texts.some((t) => t.includes("© Kartverket"))).toBe(true);
    expect(p.texts.some((t) => /°\d\d'E$/.test(t))).toBe(true);
    expect(p.calls.filter((c) => c.op === "clip").length).toBe(2); // grid lines, overview extent
  });

  it("writes a real PDF with jsPDF", async () => {
    const { jsPDF, GState } = await import("jspdf");
    const L = computeLayout(paperSizeMm("A4", "portrait"), content({ grid: "latlon", overview: true }));
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [L.width, L.height], compress: false });
    drawPage(pdfPainter(doc, GState as never), L, pageContent(L));
    const pdf = doc.output();
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("(Jotunheimen) Tj");
    expect(pdf).toContain("(Legend) Tj");
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
