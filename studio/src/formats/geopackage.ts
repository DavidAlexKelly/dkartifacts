/**
 * OGC GeoPackage read and write, on SQLite compiled to WebAssembly (sql.js).
 * The wasm (~690 KB) is fetched the first time a GeoPackage is opened or
 * written, not at startup.
 */
import type { Geometry, Position } from "geojson";
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { newId, type StudioFeature } from "../project/types";
import { defFromPrj, epsgCode, guessCrsFromCoords, reprojectFeatures, type ImportedWithCrs } from "./crs";

// ── sql.js ─────────────────────────────────────────────────────────────────

let sqlPromise: Promise<SqlJsStatic> | null = null;

function isNode(): boolean {
  const p = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof p?.versions?.node === "string";
}

/** sql.js, initialised once. In node (tests) the wasm is read from node_modules; in the browser it is the bundled asset. */
export function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      if (isNode()) {
        const moduleSpec = "node:module";
        const fsSpec = "node:fs";
        const { createRequire } = (await import(/* @vite-ignore */ moduleSpec)) as { createRequire(url: string): { resolve(id: string): string } };
        const { readFileSync } = (await import(/* @vite-ignore */ fsSpec)) as { readFileSync(path: string): Uint8Array };
        const file = readFileSync(createRequire(import.meta.url).resolve("sql.js/dist/sql-wasm.wasm"));
        const wasmBinary = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
        return initSqlJs({ wasmBinary });
      }
      return initSqlJs({ locateFile: () => wasmUrl });
    })();
    sqlPromise.catch(() => {
      sqlPromise = null;
    });
  }
  return sqlPromise;
}

// ── WKB ────────────────────────────────────────────────────────────────────

class WkbReader {
  private dv: DataView;
  private o: number;
  constructor(bytes: Uint8Array, offset: number) {
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.o = offset;
  }

  geometry(): Geometry | null {
    const le = this.dv.getUint8(this.o) === 1;
    this.o += 1;
    let type = this.dv.getUint32(this.o, le);
    this.o += 4;
    // EWKB flags, then ISO 1000s.
    let hasZ = (type & 0x80000000) !== 0;
    let hasM = (type & 0x40000000) !== 0;
    if (type & 0x20000000) {this.o += 4;} // EWKB SRID
    type &= 0x0fffffff;
    const thousands = Math.floor(type / 1000);
    if (thousands === 1 || thousands === 3) {hasZ = true;}
    if (thousands === 2 || thousands === 3) {hasM = true;}
    type %= 1000;
    const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);
    const pos = (): Position => {
      const x = this.dv.getFloat64(this.o, le);
      const y = this.dv.getFloat64(this.o + 8, le);
      const p: Position = [x, y];
      if (hasZ) {p.push(this.dv.getFloat64(this.o + 16, le));}
      this.o += dims * 8;
      return p;
    };
    const count = () => {
      const n = this.dv.getUint32(this.o, le);
      this.o += 4;
      return n;
    };
    const list = () => Array.from({ length: count() }, pos);
    const children = () => Array.from({ length: count() }, () => this.geometry());
    switch (type) {
      case 1: {
        const p = pos();
        return Number.isNaN(p[0]) || Number.isNaN(p[1]) ? null : { type: "Point", coordinates: p };
      }
      case 2: return { type: "LineString", coordinates: list() };
      case 3: return { type: "Polygon", coordinates: Array.from({ length: count() }, list) };
      case 4: return { type: "MultiPoint", coordinates: children().flatMap((g) => (g?.type === "Point" ? [g.coordinates] : [])) };
      case 5: return { type: "MultiLineString", coordinates: children().flatMap((g) => (g?.type === "LineString" ? [g.coordinates] : [])) };
      case 6: return { type: "MultiPolygon", coordinates: children().flatMap((g) => (g?.type === "Polygon" ? [g.coordinates] : [])) };
      case 7: return { type: "GeometryCollection", geometries: children().filter((g): g is Geometry => g !== null) };
      default: throw new Error(`Unsupported WKB geometry type ${type}`);
    }
  }
}

export function parseWkb(bytes: Uint8Array, offset = 0): Geometry | null {
  return new WkbReader(bytes, offset).geometry();
}

/** A GeoPackage geometry blob: its srs_id and geometry (null when empty). */
export function parseGpkgGeometry(blob: Uint8Array): { srsId: number; geometry: Geometry | null } {
  if (blob[0] !== 0x47 || blob[1] !== 0x50) {
    // Some writers store bare WKB.
    return { srsId: 0, geometry: parseWkb(blob) };
  }
  const flags = blob[3];
  const le = (flags & 1) === 1;
  const envelope = (flags >> 1) & 7;
  const empty = (flags & 0x10) !== 0;
  const srsId = new DataView(blob.buffer, blob.byteOffset, blob.byteLength).getInt32(4, le);
  const envBytes = [0, 32, 48, 48, 64][envelope];
  if (envBytes === undefined) {throw new Error(`Bad GeoPackage envelope code ${envelope}`);}
  if (empty) {return { srsId, geometry: null };}
  return { srsId, geometry: parseWkb(blob, 8 + envBytes) };
}

function wkbSize(g: Geometry): number {
  switch (g.type) {
    case "Point": return 21;
    case "LineString": return 9 + g.coordinates.length * 16;
    case "Polygon": return 9 + g.coordinates.reduce((s, r) => s + 4 + r.length * 16, 0);
    case "MultiPoint": return 9 + g.coordinates.length * 21;
    case "MultiLineString": return 9 + g.coordinates.reduce((s, l) => s + 9 + l.length * 16, 0);
    case "MultiPolygon": return 9 + g.coordinates.reduce((s, p) => s + 9 + p.reduce((t, r) => t + 4 + r.length * 16, 0), 0);
    case "GeometryCollection": return 9 + g.geometries.reduce((s, c) => s + wkbSize(c), 0);
  }
}

const WKB_TYPE: Record<Geometry["type"], number> = {
  Point: 1, LineString: 2, Polygon: 3, MultiPoint: 4, MultiLineString: 5, MultiPolygon: 6, GeometryCollection: 7,
};

/** Little-endian 2D WKB. */
export function toWkb(g: Geometry): Uint8Array {
  const out = new Uint8Array(wkbSize(g));
  const dv = new DataView(out.buffer);
  let o = 0;
  const head = (t: number) => {
    dv.setUint8(o, 1);
    dv.setUint32(o + 1, t, true);
    o += 5;
  };
  const u32 = (n: number) => {
    dv.setUint32(o, n, true);
    o += 4;
  };
  const pt = (p: Position) => {
    dv.setFloat64(o, p[0], true);
    dv.setFloat64(o + 8, p[1], true);
    o += 16;
  };
  const write = (geom: Geometry) => {
    head(WKB_TYPE[geom.type]);
    switch (geom.type) {
      case "Point": pt(geom.coordinates); break;
      case "LineString": u32(geom.coordinates.length); geom.coordinates.forEach(pt); break;
      case "Polygon": u32(geom.coordinates.length); for (const r of geom.coordinates) {u32(r.length); r.forEach(pt);} break;
      case "MultiPoint": u32(geom.coordinates.length); for (const c of geom.coordinates) {write({ type: "Point", coordinates: c });} break;
      case "MultiLineString": u32(geom.coordinates.length); for (const c of geom.coordinates) {write({ type: "LineString", coordinates: c });} break;
      case "MultiPolygon": u32(geom.coordinates.length); for (const c of geom.coordinates) {write({ type: "Polygon", coordinates: c });} break;
      case "GeometryCollection": u32(geom.geometries.length); geom.geometries.forEach(write); break;
    }
  };
  write(g);
  return out;
}

function bboxOf(g: Geometry): [number, number, number, number] {
  let b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (p: Position) => {
    b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])];
  };
  const walk = (geom: Geometry) => {
    switch (geom.type) {
      case "Point": visit(geom.coordinates); break;
      case "LineString": case "MultiPoint": geom.coordinates.forEach(visit); break;
      case "Polygon": case "MultiLineString": geom.coordinates.forEach((r) => r.forEach(visit)); break;
      case "MultiPolygon": geom.coordinates.forEach((p) => p.forEach((r) => r.forEach(visit))); break;
      case "GeometryCollection": geom.geometries.forEach(walk); break;
    }
  };
  walk(g);
  return b;
}

/** A GeoPackage geometry blob (little-endian, XY envelope except for points). */
export function toGpkgGeometry(g: Geometry, srsId = 4326): Uint8Array {
  const wkb = toWkb(g);
  const withEnv = g.type !== "Point";
  const out = new Uint8Array(8 + (withEnv ? 32 : 0) + wkb.length);
  const dv = new DataView(out.buffer);
  out[0] = 0x47;
  out[1] = 0x50;
  out[2] = 0;
  out[3] = withEnv ? 0b011 : 0b001;
  dv.setInt32(4, srsId, true);
  if (withEnv) {
    const [x0, y0, x1, y1] = bboxOf(g);
    dv.setFloat64(8, x0, true);
    dv.setFloat64(16, x1, true);
    dv.setFloat64(24, y0, true);
    dv.setFloat64(32, y1, true);
  }
  out.set(wkb, withEnv ? 40 : 8);
  return out;
}

// ── Reading ────────────────────────────────────────────────────────────────

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

function rows(db: Database, sql: string, params: SqlValue[] = []): Array<Record<string, SqlValue>> {
  const st = db.prepare(sql);
  try {
    st.bind(params);
    const out: Array<Record<string, SqlValue>> = [];
    while (st.step()) {out.push(st.getAsObject() as Record<string, SqlValue>);}
    return out;
  } finally {
    st.free();
  }
}

function srsDef(db: Database, srsId: number): string | null | "none" {
  if (srsId === 4326 || srsId === 0 || srsId === -1) {return "none";}
  const r = rows(db, "SELECT organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys WHERE srs_id = ?", [srsId])[0];
  if (!r) {return epsgCode(srsId);}
  if (String(r.organization).toUpperCase() === "EPSG") {
    if (Number(r.organization_coordsys_id) === 4326) {return "none";}
    const c = epsgCode(Number(r.organization_coordsys_id));
    if (c) {return c;}
  }
  return typeof r.definition === "string" ? defFromPrj(r.definition) : null;
}

/** One layer per feature table, reprojected to WGS84 from each table's srs. */
export async function readGeoPackage(bytes: Uint8Array, opts: { crs?: string } = {}): Promise<ImportedWithCrs[]> {
  const SQL = await loadSql();
  const db = new SQL.Database(bytes);
  try {
    const tables = rows(db, "SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns");
    const out: ImportedWithCrs[] = [];
    for (const t of tables) {
      const table = String(t.table_name);
      const geomCol = String(t.column_name);
      const cols = rows(db, `PRAGMA table_info(${q(table)})`);
      const pk = cols.find((c) => Number(c.pk) === 1 && /INT/i.test(String(c.type)))?.name;
      const boolCols = new Set(cols.filter((c) => /^BOOL/i.test(String(c.type))).map((c) => String(c.name)));
      const fields = cols.map((c) => String(c.name)).filter((n) => n !== geomCol && n !== pk);
      let features: StudioFeature[] = [];
      let skipped = 0;
      let blobSrs: number | null = null;
      for (const r of rows(db, `SELECT * FROM ${q(table)}`)) {
        const blob = r[geomCol];
        let geometry: Geometry | null = null;
        if (blob instanceof Uint8Array && blob.length > 0) {
          try {
            const parsed = parseGpkgGeometry(blob);
            geometry = parsed.geometry;
            blobSrs ??= parsed.srsId;
          } catch {
            geometry = null;
          }
        }
        if (!geometry) {
          skipped++;
          continue;
        }
        const properties: Record<string, unknown> = {};
        for (const f of fields) {
          const v = r[f];
          properties[f] = v instanceof Uint8Array ? null : boolCols.has(f) && v !== null ? Boolean(v) : v;
        }
        features.push({ type: "Feature", id: newId("f"), geometry, properties });
      }
      const result: ImportedWithCrs = { title: table, features, fields, skipped };
      const srsId = Number(t.srs_id ?? blobSrs ?? 4326);
      const def = srsDef(db, srsId);
      if (def && def !== "none") {
        features = reprojectFeatures(features, def);
        out.push({ ...result, features, sourceCrs: def });
      } else if (guessCrsFromCoords(features) === null) {
        if (opts.crs) {out.push({ ...result, features: reprojectFeatures(features, opts.crs), sourceCrs: opts.crs });}
        else {out.push({ ...result, needsCrs: true });}
      } else {
        out.push(result);
      }
    }
    return out;
  } finally {
    db.close();
  }
}

// ── Writing ────────────────────────────────────────────────────────────────

export interface GpkgLayer {
  name: string;
  features: StudioFeature[];
  fields: string[];
}

const WGS84_WKT =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AXIS["Latitude",NORTH],AXIS["Longitude",EAST],AUTHORITY["EPSG","4326"]]';

const SCHEMA = `
CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name), CONSTRAINT uk_gc_table_name UNIQUE (table_name), CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name), CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id));
`;

const GPKG_TYPE: Record<Geometry["type"], string> = {
  Point: "POINT", LineString: "LINESTRING", Polygon: "POLYGON", MultiPoint: "MULTIPOINT",
  MultiLineString: "MULTILINESTRING", MultiPolygon: "MULTIPOLYGON", GeometryCollection: "GEOMETRYCOLLECTION",
};

function columnType(features: StudioFeature[], field: string): "TEXT" | "REAL" | "INTEGER" | "BOOLEAN" {
  const vals = features.map((f) => f.properties[field]).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) {return "TEXT";}
  if (vals.every((v) => typeof v === "boolean")) {return "BOOLEAN";}
  if (vals.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return vals.every((v) => Number.isSafeInteger(v)) ? "INTEGER" : "REAL";
  }
  return "TEXT";
}

function sqlValue(v: unknown, type: string): SqlValue {
  if (v === null || v === undefined) {return null;}
  if (type === "BOOLEAN") {return v ? 1 : 0;}
  if (type === "INTEGER" || type === "REAL") {return typeof v === "number" ? v : null;}
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** A GeoPackage (1.3) with one feature table per layer, in WGS84. No spatial index is written. */
export async function writeGeoPackage(layers: GpkgLayer[]): Promise<Uint8Array> {
  const SQL = await loadSql();
  const db = new SQL.Database();
  try {
    db.run("PRAGMA application_id = 1196444487; PRAGMA user_version = 10300;");
    db.run(SCHEMA);
    db.run("INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84 geodetic', 4326, 'EPSG', 4326, ?, 'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid')", [WGS84_WKT]);
    db.run("INSERT INTO gpkg_spatial_ref_sys VALUES ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system')");
    db.run("INSERT INTO gpkg_spatial_ref_sys VALUES ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system')");
    const usedTables = new Set<string>();
    const usedIds = new Set<string>();
    for (const layer of layers) {
      let table = layer.name.replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/^_+|_+$/g, "") || "layer";
      if (/^(gpkg_|rtree_|sqlite_)/i.test(table) || /^\d/.test(table)) {table = `t_${table}`;}
      for (let i = 2, base = table; usedTables.has(table.toLowerCase()); i++) {table = `${base}_${i}`;}
      usedTables.add(table.toLowerCase());

      const used = new Set(["fid", "geom"]);
      const cols = layer.fields.map((f) => {
        let name = f || "field";
        for (let i = 1, base = name; used.has(name.toLowerCase()); i++) {name = `${base}_${i}`;}
        used.add(name.toLowerCase());
        return { field: f, name, type: columnType(layer.features, f) };
      });
      const feats = layer.features.filter((f) => f.geometry);
      const types = new Set(feats.map((f) => f.geometry.type));
      const geomType = types.size === 1 ? GPKG_TYPE[[...types][0]] : "GEOMETRY";
      db.run(`CREATE TABLE ${q(table)} (fid INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, geom ${geomType}${cols.map((c) => `, ${q(c.name)} ${c.type}`).join("")})`);

      let b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
      const st = db.prepare(`INSERT INTO ${q(table)} (geom${cols.map((c) => `, ${q(c.name)}`).join("")}) VALUES (?${cols.map(() => ", ?").join("")})`);
      db.run("BEGIN");
      for (const f of feats) {
        const fb = bboxOf(f.geometry);
        b = [Math.min(b[0], fb[0]), Math.min(b[1], fb[1]), Math.max(b[2], fb[2]), Math.max(b[3], fb[3])];
        st.run([toGpkgGeometry(f.geometry), ...cols.map((c) => sqlValue(f.properties[c.field], c.type))]);
      }
      db.run("COMMIT");
      st.free();
      const identifier = layer.name && !usedIds.has(layer.name) ? layer.name : table;
      usedIds.add(identifier);
      const bbox = b[0] === Infinity ? [null, null, null, null] : b;
      db.run("INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id) VALUES (?, 'features', ?, '', ?, ?, ?, ?, 4326)", [table, identifier, ...bbox]);
      db.run("INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', ?, 4326, 0, 0)", [table, geomType]);
    }
    return db.export();
  } finally {
    db.close();
  }
}
