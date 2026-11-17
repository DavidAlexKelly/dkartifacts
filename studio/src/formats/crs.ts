/**
 * Coordinate reference systems: proj4 definitions for the CRSs people
 * commonly bring data in, a picker list, .prj/WKT recognition, and
 * reprojection of features to WGS84 (which is what the map and the project
 * store).
 */
import type { Geometry, Position } from "geojson";
import proj4 from "proj4";
import type { StudioFeature } from "../project/types";
import type { Imported } from "./vector";

/** An imported layer, plus what is known about where its coordinates came from. */
export interface ImportedWithCrs extends Imported {
  /** The source CRS the features were reprojected from, when they were. */
  sourceCrs?: string;
  /** True when the coordinates look projected but no CRS was known: the features are NOT in WGS84. */
  needsCrs?: boolean;
}

export interface CrsOption {
  code: string;
  name: string;
}

const ETRS = "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0";

const DEFS: Array<[string, string, string]> = [
  ["EPSG:4326", "WGS 84 (lon/lat)", "+proj=longlat +datum=WGS84 +no_defs"],
  ["EPSG:3857", "WGS 84 / Pseudo-Mercator (web)", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs"],
  ["EPSG:4258", "ETRS89 (lon/lat)", `+proj=longlat ${ETRS} +no_defs`],
  ["EPSG:27700", "OSGB36 / British National Grid", "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs"],
  ["EPSG:2154", "RGF93 / Lambert-93 (France)", `+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 ${ETRS} +units=m +no_defs`],
  ["EPSG:3035", "ETRS89 / LAEA Europe", `+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 ${ETRS} +units=m +no_defs`],
  ["EPSG:3006", "SWEREF99 TM (Sweden)", `+proj=utm +zone=33 ${ETRS} +units=m +no_defs`],
  ["EPSG:5070", "NAD83 / Conus Albers (USA)", "+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs"],
  ["EPSG:2056", "CH1903+ / LV95 (Switzerland)", "+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs"],
  ["EPSG:31370", "Belge 1972 / Belgian Lambert 72", "+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 +lat_2=49.8333339 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.869,52.2978,-103.724,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs"],
];
for (let z = 29; z <= 35; z++) {
  DEFS.push([`EPSG:258${z}`, `ETRS89 / UTM zone ${z}N`, `+proj=utm +zone=${z} ${ETRS} +units=m +no_defs`]);
}
for (let z = 1; z <= 60; z++) {
  const zz = String(z).padStart(2, "0");
  DEFS.push([`EPSG:326${zz}`, `WGS 84 / UTM zone ${z}N`, `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs`]);
}
for (let z = 1; z <= 60; z++) {
  const zz = String(z).padStart(2, "0");
  DEFS.push([`EPSG:327${zz}`, `WGS 84 / UTM zone ${z}S`, `+proj=utm +zone=${z} +south +datum=WGS84 +units=m +no_defs`]);
}
for (const [code, , def] of DEFS) {proj4.defs(code, def);}

/** Every CRS this module defines, in picker order. */
export const CRS_OPTIONS: CrsOption[] = DEFS.map(([code, name]) => ({ code, name }));

const KNOWN = new Set(DEFS.map(([code]) => code));

/** Whether `code` (e.g. "EPSG:27700") is one of the CRSs defined here. */
export function isKnownCrs(code: string): boolean {
  return KNOWN.has(code.toUpperCase());
}

/** "EPSG:x" when x is defined here, else null. Accepts 27700, "27700", "EPSG:27700", "urn:ogc:def:crs:EPSG::27700". */
export function epsgCode(code: string | number): string | null {
  if (/CRS84$/i.test(String(code))) {return "EPSG:4326";}
  const m = /(\d{4,5})\s*$/.exec(String(code));
  if (!m) {return null;}
  const c = `EPSG:${m[1]}`;
  return KNOWN.has(c) ? c : null;
}

/** ESRI (and common OGC) names, normalised (lower case, non-alphanumerics dropped). */
function esriName(name: string): string | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const utm = /^(wgs1984|wgs84|etrs1989|etrs89)utmzone(\d{1,2})([ns])$/.exec(n);
  if (utm) {
    const z = Number(utm[2]);
    const etrs = utm[1].startsWith("etrs");
    if (etrs && utm[3] === "n" && z >= 29 && z <= 35) {return `EPSG:258${z}`;}
    if (!etrs && z >= 1 && z <= 60) {return `EPSG:32${utm[3] === "n" ? 6 : 7}${String(z).padStart(2, "0")}`;}
    return null;
  }
  const table: Record<string, string> = {
    gcswgs1984: "EPSG:4326",
    wgs84: "EPSG:4326",
    wgs1984: "EPSG:4326",
    gcsetrs1989: "EPSG:4258",
    etrs89: "EPSG:4258",
    britishnationalgrid: "EPSG:27700",
    osgb1936britishnationalgrid: "EPSG:27700",
    osgb36britishnationalgrid: "EPSG:27700",
    rgf1993lambert93: "EPSG:2154",
    rgf93lambert93: "EPSG:2154",
    etrs1989laea: "EPSG:3035",
    etrs89laeaeurope: "EPSG:3035",
    etrs89extendedlaeaeurope: "EPSG:3035",
    sweref99tm: "EPSG:3006",
    usacontiguousalbersequalareaconic: "EPSG:5070",
    usacontiguousalbersequalareaconicusgsversion: "EPSG:5070",
    nad1983contiguoususaalbers: "EPSG:5070",
    nad83conusalbers: "EPSG:5070",
    ch1903lv95: "EPSG:2056",
    belge1972belgianlambert72: "EPSG:31370",
    belge1972belgianlambert72a: "EPSG:31370",
    wgs1984webmercatorauxiliarysphere: "EPSG:3857",
    wgs1984webmercator: "EPSG:3857",
    wgs84pseudomercator: "EPSG:3857",
  };
  return table[n] ?? null;
}

/**
 * A proj4 definition for a .prj / WKT string: "EPSG:x" when it names one of
 * the CRSs defined here (by authority code or ESRI name), else the WKT itself
 * when proj4 can parse it, else null.
 */
export function defFromPrj(wkt: string): string | null {
  const text = wkt.trim().replace(/^﻿/, "");
  if (!text) {return null;}
  const direct = epsgCode(text);
  if (direct && /^(EPSG:)?\d+$/i.test(text)) {return direct;}
  // The outermost object's authority is the last one in WKT1 (and WKT2 ID[]).
  const auths = [...text.matchAll(/(?:AUTHORITY|ID)\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]/gi)];
  const outerAuth = auths.length ? auths[auths.length - 1] : null;
  if (outerAuth) {
    const after = text.slice((outerAuth.index ?? 0) + outerAuth[0].length).replace(/[\s\]]/g, "");
    const c = `EPSG:${outerAuth[1]}`;
    if (after === "" && KNOWN.has(c)) {return c;}
  }
  const head = /^\s*(PROJCS|PROJCRS|GEOGCS|GEOGCRS|GEODCRS|PROJECTEDCRS|GEOGRAPHICCRS)\s*\[\s*"([^"]*)"/i.exec(text);
  if (head) {
    const byName = esriName(head[2]);
    if (byName) {return byName;}
  }
  try {
    proj4(text, "EPSG:4326").forward([0, 0]);
    return text;
  } catch {
    return null;
  }
}

/** True when the definition is a lon/lat (geographic) CRS. */
export function isGeographic(def: string): boolean {
  try {
    return (proj4.Proj(def) as unknown as { projName?: string }).projName === "longlat";
  } catch {
    return false;
  }
}

function mapPositions(g: Geometry, f: (p: Position) => Position): Geometry {
  switch (g.type) {
    case "Point": return { type: "Point", coordinates: f(g.coordinates) };
    case "MultiPoint": return { type: "MultiPoint", coordinates: g.coordinates.map(f) };
    case "LineString": return { type: "LineString", coordinates: g.coordinates.map(f) };
    case "MultiLineString": return { type: "MultiLineString", coordinates: g.coordinates.map((l) => l.map(f)) };
    case "Polygon": return { type: "Polygon", coordinates: g.coordinates.map((r) => r.map(f)) };
    case "MultiPolygon": return { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map((r) => r.map(f))) };
    case "GeometryCollection": return { type: "GeometryCollection", geometries: g.geometries.map((x) => mapPositions(x, f)) };
  }
}

/** Every position of a geometry, flattened. */
export function eachPosition(g: Geometry, cb: (p: Position) => void): void {
  mapPositions(g, (p) => {
    cb(p);
    return p;
  });
}

/** New features with every coordinate transformed; Z (and anything after it) is kept as is. */
export function reprojectFeatures(features: StudioFeature[], fromDef: string, toDef = "EPSG:4326"): StudioFeature[] {
  if (fromDef === toDef) {return features.map((f) => ({ ...f, properties: { ...f.properties } }));}
  const conv = proj4(fromDef, toDef);
  const tx = (p: Position): Position => {
    const [x, y] = conv.forward([p[0], p[1]]);
    return p.length > 2 ? [x, y, ...p.slice(2)] : [x, y];
  };
  return features.map((f) => ({ ...f, geometry: mapPositions(f.geometry, tx), properties: { ...f.properties } }));
}

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function featuresBbox(features: StudioFeature[]): Bbox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of features) {
    if (!f.geometry) {continue;}
    eachPosition(f.geometry, (p) => {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {return;}
      if (p[0] < minX) {minX = p[0];}
      if (p[0] > maxX) {maxX = p[0];}
      if (p[1] < minY) {minY = p[1];}
      if (p[1] > maxY) {maxY = p[1];}
    });
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/**
 * "EPSG:4326" when every coordinate fits lon/lat ranges (or there are none),
 * null when some do not, so the data is in some projected CRS that must be
 * named before it can be shown. A projected dataset whose numbers all happen
 * to be small (a local grid, say) is indistinguishable and reads as lon/lat.
 */
export function guessCrsFromCoords(features: StudioFeature[]): "EPSG:4326" | null {
  const b = featuresBbox(features);
  if (!b) {return "EPSG:4326";}
  return b.minX >= -180 && b.maxX <= 180 && b.minY >= -90 && b.maxY <= 90 ? "EPSG:4326" : null;
}

/** Likely CRSs for projected data, best guess first, from its extent alone (a hint for the picker). */
export function suggestCrs(features: StudioFeature[]): string[] {
  const b = featuresBbox(features);
  if (!b || guessCrsFromCoords(features)) {return ["EPSG:4326"];}
  const out: string[] = [];
  const within = (minX: number, maxX: number, minY: number, maxY: number) => b.minX >= minX && b.maxX <= maxX && b.minY >= minY && b.maxY <= maxY;
  if (within(2_480_000, 2_840_000, 1_070_000, 1_300_000)) {out.push("EPSG:2056");}
  if (within(0, 700_000, 0, 1_300_000)) {out.push("EPSG:27700");}
  if (within(100_000, 1_300_000, 6_000_000, 7_200_000)) {out.push("EPSG:2154");}
  if (within(0, 300_000, 0, 300_000)) {out.push("EPSG:31370");}
  if (within(160_000, 840_000, 0, 9_400_000)) {out.push("EPSG:32632", "EPSG:25832", "EPSG:32633", "EPSG:3006");}
  if (within(160_000, 840_000, 1_000_000, 10_000_000)) {out.push("EPSG:32733");}
  if (within(2_000_000, 7_500_000, 1_000_000, 5_500_000)) {out.push("EPSG:3035");}
  if (within(-2_500_000, 2_500_000, 0, 3_500_000)) {out.push("EPSG:5070");}
  if (within(-20_037_509, 20_037_509, -20_048_967, 20_048_967)) {out.push("EPSG:3857");}
  return [...new Set(out)];
}
