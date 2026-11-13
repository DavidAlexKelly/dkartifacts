/**
 * Project → MapLibre style. The map is never edited directly: every change
 * rebuilds the style from the project and MapLibre's own style diff applies
 * only what changed (setStyle(style, { diff: true })).
 *
 * Layer ids are `${node.id}::${part}`, so a click on the map can always be
 * traced back to the project layer it came from (see layerIdOf).
 */
import { layers as protomapsLayers, namedFlavor } from "@protomaps/basemaps";
import type { FeatureCollection } from "geojson";
import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { CatalogEntry } from "../data/library";
import type { LayerManifest } from "../data/manifest";
import type { CatalogLayerNode, Project, VectorLayerNode } from "../project/types";

export const OVERLAY = "__overlay";

export interface StyleContext {
  entries: Map<string, CatalogEntry>;
  manifests: Map<string, LayerManifest>;
  glyphs: boolean;
  overlay: FeatureCollection;
  selection: { layerId: string; featureIds: string[] } | null;
  background: string;
}

export function layerIdOf(styleLayerId: string): string | null {
  const i = styleLayerId.indexOf("::");
  return i < 0 ? null : styleLayerId.slice(0, i);
}

type Kind = "basemap" | "contours" | "vector-tiles" | "raster-dem" | "raster" | "dem-cells" | "other";

export function catalogKind(entry: CatalogEntry | undefined, m?: LayerManifest): Kind {
  const kind = m?.kind ?? entry?.kind;
  const enc = (m?.encoding ?? entry?.encoding ?? {}) as Record<string, unknown>;
  if (kind === "vector-tiles") {
    if (enc.schema === "protomaps") {return "basemap";}
    if (enc.sourceLayer === "contours" || enc.elevationProperty) {return "contours";}
    return "vector-tiles";
  }
  if (kind === "raster-dem" || kind === "raster" || kind === "dem-cells") {return kind;}
  return "other";
}

function zoomRange(m: LayerManifest) {
  const ls = m.layers ?? [];
  return { minzoom: Math.min(...ls.map((l) => l.minZoom)), maxzoom: Math.max(...ls.map((l) => l.maxZoom)) };
}

function tileSource(node: CatalogLayerNode, m: LayerManifest, type: "vector" | "raster" | "raster-dem"): SourceSpecification {
  const { minzoom, maxzoom } = zoomRange(m);
  const enc = (m.encoding ?? {}) as Record<string, unknown>;
  const base = {
    tiles: [`decho://${encodeURIComponent(node.catalogId)}/{z}/{x}/{y}`],
    minzoom,
    maxzoom,
    attribution: m.attribution ?? "",
    ...(m.bounds ? { bounds: m.bounds } : {}),
  };
  if (type === "raster-dem") {
    return { type, ...base, tileSize: Number(enc.tileSize ?? 256), encoding: (enc.rasterDem as "terrarium") ?? "terrarium" };
  }
  if (type === "raster") {return { type, ...base, tileSize: Number(enc.tileSize ?? 256) };}
  return { type, ...base };
}

function demCellsGeoJson(m: LayerManifest): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (m.cells ?? [])
      .filter((c) => c.bounds)
      .map((c) => {
        const b = c.bounds!;
        return {
          type: "Feature",
          properties: { cell: `c${String(c.col).padStart(3, "0")}_r${String(c.row).padStart(3, "0")}`, min: c.min, max: c.max, MB: c.bytes ? +(c.bytes / 1e6).toFixed(1) : null },
          geometry: {
            type: "Polygon",
            coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]],
          },
        };
      }),
  };
}

function catalogLayers(node: CatalogLayerNode, ctx: StyleContext, sources: Record<string, SourceSpecification>, out: LayerSpecification[], style: Partial<StyleSpecification>) {
  const m = ctx.manifests.get(node.catalogId);
  const entry = ctx.entries.get(node.catalogId);
  if (!m) {return;}
  const vis = node.visible ? "visible" : "none";
  const o = node.options;
  const id = (part: string) => `${node.id}::${part}`;

  switch (catalogKind(entry, m)) {
    case "basemap": {
      sources[id("src")] = tileSource(node, m, "vector");
      const flavor = namedFlavor(o.flavor ?? "light");
      for (const l of protomapsLayers(id("src"), flavor, { lang: "en" }) as LayerSpecification[]) {
        if (l.type === "symbol" && (!ctx.glyphs || o.labels === false)) {continue;}
        if (l.type === "background") {continue;} // the studio draws its own
        const layer = { ...l, id: id(l.id), layout: { ...(l.layout ?? {}), visibility: vis } } as LayerSpecification;
        scaleOpacity(layer, node.opacity);
        out.push(layer);
      }
      if (ctx.glyphs) {style.sprite = `decho-sprite://${o.flavor ?? "light"}`;}
      return;
    }
    case "contours": {
      sources[id("src")] = tileSource(node, m, "vector");
      const enc = (m.encoding ?? {}) as Record<string, string>;
      const sl = enc.sourceLayer ?? "contours";
      const elev = enc.elevationProperty ?? "ELEV";
      const isIndex: ExpressionSpecification = ["==", ["get", enc.indexProperty ?? "index"], true];
      const color = o.color ?? "#8a5a2b";
      out.push({
        id: id("lines"), type: "line", source: id("src"), "source-layer": sl,
        layout: { visibility: vis, "line-join": "round" },
        paint: {
          "line-color": color,
          "line-opacity": ["case", isIndex, 0.9 * node.opacity, 0.55 * node.opacity],
          "line-width": ["case", isIndex, (o.width ?? 1) * 1.6, (o.width ?? 1) * 0.7],
        },
      });
      if (ctx.glyphs && o.labels !== false) {
        out.push({
          id: id("labels"), type: "symbol", source: id("src"), "source-layer": sl, filter: isIndex, minzoom: 11,
          layout: {
            visibility: vis, "symbol-placement": "line", "text-field": ["concat", ["to-string", ["get", elev]], " m"],
            "text-font": ["Noto Sans Regular"], "text-size": 10,
          },
          paint: { "text-color": color, "text-halo-color": "rgba(255,255,255,0.8)", "text-halo-width": 1.2, "text-opacity": node.opacity },
        });
      }
      return;
    }
    case "vector-tiles": {
      sources[id("src")] = tileSource(node, m, "vector");
      const sl = String((m.encoding ?? {}).sourceLayer ?? m.id);
      out.push({ id: id("lines"), type: "line", source: id("src"), "source-layer": sl, layout: { visibility: vis }, paint: { "line-color": o.color ?? "#555", "line-opacity": node.opacity } });
      return;
    }
    case "raster-dem": {
      if (o.hillshade !== false) {
        sources[id("hs")] = tileSource(node, m, "raster-dem");
        out.push({
          id: id("hillshade"), type: "hillshade", source: id("hs"), layout: { visibility: vis },
          paint: {
            "hillshade-exaggeration": Math.min(1, 0.5 * node.opacity + 0.1),
            "hillshade-shadow-color": "#3d3d3d",
            "hillshade-highlight-color": "#ffffff",
            "hillshade-accent-color": "#5a5a5a",
          },
        });
      }
      if (o.terrain3d && node.visible) {
        sources[id("dem")] = tileSource(node, m, "raster-dem");
        style.terrain = { source: id("dem"), exaggeration: o.exaggeration ?? 1.5 };
      }
      return;
    }
    case "raster": {
      sources[id("src")] = tileSource(node, m, "raster");
      out.push({ id: id("raster"), type: "raster", source: id("src"), layout: { visibility: vis }, paint: { "raster-opacity": node.opacity } });
      return;
    }
    case "dem-cells": {
      sources[id("src")] = { type: "geojson", data: demCellsGeoJson(m) };
      out.push({ id: id("fill"), type: "fill", source: id("src"), layout: { visibility: vis }, paint: { "fill-color": "#4363d8", "fill-opacity": 0.06 * node.opacity } });
      out.push({ id: id("outline"), type: "line", source: id("src"), layout: { visibility: vis }, paint: { "line-color": "#4363d8", "line-width": 1, "line-dasharray": [3, 2], "line-opacity": node.opacity } });
      return;
    }
    default:
      return;
  }
}

function scaleOpacity(layer: LayerSpecification, k: number) {
  if (k >= 1) {return;}
  const paint = (layer as { paint?: Record<string, unknown> }).paint ?? {};
  const key = { fill: "fill-opacity", line: "line-opacity", symbol: "text-opacity", circle: "circle-opacity", "fill-extrusion": "fill-extrusion-opacity", raster: "raster-opacity" }[layer.type as string];
  if (!key) {return;}
  const current = paint[key];
  paint[key] = typeof current === "number" ? current * k : current === undefined ? k : ["*", k, current];
  (layer as { paint?: Record<string, unknown> }).paint = paint;
}

export function colorExpression(node: VectorLayerNode): ExpressionSpecification | string {
  const c = node.style.categorize;
  if (!c || Object.keys(c.colors).length === 0) {return node.style.color;}
  const pairs = Object.entries(c.colors).flatMap(([k, v]) => [k, v]);
  return ["match", ["to-string", ["get", c.field]], ...pairs, node.style.color] as unknown as ExpressionSpecification;
}

const isPolygon: ExpressionSpecification = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const isLine: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const isPoint: ExpressionSpecification = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];

function vectorLayers(node: VectorLayerNode, ctx: StyleContext, sources: Record<string, SourceSpecification>, out: LayerSpecification[]) {
  const src = `${node.id}::src`;
  sources[src] = {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: node.data.features.map((f) => ({ ...f, properties: { ...f.properties, __fid: f.id } })),
    },
  };
  const vis = node.visible ? "visible" : "none";
  const s = node.style;
  const color = colorExpression(node);
  const op = node.opacity;
  out.push(
    { id: `${node.id}::fill`, type: "fill", source: src, filter: isPolygon, layout: { visibility: vis }, paint: { "fill-color": color, "fill-opacity": s.fillOpacity * op } },
    { id: `${node.id}::outline`, type: "line", source: src, filter: isPolygon, layout: { visibility: vis, "line-join": "round" }, paint: { "line-color": s.categorize ? color : s.strokeColor, "line-width": s.strokeWidth, "line-opacity": op } },
    { id: `${node.id}::line`, type: "line", source: src, filter: isLine, layout: { visibility: vis, "line-join": "round", "line-cap": "round" }, paint: { "line-color": color, "line-width": s.strokeWidth, "line-opacity": op } },
    { id: `${node.id}::point`, type: "circle", source: src, filter: isPoint, layout: { visibility: vis }, paint: { "circle-color": color, "circle-radius": s.radius, "circle-opacity": op, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5, "circle-stroke-opacity": op } },
  );
  if (s.labelField && ctx.glyphs) {
    out.push({
      id: `${node.id}::label`, type: "symbol", source: src,
      layout: {
        visibility: vis, "text-field": ["to-string", ["get", s.labelField]], "text-font": ["Noto Sans Regular"],
        "text-size": s.labelSize, "text-offset": [0, 1.2], "text-anchor": "top", "symbol-placement": "point",
      },
      paint: { "text-color": "#222", "text-halo-color": "#fff", "text-halo-width": 1.5, "text-opacity": op },
    });
  }
  if (ctx.selection?.layerId === node.id && ctx.selection.featureIds.length) {
    const sel: ExpressionSpecification = ["in", ["get", "__fid"], ["literal", ctx.selection.featureIds]];
    out.push(
      { id: `${node.id}::sel-fill`, type: "fill", source: src, filter: ["all", isPolygon, sel], paint: { "fill-color": "#ffd400", "fill-opacity": 0.35 } },
      { id: `${node.id}::sel-line`, type: "line", source: src, filter: ["all", ["!", isPoint], sel], paint: { "line-color": "#ffd400", "line-width": s.strokeWidth + 3 } },
      { id: `${node.id}::sel-point`, type: "circle", source: src, filter: ["all", isPoint, sel], paint: { "circle-color": "#ffd400", "circle-radius": s.radius + 3, "circle-stroke-color": "#000", "circle-stroke-width": 1 } },
    );
  }
}

function overlayLayers(ctx: StyleContext, sources: Record<string, SourceSpecification>, out: LayerSpecification[]) {
  sources[OVERLAY] = { type: "geojson", data: ctx.overlay };
  const role = (r: string): ExpressionSpecification => ["==", ["get", "role"], r];
  out.push(
    { id: `${OVERLAY}::fill`, type: "fill", source: OVERLAY, filter: ["all", isPolygon, ["!=", ["get", "role"], "handle"]], paint: { "fill-color": "#ff5a00", "fill-opacity": 0.15 } },
    { id: `${OVERLAY}::line`, type: "line", source: OVERLAY, filter: ["!", isPoint], paint: { "line-color": "#ff5a00", "line-width": 2.5, "line-dasharray": [2, 1] } },
    { id: `${OVERLAY}::vertex`, type: "circle", source: OVERLAY, filter: role("vertex"), paint: { "circle-color": "#ff5a00", "circle-radius": 4, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } },
    { id: `${OVERLAY}::mid`, type: "circle", source: OVERLAY, filter: role("mid"), paint: { "circle-color": "#ffffff", "circle-radius": 3.5, "circle-stroke-color": "#ff5a00", "circle-stroke-width": 1.5 } },
    { id: `${OVERLAY}::handle`, type: "circle", source: OVERLAY, filter: role("handle"), paint: { "circle-color": "#ffffff", "circle-radius": 5.5, "circle-stroke-color": "#ff5a00", "circle-stroke-width": 2 } },
    { id: `${OVERLAY}::snap`, type: "circle", source: OVERLAY, filter: role("snap"), paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": 9, "circle-stroke-color": "#00a0ff", "circle-stroke-width": 2 } },
  );
}

export function buildStyle(project: Project, ctx: StyleContext): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {};
  const layers: LayerSpecification[] = [
    { id: "__background", type: "background", paint: { "background-color": ctx.background } },
  ];
  const extra: Partial<StyleSpecification> = {};
  for (const node of project.layers) {
    if (node.kind === "catalog") {catalogLayers(node, ctx, sources, layers, extra);}
    else {vectorLayers(node, ctx, sources, layers);}
  }
  overlayLayers(ctx, sources, layers);
  return {
    version: 8,
    ...(ctx.glyphs ? { glyphs: "decho-glyphs://{fontstack}/{range}.pbf" } : {}),
    ...(extra.sprite ? { sprite: extra.sprite } : {}),
    ...(extra.terrain ? { terrain: extra.terrain } : {}),
    projection: { type: project.globe ? "globe" : "mercator" },
    sources,
    layers,
  };
}
