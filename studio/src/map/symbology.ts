/**
 * Symbology: how a vector layer's features look, computed per feature.
 *
 * Every mode resolves, in JavaScript, to plain properties on each feature —
 * `__c` colour, `__r` point radius, `__w` line width, `__i` icon, `__h`
 * extrusion height, `__k` heat weight — which the style then reads with
 * ["get", …]. That keeps MapLibre's styles simple and lets graduated
 * classes and rules use the studio's whole expression language, which
 * MapLibre's own expressions could not evaluate.
 */
import { classify, classOf, colorRamp, type ClassifyMethod, type RampName } from "../analysis/classify";
import { compile, toNumber, truthy } from "../analysis/expression";
import { PALETTE, type StudioFeature, type VectorLayerNode, type VectorStyle } from "../project/types";

export type StyleMode = "single" | "categorized" | "graduated" | "rules" | "heatmap";
export type Marker = "circle" | "square" | "triangle" | "star" | "cross" | "milsymbol";

export interface Graduated {
  field: string;
  method: ClassifyMethod;
  classes: number;
  ramp: RampName;
  breaks: number[];
  colors: string[];
}

export interface Rule {
  expr: string;
  color: string;
  label: string;
}

export interface LegendEntry {
  label: string;
  color: string;
}

export function modeOf(s: VectorStyle): StyleMode {
  return s.mode ?? (s.categorize ? "categorized" : "single");
}

/** Compute class breaks and colours for a graduated style from the data. */
export function buildGraduated(features: StudioFeature[], field: string, method: ClassifyMethod, classes: number, ramp: RampName): Graduated {
  const values = features.map((f) => toNumber(f.properties[field])).filter((v): v is number => v !== null && Number.isFinite(v));
  const breaks = classify(values, method, classes);
  return { field, method, classes, ramp, breaks, colors: colorRamp(ramp, Math.max(1, breaks.length)) };
}

/** Distinct values of a field, each given a palette colour. */
export function buildCategories(features: StudioFeature[], field: string, max = 40): Record<string, string> {
  const values = [...new Set(features.map((f) => String(f.properties[field] ?? "")))].slice(0, max);
  return Object.fromEntries(values.map((v, i) => [v, PALETTE[i % PALETTE.length]]));
}

const OTHER = "#9e9e9e";

/** The features with their computed style properties, ready for a GeoJSON source. */
export function decorate(node: VectorLayerNode, features: StudioFeature[]): StudioFeature[] {
  const s = node.style;
  const mode = modeOf(s);
  const rules = mode === "rules" ? (s.rules ?? []).map((r) => {
    try {
      return { ...r, test: compile(r.expr) };
    } catch {
      return null;
    }
  }) : [];
  const sizeField = s.size?.field;
  let sizeMin = Infinity, sizeMax = -Infinity;
  if (sizeField) {
    for (const f of features) {
      const v = toNumber(f.properties[sizeField]);
      if (v !== null && Number.isFinite(v)) {sizeMin = Math.min(sizeMin, v); sizeMax = Math.max(sizeMax, v);}
    }
  }
  const heatField = s.heatmap?.weightField;
  let heatMax = 0;
  if (heatField) {for (const f of features) {heatMax = Math.max(heatMax, Math.abs(toNumber(f.properties[heatField]) ?? 0));}}

  return features.map((f) => {
    let color = s.color;
    if (mode === "categorized" && s.categorize) {
      color = s.categorize.colors[String(f.properties[s.categorize.field] ?? "")] ?? s.color;
    } else if (mode === "graduated" && s.graduated) {
      const v = toNumber(f.properties[s.graduated.field]);
      const k = v === null ? -1 : classOf(v, s.graduated.breaks);
      color = k >= 0 ? s.graduated.colors[k] ?? OTHER : OTHER;
    } else if (mode === "rules") {
      const hit = rules.find((r) => {
        if (!r) {return false;}
        try {
          return truthy(r.test.evaluate(f));
        } catch {
          return false;
        }
      });
      color = hit ? hit.color : s.rulesElse === false ? "rgba(0,0,0,0)" : OTHER;
    }
    let scale = 1;
    if (sizeField && sizeMax > sizeMin) {
      const v = toNumber(f.properties[sizeField]);
      // Area-true proportional symbols: radius grows with the square root.
      scale = v === null ? 0.3 : Math.sqrt((v - sizeMin) / (sizeMax - sizeMin));
    }
    const radius = sizeField ? (s.size!.min + (s.size!.max - s.size!.min) * scale) : s.radius;
    const width = sizeField ? Math.max(0.5, (s.size!.min + (s.size!.max - s.size!.min) * scale) / 3) : s.strokeWidth;
    const marker = s.marker ?? "circle";
    const sidc = marker === "milsymbol" && s.sidcField ? String(f.properties[s.sidcField] ?? "") : "";
    const icon = marker === "circle" ? "" : marker === "milsymbol" ? (sidc ? `sidc:${sidc}:${Math.round(radius * 4)}` : "") : `shape:${marker}:${color}:${Math.round(radius * 2)}`;
    const ext = s.extrude;
    const height = ext ? (ext.field ? (toNumber(f.properties[ext.field]) ?? 0) * ext.scale : ext.height) : 0;
    const heat = heatField ? (heatMax ? Math.abs(toNumber(f.properties[heatField]) ?? 0) / heatMax : 0) : 1;
    return { ...f, properties: { ...f.properties, __fid: f.id, __c: color, __r: radius, __w: width, __i: icon, __h: height, __k: heat } };
  });
}

/** What the layer's legend shows, for the layer panel and printed maps. */
export function legendFor(node: VectorLayerNode): LegendEntry[] {
  const s = node.style;
  switch (modeOf(s)) {
    case "categorized":
      return s.categorize ? Object.entries(s.categorize.colors).map(([v, c]) => ({ label: v === "" ? "(empty)" : v, color: c })) : [];
    case "graduated": {
      const g = s.graduated;
      if (!g || !g.breaks.length) {return [];}
      const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : +n.toPrecision(3));
      return g.breaks.map((b, i) => ({ label: `${i === 0 ? "≤" : `${fmt(g.breaks[i - 1])} –`} ${fmt(b)}`, color: g.colors[i] }));
    }
    case "rules":
      return (s.rules ?? []).map((r) => ({ label: r.label || r.expr, color: r.color })).concat(s.rulesElse === false ? [] : [{ label: "everything else", color: OTHER }]);
    default:
      return [];
  }
}

// ── Marker images ──────────────────────────────────────────────────────────

/** Draw a marker image for an icon id written by decorate(); null if it isn't one of ours. */
export async function markerImage(id: string): Promise<{ width: number; height: number; data: Uint8ClampedArray; pixelRatio: number } | null> {
  const ratio = 2;
  if (id.startsWith("shape:")) {
    const [, shape, color, sizeText] = id.split(":");
    const size = Math.max(6, Number(sizeText) || 12);
    const px = Math.ceil(size * ratio) + 4;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) {return null;}
    const c = px / 2, r = (size * ratio) / 2;
    ctx.beginPath();
    if (shape === "square") {ctx.rect(c - r * 0.85, c - r * 0.85, r * 1.7, r * 1.7);}
    else if (shape === "triangle") {ctx.moveTo(c, c - r); ctx.lineTo(c + r * 0.9, c + r * 0.7); ctx.lineTo(c - r * 0.9, c + r * 0.7); ctx.closePath();}
    else if (shape === "star") {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      ctx.closePath();
    } else if (shape === "cross") {
      const t = r * 0.32;
      ctx.rect(c - t, c - r, 2 * t, 2 * r);
      ctx.rect(c - r, c - t, 2 * r, 2 * t);
    } else {ctx.arc(c, c, r, 0, Math.PI * 2);}
    ctx.fillStyle = color;
    ctx.fill("nonzero");
    ctx.lineWidth = 1.5 * ratio;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    const img = ctx.getImageData(0, 0, px, px);
    return { width: px, height: px, data: img.data, pixelRatio: ratio };
  }
  if (id.startsWith("sidc:")) {
    const [, sidc, sizeText] = id.split(":");
    const ms = await import("milsymbol");
    const sym = new ms.default.Symbol(sidc, { size: Math.max(16, Number(sizeText) || 30) * ratio / 2 });
    if (!sym.isValid()) {return null;}
    const canvas = sym.asCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) {return null;}
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: img.data, pixelRatio: ratio };
  }
  return null;
}
