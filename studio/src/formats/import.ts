/**
 * One entry point for every file format the studio reads, and one for every
 * format it writes.
 *
 * Import contract: every layer in `layers` is in WGS84. A file whose
 * coordinates look projected but whose CRS is unknown is NOT imported; its
 * name is listed in `needsCrs` so the UI can ask for a CRS and call
 * `importFiles` again on just those files with `opts.crs`.
 */
import type { StudioFeature } from "../project/types";
import { defFromPrj, epsgCode, guessCrsFromCoords, reprojectFeatures, type ImportedWithCrs } from "./crs";
import { readDxf } from "./dxf";
import { readGeoPackage, writeGeoPackage } from "./geopackage";
import { readKmz, writeKmz } from "./kmz";
import { isShapefilePart, readShapefile, writeShapefile } from "./shapefile";
import { importFile, parseCsvRows, safeName, toCsv, toGeoJson, toKml, type Imported } from "./vector";
import { readZip } from "./zip";

export interface ImportResult {
  layers: Imported[];
  errors: string[];
  /** Files (or zip/file, or file/table) left out because their CRS is unknown. */
  needsCrs: string[];
}

export interface ImportOptions {
  /** CRS for data that has none of its own (DXF, CSV, shapefile without .prj); used only when the coordinates look projected. */
  crs?: string;
}

interface Entry {
  name: string;
  bytes: Uint8Array;
}

/** Accepted extensions, for an <input accept> attribute. */
export const IMPORT_ACCEPT = ".geojson,.json,.csv,.tsv,.txt,.kml,.kmz,.gpx,.shp,.shx,.dbf,.prj,.cpg,.zip,.gpkg,.dxf";

async function fileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {return new Uint8Array(await file.arrayBuffer());}
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error ?? new Error(`Could not read ${file.name}`));
    r.readAsArrayBuffer(file);
  });
}

const ext = (name: string) => (/\.([^./\\]+)$/.exec(name)?.[1] ?? "").toLowerCase();
const stem = (name: string) => name.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");
const text = (b: Uint8Array) => new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");

const LAT_NAMES = ["lat", "latitude", "y", "lat_dd", "decimallatitude"];
const LON_NAMES = ["lon", "lng", "long", "longitude", "x", "lon_dd", "decimallongitude", "easting"];

function csvCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV with x/y columns outside lon/lat ranges: vector.ts would drop those
 * rows, so transform the columns to lon/lat first (when a CRS is known).
 * Returns the CSV to parse, or "needsCrs".
 */
function projectedCsv(src: string, crs: string | undefined): string | "needsCrs" | null {
  const rows = parseCsvRows(src);
  if (rows.length < 2) {return null;}
  const lower = rows[0].map((h) => h.trim().toLowerCase());
  const latI = lower.findIndex((h) => LAT_NAMES.includes(h) || h === "northing");
  const lonI = lower.findIndex((h) => LON_NAMES.includes(h));
  if (latI < 0 || lonI < 0) {return null;}
  const out = rows.slice(1).some((r) => {
    const x = Number(r[lonI]);
    const y = Number(r[latI]);
    return r[lonI] !== "" && r[latI] !== "" && Number.isFinite(x) && Number.isFinite(y) && (Math.abs(x) > 180 || Math.abs(y) > 90);
  });
  if (!out) {return null;}
  if (!crs) {return "needsCrs";}
  const header = rows[0].map((h, i) => (i === latI ? "lat" : i === lonI ? "lon" : h));
  const body = rows.slice(1).map((r) => {
    const x = Number(r[lonI]);
    const y = Number(r[latI]);
    const cells = [...r];
    if (r[lonI] !== "" && r[latI] !== "" && Number.isFinite(x) && Number.isFinite(y)) {
      const f: StudioFeature = { type: "Feature", id: "_", geometry: { type: "Point", coordinates: [x, y] }, properties: {} };
      const [lon, lat] = (reprojectFeatures([f], crs)[0].geometry as { coordinates: number[] }).coordinates;
      cells[lonI] = String(lon);
      cells[latI] = String(lat);
    }
    return cells;
  });
  return [header, ...body].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** The CRS a GeoJSON names in its (pre-RFC 7946) `crs` member, if any. */
function geoJsonCrs(src: string): string | null {
  const head = src.slice(0, 2000);
  const m = /"crs"\s*:\s*\{[^{}]*"properties"\s*:\s*\{[^{}]*"name"\s*:\s*"([^"]+)"/.exec(head);
  if (!m) {return null;}
  return epsgCode(m[1]) ?? defFromPrj(m[1]);
}

class Collector {
  layers: Imported[] = [];
  errors: string[] = [];
  needsCrs: string[] = [];
  constructor(private opts: ImportOptions) {}

  /** Adds a layer that may carry CRS flags, applying opts.crs or noting needsCrs. */
  add(label: string, layer: ImportedWithCrs | Imported) {
    const l = layer as ImportedWithCrs;
    if (l.needsCrs) {
      if (this.opts.crs) {
        this.layers.push(strip({ ...l, features: reprojectFeatures(l.features, this.opts.crs) }));
      } else {
        this.needsCrs.push(label);
      }
      return;
    }
    this.layers.push(strip(l));
  }
}

function strip(l: ImportedWithCrs): Imported {
  return { title: l.title, features: l.features, fields: l.fields, skipped: l.skipped };
}

async function importEntries(entries: Entry[], c: Collector, prefix: string, opts: ImportOptions, depth = 0): Promise<void> {
  const shpParts = new Map<string, Uint8Array>();
  for (const e of entries) {
    const label = prefix + e.name;
    const x = ext(e.name);
    try {
      if (isShapefilePart(e.name)) {
        shpParts.set(e.name, e.bytes);
      } else if (x === "zip") {
        if (depth > 1) {throw new Error("zip nested too deep");}
        const inner = await readZip(e.bytes);
        const list = [...inner].filter(([n]) => !n.startsWith("__MACOSX/") && !/(^|\/)\.[^/]*$/.test(n)).map(([name, bytes]) => ({ name, bytes }));
        const before = c.layers.length + c.needsCrs.length;
        await importEntries(list, c, `${label}/`, opts, depth + 1);
        if (c.layers.length + c.needsCrs.length === before && !c.errors.some((m) => m.startsWith(label))) {c.errors.push(`${label}: no supported data inside`);}
      } else if (x === "gpkg") {
        for (const l of await readGeoPackage(e.bytes)) {c.add(`${label}/${l.title}`, l);}
      } else if (x === "kmz") {
        c.add(label, await readKmz(e.bytes, stem(e.name)));
      } else if (x === "dxf") {
        c.add(label, readDxf(text(e.bytes), undefined, stem(e.name)));
      } else if (["geojson", "json", "csv", "tsv", "txt", "kml", "gpx"].includes(x)) {
        let src = text(e.bytes);
        let sourceCrs: string | null = null;
        if (x === "csv" || x === "tsv" || x === "txt") {
          const p = projectedCsv(src, opts.crs);
          if (p === "needsCrs") {
            c.needsCrs.push(label);
            continue;
          }
          if (p !== null) {src = p;}
        } else if (x === "geojson" || x === "json") {
          sourceCrs = geoJsonCrs(src);
        }
        const layer = importFile(e.name.split(/[\\/]/).pop()!, src);
        layer.title = stem(e.name);
        if (sourceCrs && sourceCrs !== "EPSG:4326") {
          c.add(label, { ...layer, features: reprojectFeatures(layer.features, sourceCrs) });
        } else {
          c.add(label, { ...layer, needsCrs: guessCrsFromCoords(layer.features) === null });
        }
      } else if (depth === 0) {
        c.errors.push(`${label}: unsupported file type`);
      }
    } catch (err) {
      c.errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (shpParts.size > 0) {
    const names = [...shpParts.keys()];
    const base = (n: string) => n.slice(0, n.lastIndexOf(".")).toLowerCase();
    const shpBases = new Set(names.filter((n) => ext(n) === "shp").map(base));
    const orphans = new Map<string, string[]>();
    for (const n of names) {
      if (shpBases.has(base(n))) {continue;}
      const key = n.slice(0, n.lastIndexOf("."));
      orphans.set(key, [...(orphans.get(key) ?? []), `.${ext(n)}`]);
    }
    for (const [key, exts] of orphans) {c.errors.push(`${prefix}${key}${exts.join(", ")}: a shapefile needs its .shp file too`);}
    try {
      for (const l of readShapefile(shpParts)) {
        const shp = names.find((n) => ext(n) === "shp" && stem(n) === l.title) ?? `${l.title}.shp`;
        if (!shpParts.has(`${shp.slice(0, -4)}.dbf`) && !names.some((n) => base(n) === base(shp) && ext(n) === "dbf")) {
          c.errors.push(`${prefix}${shp}: no .dbf alongside, so the features have no attributes`);
        }
        c.add(prefix + shp, l);
      }
    } catch (err) {
      c.errors.push(`${prefix}shapefile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Import dropped or picked files. Shapefile sidecars dropped together are read as one layer per .shp. */
export async function importFiles(files: File[], opts: ImportOptions = {}): Promise<ImportResult> {
  const c = new Collector(opts);
  const entries: Entry[] = [];
  for (const f of files) {
    try {
      entries.push({ name: f.name, bytes: await fileBytes(f) });
    } catch (err) {
      c.errors.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await importEntries(entries, c, "", opts);
  return { layers: c.layers, errors: c.errors, needsCrs: c.needsCrs };
}

// ── Export ─────────────────────────────────────────────────────────────────

export type ExportFormat = "geojson" | "csv" | "kml" | "kmz" | "shapefile" | "geopackage";

export const EXPORT_FORMATS: Array<{ format: ExportFormat; label: string }> = [
  { format: "geojson", label: "GeoJSON" },
  { format: "csv", label: "CSV (WKT geometry)" },
  { format: "kml", label: "KML" },
  { format: "kmz", label: "KMZ" },
  { format: "shapefile", label: "Shapefile (.zip)" },
  { format: "geopackage", label: "GeoPackage" },
];

/** A layer as a file to download (pass the result to vector.ts `download`, or use an object URL). */
export async function exportLayer(
  format: ExportFormat,
  title: string,
  features: StudioFeature[],
  fields: string[],
  labelField?: string | null,
): Promise<{ blob: Blob; filename: string }> {
  const base = safeName(title);
  switch (format) {
    case "geojson": return { blob: new Blob([toGeoJson(features)], { type: "application/geo+json" }), filename: `${base}.geojson` };
    case "csv": return { blob: new Blob([toCsv(features, fields)], { type: "text/csv" }), filename: `${base}.csv` };
    case "kml": return { blob: new Blob([toKml(title, features, fields, labelField)], { type: "application/vnd.google-earth.kml+xml" }), filename: `${base}.kml` };
    case "kmz": return { blob: new Blob([await writeKmz(title, features, fields, labelField)], { type: "application/vnd.google-earth.kmz" }), filename: `${base}.kmz` };
    case "shapefile": return { blob: new Blob([await writeShapefile(base, features, fields)], { type: "application/zip" }), filename: `${base}.zip` };
    case "geopackage": return { blob: new Blob([await writeGeoPackage([{ name: title, features, fields }])], { type: "application/geopackage+sqlite3" }), filename: `${base}.gpkg` };
  }
}
