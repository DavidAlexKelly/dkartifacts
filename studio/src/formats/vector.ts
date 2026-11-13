/**
 * Vector data in and out: GeoJSON, CSV (lat/lon columns or a WKT column),
 * KML and GPX. Everything is parsed into features with stable string ids,
 * which is what selection, editing and the attribute table key on.
 */
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { newId, type StudioFeature } from "../project/types";

export interface Imported {
  title: string;
  features: StudioFeature[];
  fields: string[];
  skipped: number;
}

function withIds(features: Array<Feature<Geometry | null>>): { features: StudioFeature[]; skipped: number } {
  let skipped = 0;
  const out: StudioFeature[] = [];
  for (const f of features) {
    if (!f.geometry) {
      skipped++;
      continue;
    }
    out.push({
      type: "Feature",
      id: f.id !== undefined && f.id !== null ? String(f.id) : newId("f"),
      geometry: f.geometry,
      properties: { ...(f.properties ?? {}) },
    });
  }
  // Ids must be unique within a layer even when the source repeats them.
  const seen = new Set<string>();
  for (const f of out) {
    if (seen.has(f.id)) {f.id = newId("f");}
    seen.add(f.id);
  }
  return { features: out, skipped };
}

function fieldsFrom(features: StudioFeature[]): string[] {
  const seen = new Set<string>();
  for (const f of features) {for (const k of Object.keys(f.properties)) {seen.add(k);}}
  return [...seen];
}

// ── GeoJSON ────────────────────────────────────────────────────────────────

export function parseGeoJson(text: string): Omit<Imported, "title"> {
  const raw = JSON.parse(text) as FeatureCollection | Feature | Geometry;
  let features: Array<Feature<Geometry | null>>;
  if (raw.type === "FeatureCollection") {features = raw.features;}
  else if (raw.type === "Feature") {features = [raw];}
  else if ("coordinates" in raw || raw.type === "GeometryCollection") {features = [{ type: "Feature", geometry: raw, properties: {} }];}
  else {throw new Error("Not GeoJSON: expected a FeatureCollection, Feature or Geometry");}
  const r = withIds(features);
  return { ...r, fields: fieldsFrom(r.features) };
}

// ── CSV ────────────────────────────────────────────────────────────────────

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const delimiter = detectDelimiter(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {quoted = false;}
      else {field += c;}
    } else if (c === '"') {quoted = true;}
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") {i++;}
      row.push(field);
      if (row.some((v) => v !== "")) {rows.push(row);}
      row = [];
      field = "";
    } else {field += c;}
  }
  row.push(field);
  if (row.some((v) => v !== "")) {rows.push(row);}
  return rows;
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t", "|"].map((d) => [d, first.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

const LAT_NAMES = ["lat", "latitude", "y", "lat_dd", "decimallatitude"];
const LON_NAMES = ["lon", "lng", "long", "longitude", "x", "lon_dd", "decimallongitude"];
const WKT_NAMES = ["wkt", "geometry", "geom", "the_geom", "shape"];

function value(v: string): unknown {
  if (v === "") {return null;}
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(v.trim())) {return Number(v);}
  if (/^(true|false)$/i.test(v)) {return v.toLowerCase() === "true";}
  return v;
}

export function parseCsv(text: string): Omit<Imported, "title"> {
  const rows = parseCsvRows(text.replace(/^﻿/, ""));
  if (rows.length < 2) {throw new Error("CSV has no data rows");}
  const header = rows[0].map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());
  const latI = lower.findIndex((h) => LAT_NAMES.includes(h));
  const lonI = lower.findIndex((h) => LON_NAMES.includes(h));
  const wktI = lower.findIndex((h) => WKT_NAMES.includes(h));
  if (wktI < 0 && (latI < 0 || lonI < 0)) {
    throw new Error(`No location columns. Name them lat/lon (or latitude/longitude, x/y), or give a WKT column. Found: ${header.join(", ")}`);
  }
  const features: Array<Feature<Geometry | null>> = rows.slice(1).map((r) => {
    const properties: Record<string, unknown> = {};
    header.forEach((h, i) => {
      if (i !== latI && i !== lonI && i !== wktI) {properties[h] = value(r[i] ?? "");}
    });
    let geometry: Geometry | null = null;
    if (wktI >= 0 && r[wktI]) {geometry = parseWkt(r[wktI]);}
    else if (latI >= 0 && lonI >= 0) {
      const lat = Number(r[latI]);
      const lon = Number(r[lonI]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && r[latI] !== "" && r[lonI] !== "") {
        geometry = { type: "Point", coordinates: [lon, lat] };
      }
    }
    return { type: "Feature", geometry, properties };
  });
  const res = withIds(features);
  return { ...res, fields: header.filter((_, i) => i !== latI && i !== lonI && i !== wktI) };
}

// ── WKT ────────────────────────────────────────────────────────────────────

export function parseWkt(text: string): Geometry | null {
  const t = text.trim();
  const m = /^(\w+)\s*(Z|M|ZM)?\s*\((.*)\)$/is.exec(t);
  if (!m) {return null;}
  const type = m[1].toUpperCase();
  const body = m[3];
  const pos = (s: string): Position => s.trim().split(/\s+/).slice(0, 2).map(Number);
  const list = (s: string): Position[] => s.split(",").map((p) => pos(p.replace(/[()]/g, "")));
  const groups = (s: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") {if (depth++ === 0) {start = i + 1;}}
      else if (s[i] === ")") {if (--depth === 0) {out.push(s.slice(start, i));}}
    }
    return out;
  };
  switch (type) {
    case "POINT": return { type: "Point", coordinates: pos(body) };
    case "LINESTRING": return { type: "LineString", coordinates: list(body) };
    case "POLYGON": return { type: "Polygon", coordinates: groups(body).map(list) };
    case "MULTIPOINT": return { type: "MultiPoint", coordinates: list(body) };
    case "MULTILINESTRING": return { type: "MultiLineString", coordinates: groups(body).map(list) };
    case "MULTIPOLYGON": return { type: "MultiPolygon", coordinates: groups(body).map((p) => groups(p).map(list)) };
    default: return null;
  }
}

export function toWkt(g: Geometry): string {
  const p = (c: Position) => `${c[0]} ${c[1]}`;
  const l = (cs: Position[]) => `(${cs.map(p).join(", ")})`;
  switch (g.type) {
    case "Point": return `POINT (${p(g.coordinates)})`;
    case "LineString": return `LINESTRING ${l(g.coordinates)}`;
    case "Polygon": return `POLYGON (${g.coordinates.map(l).join(", ")})`;
    case "MultiPoint": return `MULTIPOINT ${l(g.coordinates)}`;
    case "MultiLineString": return `MULTILINESTRING (${g.coordinates.map(l).join(", ")})`;
    case "MultiPolygon": return `MULTIPOLYGON (${g.coordinates.map((poly) => `(${poly.map(l).join(", ")})`).join(", ")})`;
    case "GeometryCollection": return `GEOMETRYCOLLECTION (${g.geometries.map(toWkt).join(", ")})`;
  }
}

// ── KML and GPX ────────────────────────────────────────────────────────────

function kmlCoords(el: Element | null): Position[] {
  return (el?.textContent ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.split(",").slice(0, 2).map(Number));
}

function kmlGeometries(el: Element): Geometry[] {
  const out: Geometry[] = [];
  for (const child of Array.from(el.children)) {
    switch (child.localName) {
      case "Point": out.push({ type: "Point", coordinates: kmlCoords(child.querySelector("coordinates"))[0] }); break;
      case "LineString": out.push({ type: "LineString", coordinates: kmlCoords(child.querySelector("coordinates")) }); break;
      case "Polygon": {
        const outer = kmlCoords(child.querySelector("outerBoundaryIs coordinates"));
        const inner = Array.from(child.querySelectorAll("innerBoundaryIs coordinates")).map(kmlCoords);
        out.push({ type: "Polygon", coordinates: [outer, ...inner] });
        break;
      }
      case "MultiGeometry": out.push(...kmlGeometries(child)); break;
    }
  }
  return out;
}

export function parseKml(text: string): Omit<Imported, "title"> {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {throw new Error("Not valid KML (XML parse error)");}
  const features: Array<Feature<Geometry | null>> = [];
  for (const pm of Array.from(doc.getElementsByTagName("Placemark"))) {
    const properties: Record<string, unknown> = {};
    const name = pm.getElementsByTagName("name")[0]?.textContent;
    const desc = pm.getElementsByTagName("description")[0]?.textContent;
    if (name) {properties.name = name;}
    if (desc) {properties.description = desc;}
    for (const d of Array.from(pm.getElementsByTagName("Data"))) {
      properties[d.getAttribute("name") ?? "field"] = value(d.getElementsByTagName("value")[0]?.textContent ?? "");
    }
    for (const sd of Array.from(pm.getElementsByTagName("SimpleData"))) {
      properties[sd.getAttribute("name") ?? "field"] = value(sd.textContent ?? "");
    }
    const geoms = kmlGeometries(pm);
    if (geoms.length === 0) {features.push({ type: "Feature", geometry: null, properties });}
    for (const g of geoms) {features.push({ type: "Feature", geometry: g, properties: { ...properties } });}
  }
  const r = withIds(features);
  return { ...r, fields: fieldsFrom(r.features) };
}

export function parseGpx(text: string): Omit<Imported, "title"> {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {throw new Error("Not valid GPX (XML parse error)");}
  const pt = (el: Element): Position => [Number(el.getAttribute("lon")), Number(el.getAttribute("lat"))];
  const props = (el: Element, kind: string) => ({
    kind,
    name: el.getElementsByTagName("name")[0]?.textContent ?? null,
  });
  const features: Array<Feature<Geometry | null>> = [];
  for (const w of Array.from(doc.getElementsByTagName("wpt"))) {
    const ele = w.getElementsByTagName("ele")[0]?.textContent;
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: pt(w) }, properties: { ...props(w, "waypoint"), ele: ele ? Number(ele) : null } });
  }
  for (const r of Array.from(doc.getElementsByTagName("rte"))) {
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: Array.from(r.getElementsByTagName("rtept")).map(pt) }, properties: props(r, "route") });
  }
  for (const t of Array.from(doc.getElementsByTagName("trk"))) {
    const segs = Array.from(t.getElementsByTagName("trkseg")).map((s) => Array.from(s.getElementsByTagName("trkpt")).map(pt));
    features.push({ type: "Feature", geometry: segs.length === 1 ? { type: "LineString", coordinates: segs[0] } : { type: "MultiLineString", coordinates: segs }, properties: props(t, "track") });
  }
  const r = withIds(features);
  return { ...r, fields: fieldsFrom(r.features) };
}

export function importFile(name: string, text: string): Imported {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const title = name.replace(/\.[^.]+$/, "");
  const parsed =
    ext === "csv" || ext === "tsv" || ext === "txt" ? parseCsv(text)
      : ext === "kml" ? parseKml(text)
        : ext === "gpx" ? parseGpx(text)
          : parseGeoJson(text);
  return { title, ...parsed };
}

// ── Export ─────────────────────────────────────────────────────────────────

export function toGeoJson(features: StudioFeature[]): string {
  return JSON.stringify({ type: "FeatureCollection", features }, null, 1);
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(features: StudioFeature[], fields: string[]): string {
  const header = ["id", ...fields, "wkt"];
  const lines = features.map((f) => [f.id, ...fields.map((k) => f.properties[k]), toWkt(f.geometry)].map(csvCell).join(","));
  return [header.map(csvCell).join(","), ...lines].join("\n");
}

const xml = (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

function kmlGeometry(g: Geometry): string {
  const cs = (c: Position[]) => `<coordinates>${c.map((p) => `${p[0]},${p[1]}`).join(" ")}</coordinates>`;
  switch (g.type) {
    case "Point": return `<Point>${cs([g.coordinates])}</Point>`;
    case "LineString": return `<LineString>${cs(g.coordinates)}</LineString>`;
    case "Polygon":
      return `<Polygon><outerBoundaryIs><LinearRing>${cs(g.coordinates[0])}</LinearRing></outerBoundaryIs>${g.coordinates
        .slice(1).map((r) => `<innerBoundaryIs><LinearRing>${cs(r)}</LinearRing></innerBoundaryIs>`).join("")}</Polygon>`;
    case "MultiPoint": return `<MultiGeometry>${g.coordinates.map((c) => kmlGeometry({ type: "Point", coordinates: c })).join("")}</MultiGeometry>`;
    case "MultiLineString": return `<MultiGeometry>${g.coordinates.map((c) => kmlGeometry({ type: "LineString", coordinates: c })).join("")}</MultiGeometry>`;
    case "MultiPolygon": return `<MultiGeometry>${g.coordinates.map((c) => kmlGeometry({ type: "Polygon", coordinates: c })).join("")}</MultiGeometry>`;
    case "GeometryCollection": return `<MultiGeometry>${g.geometries.map(kmlGeometry).join("")}</MultiGeometry>`;
  }
}

export function toKml(title: string, features: StudioFeature[], fields: string[], nameField?: string | null): string {
  const placemarks = features.map((f) => {
    const name = nameField ? f.properties[nameField] : f.properties.name ?? f.id;
    const data = fields.map((k) => `<Data name="${xml(k)}"><value>${xml(f.properties[k])}</value></Data>`).join("");
    return `<Placemark><name>${xml(name)}</name><ExtendedData>${data}</ExtendedData>${kmlGeometry(f.geometry)}</Placemark>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(title)}</name>${placemarks.join("\n")}</Document></kml>\n`;
}

export function download(name: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(title: string): string {
  return title.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "layer";
}
