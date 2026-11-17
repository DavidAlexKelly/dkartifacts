/**
 * ESRI shapefiles: read a set of sidecar files (.shp + .dbf, optionally
 * .shx, .prj, .cpg) into layers reprojected to WGS84, and write features as
 * a zipped set, one shapefile per geometry family.
 */
import type { Geometry, Position } from "geojson";
import { newId, type StudioFeature } from "../project/types";
import { defFromPrj, guessCrsFromCoords, reprojectFeatures, type ImportedWithCrs } from "./crs";
import { writeZip } from "./zip";

// ── Reading ────────────────────────────────────────────────────────────────

function ringArea2(ring: Position[]): number {
  // Shoelace; positive for clockwise rings in a y-up system.
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {s += (ring[i][0] - ring[j][0]) * (ring[i][1] + ring[j][1]);}
  return s;
}

function pointInRing(p: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {inside = !inside;}
  }
  return inside;
}

/** Shapefile rings (outer clockwise, holes counter-clockwise) to GeoJSON polygons (outer CCW, holes CW). */
export function ringsToPolygons(rings: Position[][]): Geometry | null {
  const outers: Position[][][] = [];
  const holes: Position[][] = [];
  for (const r of rings) {
    if (r.length < 4) {continue;}
    if (ringArea2(r) >= 0) {outers.push([r.slice().reverse()]);}
    else {holes.push(r.slice().reverse());}
  }
  if (outers.length === 0) {
    // Wrongly wound data: treat every ring as an outer ring.
    for (const h of holes) {outers.push([h.slice().reverse()]);}
  } else {
    for (const h of holes) {
      const owner = outers.find((o) => pointInRing(h[0], o[0])) ?? outers[0];
      owner.push(h);
    }
  }
  if (outers.length === 0) {return null;}
  return outers.length === 1 ? { type: "Polygon", coordinates: outers[0] } : { type: "MultiPolygon", coordinates: outers };
}

function parseShape(dv: DataView, o: number, len: number): Geometry | null {
  const type = dv.getInt32(o, true);
  if (type === 0) {return null;}
  const hasZ = type === 11 || type === 13 || type === 15 || type === 18;
  const base = type % 10;
  const pt = (p: number): Position => [dv.getFloat64(p, true), dv.getFloat64(p + 8, true)];
  if (base === 1) {
    const c = pt(o + 4);
    if (hasZ && len >= 28) {c.push(dv.getFloat64(o + 20, true));}
    return Number.isFinite(c[0]) && Number.isFinite(c[1]) ? { type: "Point", coordinates: c } : null;
  }
  if (base === 8) {
    const n = dv.getInt32(o + 36, true);
    const pts: Position[] = [];
    for (let i = 0; i < n; i++) {pts.push(pt(o + 40 + i * 16));}
    if (hasZ) {
      const zo = o + 40 + n * 16 + 16;
      if (zo + n * 8 <= o + len) {pts.forEach((p, i) => p.push(dv.getFloat64(zo + i * 8, true)));}
    }
    return n === 0 ? null : n === 1 ? { type: "Point", coordinates: pts[0] } : { type: "MultiPoint", coordinates: pts };
  }
  if (base === 3 || base === 5) {
    const nParts = dv.getInt32(o + 36, true);
    const nPoints = dv.getInt32(o + 40, true);
    const partsAt = o + 44;
    const ptsAt = partsAt + nParts * 4;
    const pts: Position[] = [];
    for (let i = 0; i < nPoints; i++) {pts.push(pt(ptsAt + i * 16));}
    if (hasZ) {
      const zo = ptsAt + nPoints * 16 + 16;
      if (zo + nPoints * 8 <= o + len) {pts.forEach((p, i) => p.push(dv.getFloat64(zo + i * 8, true)));}
    }
    const parts: Position[][] = [];
    for (let i = 0; i < nParts; i++) {
      const s = dv.getInt32(partsAt + i * 4, true);
      const e = i + 1 < nParts ? dv.getInt32(partsAt + (i + 1) * 4, true) : nPoints;
      parts.push(pts.slice(s, e));
    }
    if (base === 3) {
      const lines = parts.filter((p) => p.length >= 2);
      if (lines.length === 0) {return null;}
      return lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines };
    }
    return ringsToPolygons(parts);
  }
  return null; // MultiPatch and unknown types
}

function readShp(bytes: Uint8Array): { geometries: Array<Geometry | null>; shapeType: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 100 || dv.getInt32(0, false) !== 9994) {throw new Error("Not a shapefile (.shp header)");}
  const shapeType = dv.getInt32(32, true);
  const end = Math.min(bytes.length, dv.getInt32(24, false) * 2);
  const geometries: Array<Geometry | null> = [];
  let p = 100;
  while (p + 8 <= end) {
    const len = dv.getInt32(p + 4, false) * 2;
    const o = p + 8;
    if (o + len > bytes.length) {break;}
    geometries.push(len >= 4 ? parseShape(dv, o, len) : null);
    p = o + len;
  }
  return { geometries, shapeType };
}

function encodingFromCpg(cpg: string): string | null {
  const c = cpg.trim().toLowerCase().replace(/^ansi\s*/, "");
  if (!c) {return null;}
  if (/^utf-?8$/.test(c)) {return "utf-8";}
  if (/^\d{3,4}$/.test(c)) {
    if (c.length === 4 && c.startsWith("125")) {return `windows-${c}`;}
    return ({ "936": "gbk", "932": "shift_jis", "949": "euc-kr", "950": "big5", "866": "ibm866", "874": "windows-874" } as Record<string, string>)[c] ?? null;
  }
  const iso = /^(?:iso-?)?8859-?(\d+)$/.exec(c);
  if (iso) {return `iso-8859-${iso[1]}`;}
  return c;
}

function makeDecoder(encoding: string | null): (b: Uint8Array) => string {
  if (encoding) {
    try {
      const d = new TextDecoder(encoding);
      return (b) => d.decode(b);
    } catch {
      // Unknown label: fall back to sniffing below.
    }
  }
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  let latin: TextDecoder;
  try {
    latin = new TextDecoder("windows-1252");
  } catch {
    latin = new TextDecoder("iso-8859-1");
  }
  return (b) => {
    try {
      return utf8.decode(b);
    } catch {
      return latin.decode(b);
    }
  };
}

interface DbfField {
  name: string;
  type: string;
  length: number;
  decimals: number;
}

function readDbf(bytes: Uint8Array, encoding: string | null): { fields: string[]; records: Array<Record<string, unknown>> } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const recordLen = dv.getUint16(10, true);
  const decode = makeDecoder(encoding);
  const fields: DbfField[] = [];
  for (let p = 32; p + 32 <= headerLen && bytes[p] !== 0x0d; p += 32) {
    let e = p;
    while (e < p + 11 && bytes[e] !== 0) {e++;}
    fields.push({
      name: decode(bytes.subarray(p, e)).trim(),
      type: String.fromCharCode(bytes[p + 11]).toUpperCase(),
      length: bytes[p + 16],
      decimals: bytes[p + 17],
    });
  }
  // Repeated names would overwrite each other's values.
  const names: string[] = [];
  for (const f of fields) {
    let name = f.name || "field";
    for (let i = 1; names.includes(name); i++) {name = `${f.name}_${i}`;}
    names.push(name);
  }
  const records: Array<Record<string, unknown>> = [];
  for (let r = 0; r < n; r++) {
    const start = headerLen + r * recordLen;
    if (start + recordLen > bytes.length) {break;}
    const rec: Record<string, unknown> = {};
    let o = start + 1;
    fields.forEach((f, i) => {
      const raw = bytes.subarray(o, o + f.length);
      o += f.length;
      rec[names[i]] = dbfValue(f, raw, decode);
    });
    // Deleted records keep their slot so they stay aligned with .shp records.
    if (bytes[start] === 0x2a) {rec.__deleted = true;}
    records.push(rec);
  }
  return { fields: names, records };
}

function dbfValue(f: DbfField, raw: Uint8Array, decode: (b: Uint8Array) => string): unknown {
  const ascii = () => String.fromCharCode(...raw).trim();
  switch (f.type) {
    case "N":
    case "F": {
      const s = ascii();
      if (!s || /^\*+$/.test(s)) {return null;}
      const v = Number(s);
      return Number.isFinite(v) ? v : null;
    }
    case "L": {
      const s = ascii().toUpperCase();
      return s === "T" || s === "Y" ? true : s === "F" || s === "N" ? false : null;
    }
    case "D": {
      const s = ascii();
      return /^\d{8}$/.test(s) && s !== "00000000" ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
    }
    default: {
      let e = raw.length;
      while (e > 0 && (raw[e - 1] === 0x20 || raw[e - 1] === 0)) {e--;}
      const s = decode(raw.subarray(0, e)).trim();
      return s === "" ? null : s;
    }
  }
}

const SIDE = /\.(shp|shx|dbf|prj|cpg)$/i;

/** Whether a filename is one of a shapefile's parts. */
export function isShapefilePart(name: string): boolean {
  return SIDE.test(name);
}

/**
 * One layer per .shp in `files` (keyed by filename, paths allowed). Sidecars
 * are matched by name, case-insensitively. A .prj is honoured; without one,
 * `opts.crs` is used when the coordinates look projected, and without that
 * the layer comes back with `needsCrs` set and its coordinates unchanged.
 */
export function readShapefile(files: Map<string, Uint8Array>, opts: { crs?: string } = {}): ImportedWithCrs[] {
  const byBase = new Map<string, Map<string, Uint8Array>>();
  for (const [name, bytes] of files) {
    const m = SIDE.exec(name);
    if (!m) {continue;}
    const base = name.slice(0, -m[0].length).toLowerCase();
    if (!byBase.has(base)) {byBase.set(base, new Map());}
    byBase.get(base)!.set(m[1].toLowerCase(), bytes);
  }
  const out: ImportedWithCrs[] = [];
  for (const [name] of files) {
    const m = SIDE.exec(name);
    if (!m || m[1].toLowerCase() !== "shp") {continue;}
    const parts = byBase.get(name.slice(0, -4).toLowerCase())!;
    const title = name.slice(0, -4).split(/[\\/]/).pop() || "layer";
    out.push(readOne(title, parts, opts));
  }
  return out;
}

function readOne(title: string, parts: Map<string, Uint8Array>, opts: { crs?: string }): ImportedWithCrs {
  const { geometries } = readShp(parts.get("shp")!);
  const text = (b: Uint8Array | undefined) => (b ? new TextDecoder("utf-8").decode(b) : "");
  const dbf = parts.get("dbf");
  const { fields, records } = dbf ? readDbf(dbf, encodingFromCpg(text(parts.get("cpg")))) : { fields: [], records: [] };
  let features: StudioFeature[] = [];
  let skipped = 0;
  geometries.forEach((g, i) => {
    const props = records[i] ?? {};
    if (!g || props.__deleted) {
      skipped++;
      return;
    }
    features.push({ type: "Feature", id: newId("f"), geometry: g, properties: { ...props } });
  });
  const prj = text(parts.get("prj"));
  const def = prj ? defFromPrj(prj) : null;
  const result: ImportedWithCrs = { title, features, fields, skipped };
  if (def && def !== "EPSG:4326") {
    features = reprojectFeatures(features, def);
    return { ...result, features, sourceCrs: def };
  }
  if (!def && guessCrsFromCoords(features) === null) {
    if (opts.crs) {return { ...result, features: reprojectFeatures(features, opts.crs), sourceCrs: opts.crs };}
    return { ...result, needsCrs: true };
  }
  return result;
}

// ── Writing ────────────────────────────────────────────────────────────────

export const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

type Family = "points" | "lines" | "polygons";

function family(g: Geometry): Family | null {
  switch (g.type) {
    case "Point":
    case "MultiPoint": return "points";
    case "LineString":
    case "MultiLineString": return "lines";
    case "Polygon":
    case "MultiPolygon": return "polygons";
    default: return null;
  }
}

interface FieldSpec {
  source: string;
  name: string;
  type: "C" | "N" | "L";
  length: number;
  decimals: number;
}

const enc = new TextEncoder();

/** Truncate a string to at most `max` UTF-8 bytes without splitting a character. */
function truncBytes(s: string, max: number): Uint8Array {
  let b = enc.encode(s);
  if (b.length <= max) {return b;}
  let end = max;
  while (end > 0 && (b[end] & 0xc0) === 0x80) {end--;}
  b = b.subarray(0, end);
  return b;
}

/** DBF field names: at most 10 bytes, unique case-insensitively. Returns them in `fields` order. */
export function dbfFieldNames(fields: string[]): string[] {
  const used = new Set<string>();
  const dec = new TextDecoder();
  return fields.map((f) => {
    const clean = f.replace(/[\s\x00-\x1f]+/g, "_") || "field";
    let name = dec.decode(truncBytes(clean, 10));
    for (let i = 1; used.has(name.toLowerCase()); i++) {
      const suffix = `_${i}`;
      name = dec.decode(truncBytes(clean, 10 - suffix.length)) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function cellText(v: unknown): string {
  return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
}

function fieldSpecs(features: StudioFeature[], fields: string[]): FieldSpec[] {
  const names = dbfFieldNames(fields);
  return fields.map((source, i) => {
    const vals = features.map((f) => f.properties[source]).filter((v) => v !== null && v !== undefined && v !== "");
    if (vals.length > 0 && vals.every((v) => typeof v === "boolean")) {return { source, name: names[i], type: "L", length: 1, decimals: 0 };}
    if (vals.length > 0 && vals.every((v) => typeof v === "number" && Number.isFinite(v))) {
      const nums = vals as number[];
      const intDigits = Math.max(1, ...nums.map((v) => String(Math.trunc(Math.abs(v))).length));
      if (nums.every((v) => Number.isInteger(v)) && intDigits <= 18) {return { source, name: names[i], type: "N", length: Math.max(10, intDigits + 1), decimals: 0 };}
      const decimals = Math.max(0, Math.min(15, 24 - 2 - intDigits));
      return { source, name: names[i], type: "N", length: 24, decimals };
    }
    const len = Math.max(1, ...vals.map((v) => enc.encode(cellText(v)).length));
    return { source, name: names[i], type: "C", length: Math.min(254, len), decimals: 0 };
  });
}

function writeDbf(features: StudioFeature[], specs: FieldSpec[]): Uint8Array {
  const headerLen = 32 + specs.length * 32 + 1;
  const recordLen = 1 + specs.reduce((s, f) => s + f.length, 0);
  const out = new Uint8Array(headerLen + recordLen * features.length + 1);
  const dv = new DataView(out.buffer);
  const now = new Date();
  out[0] = 0x03;
  out[1] = now.getFullYear() - 1900;
  out[2] = now.getMonth() + 1;
  out[3] = now.getDate();
  dv.setUint32(4, features.length, true);
  dv.setUint16(8, headerLen, true);
  dv.setUint16(10, recordLen, true);
  specs.forEach((f, i) => {
    const p = 32 + i * 32;
    out.set(enc.encode(f.name).subarray(0, 10), p);
    out[p + 11] = f.type.charCodeAt(0);
    out[p + 16] = f.length;
    out[p + 17] = f.decimals;
  });
  out[headerLen - 1] = 0x0d;
  features.forEach((feat, r) => {
    let o = headerLen + r * recordLen;
    out[o++] = 0x20;
    for (const f of specs) {
      out.fill(0x20, o, o + f.length);
      const v = feat.properties[f.source];
      if (v !== null && v !== undefined && v !== "") {
        if (f.type === "C") {out.set(truncBytes(cellText(v), f.length), o);}
        else if (f.type === "L") {out[o] = v ? 0x54 : 0x46;}
        else if (typeof v === "number" && Number.isFinite(v)) {
          let s = v.toFixed(f.decimals);
          if (s.length > f.length) {s = v.toPrecision(Math.max(1, f.length - 7));}
          if (s.length <= f.length) {out.set(enc.encode(s.padStart(f.length, " ")), o);}
        }
      }
      o += f.length;
    }
  });
  out[out.length - 1] = 0x1a;
  return out;
}

function closeRing(r: Position[]): Position[] {
  const a = r[0];
  const b = r[r.length - 1];
  return a[0] === b[0] && a[1] === b[1] ? r : [...r, a];
}

/** Parts (as point lists) of a geometry, wound for shapefiles: outer rings clockwise, holes counter-clockwise. */
function shapeParts(g: Geometry): Position[][] {
  switch (g.type) {
    case "Point": return [[g.coordinates]];
    case "MultiPoint": return [g.coordinates];
    case "LineString": return [g.coordinates];
    case "MultiLineString": return g.coordinates;
    case "Polygon":
    case "MultiPolygon": {
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      const out: Position[][] = [];
      for (const poly of polys) {
        poly.forEach((ring, i) => {
          if (ring.length < 3) {return;}
          const r = closeRing(ring);
          const cw = ringArea2(r) > 0;
          out.push((i === 0) === cw ? r : r.slice().reverse());
        });
      }
      return out;
    }
    default: return [];
  }
}

function writeShpShx(geoms: Geometry[], shapeType: number): { shp: Uint8Array; shx: Uint8Array } {
  const contents: Uint8Array[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of geoms) {
    const parts = shapeParts(g);
    const pts = parts.flat();
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const p of pts) {
      bx0 = Math.min(bx0, p[0]);
      by0 = Math.min(by0, p[1]);
      bx1 = Math.max(bx1, p[0]);
      by1 = Math.max(by1, p[1]);
    }
    minX = Math.min(minX, bx0);
    minY = Math.min(minY, by0);
    maxX = Math.max(maxX, bx1);
    maxY = Math.max(maxY, by1);
    let buf: Uint8Array;
    if (shapeType === 1) {
      buf = new Uint8Array(20);
      const dv = new DataView(buf.buffer);
      dv.setInt32(0, 1, true);
      dv.setFloat64(4, pts[0][0], true);
      dv.setFloat64(12, pts[0][1], true);
    } else if (shapeType === 8) {
      buf = new Uint8Array(40 + pts.length * 16);
      const dv = new DataView(buf.buffer);
      dv.setInt32(0, 8, true);
      [bx0, by0, bx1, by1].forEach((v, i) => dv.setFloat64(4 + i * 8, v, true));
      dv.setInt32(36, pts.length, true);
      pts.forEach((p, i) => {
        dv.setFloat64(40 + i * 16, p[0], true);
        dv.setFloat64(48 + i * 16, p[1], true);
      });
    } else {
      buf = new Uint8Array(44 + parts.length * 4 + pts.length * 16);
      const dv = new DataView(buf.buffer);
      dv.setInt32(0, shapeType, true);
      [bx0, by0, bx1, by1].forEach((v, i) => dv.setFloat64(4 + i * 8, v, true));
      dv.setInt32(36, parts.length, true);
      dv.setInt32(40, pts.length, true);
      let start = 0;
      parts.forEach((part, i) => {
        dv.setInt32(44 + i * 4, start, true);
        start += part.length;
      });
      const at = 44 + parts.length * 4;
      pts.forEach((p, i) => {
        dv.setFloat64(at + i * 16, p[0], true);
        dv.setFloat64(at + 8 + i * 16, p[1], true);
      });
    }
    contents.push(buf);
  }
  if (minX === Infinity) {minX = minY = maxX = maxY = 0;}
  const shpLen = 100 + contents.reduce((s, c) => s + 8 + c.length, 0);
  const shxLen = 100 + contents.length * 8;
  const header = (len: number) => {
    const h = new Uint8Array(100);
    const dv = new DataView(h.buffer);
    dv.setInt32(0, 9994, false);
    dv.setInt32(24, len / 2, false);
    dv.setInt32(28, 1000, true);
    dv.setInt32(32, shapeType, true);
    [minX, minY, maxX, maxY].forEach((v, i) => dv.setFloat64(36 + i * 8, v, true));
    return h;
  };
  const shp = new Uint8Array(shpLen);
  const shx = new Uint8Array(shxLen);
  shp.set(header(shpLen), 0);
  shx.set(header(shxLen), 0);
  const sdv = new DataView(shp.buffer);
  const xdv = new DataView(shx.buffer);
  let o = 100;
  contents.forEach((c, i) => {
    sdv.setInt32(o, i + 1, false);
    sdv.setInt32(o + 4, c.length / 2, false);
    shp.set(c, o + 8);
    xdv.setInt32(100 + i * 8, o / 2, false);
    xdv.setInt32(104 + i * 8, c.length / 2, false);
    o += 8 + c.length;
  });
  return { shp, shx };
}

/**
 * A .zip holding one shapefile per geometry family in `features` (WGS84,
 * UTF-8 attributes). With one family the files are `name.*`; with several,
 * `name_points.*`, `name_lines.*`, `name_polygons.*`. Geometry collections
 * are left out. Field names are cut to 10 bytes (see `dbfFieldNames`).
 */
export async function writeShapefile(name: string, features: StudioFeature[], fields: string[]): Promise<Uint8Array> {
  const groups = new Map<Family, StudioFeature[]>();
  for (const f of features) {
    const fam = f.geometry ? family(f.geometry) : null;
    if (!fam) {continue;}
    if (!groups.has(fam)) {groups.set(fam, []);}
    groups.get(fam)!.push(f);
  }
  const base = name.replace(/[\\/:*?"<>|]+/g, "_") || "layer";
  const files: Record<string, Uint8Array | string> = {};
  if (groups.size === 0) {groups.set("points", []);}
  for (const [fam, feats] of groups) {
    const stem = groups.size === 1 ? base : `${base}_${fam}`;
    const shapeType = fam === "lines" ? 3 : fam === "polygons" ? 5 : feats.every((f) => f.geometry.type === "Point") ? 1 : 8;
    const { shp, shx } = writeShpShx(feats.map((f) => f.geometry), shapeType);
    files[`${stem}.shp`] = shp;
    files[`${stem}.shx`] = shx;
    files[`${stem}.dbf`] = writeDbf(feats, fieldSpecs(feats, fields));
    files[`${stem}.prj`] = WGS84_PRJ;
    files[`${stem}.cpg`] = "UTF-8";
  }
  return writeZip(files);
}
