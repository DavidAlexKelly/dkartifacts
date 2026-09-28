/**
 * Turning a cell value into a location.
 *
 * Foundry data spells a place many ways, and a source added by RID arrives
 * with no say over which. Everything here is pure and total: a value that is
 * not a location returns null, never throws.
 *
 * Points:
 *   - GeoJSON Point              {"type":"Point","coordinates":[lng,lat]}
 *   - lat/lng objects            {latitude, longitude} · {lat, lng} · {lat, lon}
 *   - "lat, lng" text            "51.50, -0.12" (the Foundry geopoint string)
 *   - WKT                        POINT (lng lat)
 *   - geohash                    "gcpvj0" — only when the caller says the
 *                                column is a geo column, because any short
 *                                lowercase word is a valid geohash.
 *
 * Shapes:
 *   - GeoJSON geometry or Feature (Polygon, MultiPolygon, LineString, …)
 *   - WKT POLYGON, MULTIPOLYGON, LINESTRING, MULTILINESTRING
 *
 * Adapted from the davebettermap widget's dataset and stream services, which
 * carried two diverging copies of this; one copy here serves every source.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export type Shape = Exclude<GeoJSON.Geometry, GeoJSON.Point | GeoJSON.MultiPoint>;

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function latLng(lat: unknown, lng: unknown): LatLng | null {
  if (lat == null || lng == null || lat === "" || lng === "") {return null;}
  const a = Number(lat);
  const b = Number(lng);
  return isValidLatLng(a, b) ? { lat: a, lng: b } : null;
}

/** JSON text → value; anything else is returned unchanged. */
function maybeJson(raw: unknown): unknown {
  if (typeof raw !== "string") {return raw;}
  const text = raw.trim();
  if (!(text.startsWith("{") || text.startsWith("["))) {return raw;}
  try {
    return JSON.parse(text);
  } catch {
    return raw;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const LAT_LNG_TEXT = /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/;
const WKT_POINT = /^\s*POINT\s*Z?\s*\(\s*(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)(?:\s+[-\d.eE+]+)?\s*\)\s*$/i;
const GEOHASH = /^[0123456789bcdefghjkmnpqrstuvwxyz]{4,12}$/;

export interface PointOptions {
  /** Accept geohash strings. Only safe for a column already known to be geo. */
  geohash?: boolean;
}

export function parsePoint(raw: unknown, options: PointOptions = {}): LatLng | null {
  if (raw == null || raw === "") {return null;}
  const value = maybeJson(raw);

  if (typeof value === "string") {
    const pair = LAT_LNG_TEXT.exec(value);
    if (pair) {return latLng(pair[1], pair[2]);}
    const wkt = WKT_POINT.exec(value);
    if (wkt) {return latLng(wkt[2], wkt[1]);}
    if (options.geohash && GEOHASH.test(value.trim().toLowerCase())) {
      return decodeGeohash(value.trim().toLowerCase());
    }
    return null;
  }

  if (!isObject(value)) {return null;}

  if (value.type === "Feature" && isObject(value.geometry)) {
    return parsePoint(value.geometry, options);
  }
  if (value.type === "Point" && Array.isArray(value.coordinates)) {
    return latLng(value.coordinates[1], value.coordinates[0]);
  }
  if ("latitude" in value && "longitude" in value) {
    return latLng(value.latitude, value.longitude);
  }
  if ("lat" in value && ("lng" in value || "lon" in value)) {
    return latLng(value.lat, value.lng ?? value.lon);
  }
  return null;
}

const SHAPE_TYPES = new Set([
  "Polygon",
  "MultiPolygon",
  "LineString",
  "MultiLineString",
  "GeometryCollection",
]);

/** A shape (not a point), or null. */
export function parseShape(raw: unknown): Shape | null {
  if (raw == null || raw === "") {return null;}
  const value = maybeJson(raw);

  if (typeof value === "string") {
    return parseWktShape(value);
  }
  if (!isObject(value)) {return null;}

  if (value.type === "Feature" && isObject(value.geometry)) {
    return parseShape(value.geometry);
  }
  if (typeof value.type !== "string" || !SHAPE_TYPES.has(value.type)) {return null;}
  if (value.type === "GeometryCollection") {
    return Array.isArray(value.geometries) ? (value as unknown as Shape) : null;
  }
  return Array.isArray(value.coordinates) && value.coordinates.length > 0
    ? (value as unknown as Shape)
    : null;
}

// ── WKT ─────────────────────────────────────────────────────────────────────

function parseWktShape(text: string): Shape | null {
  const trimmed = text.trim();
  const match = /^(MULTIPOLYGON|POLYGON|MULTILINESTRING|LINESTRING)\s*Z?\s*(\(.*\))\s*$/is.exec(
    trimmed,
  );
  if (!match) {return null;}
  const kind = match[1].toUpperCase();
  const body = match[2];
  try {
    switch (kind) {
      case "LINESTRING": {
        const coordinates = coordList(stripParens(body));
        return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
      }
      case "MULTILINESTRING": {
        const coordinates = splitTopLevel(stripParens(body)).map((line) =>
          coordList(stripParens(line)),
        );
        return coordinates.every((line) => line.length >= 2)
          ? { type: "MultiLineString", coordinates }
          : null;
      }
      case "POLYGON": {
        const coordinates = polygon(body);
        return coordinates ? { type: "Polygon", coordinates } : null;
      }
      case "MULTIPOLYGON": {
        const polygons = splitTopLevel(stripParens(body)).map(polygon);
        return polygons.every((p) => p != null)
          ? { type: "MultiPolygon", coordinates: polygons as number[][][][] }
          : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function polygon(body: string): number[][][] | null {
  const rings = splitTopLevel(stripParens(body)).map((ring) => coordList(stripParens(ring)));
  return rings.length > 0 && rings.every((ring) => ring.length >= 4) ? rings : null;
}

function stripParens(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
    throw new Error("expected parentheses");
  }
  return trimmed.slice(1, -1);
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {depth++;}
    else if (ch === ")") {depth--;}
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function coordList(text: string): number[][] {
  return text.split(",").map((pair) => {
    const [x, y] = pair.trim().split(/\s+/).map(Number);
    if (!isValidLatLng(y, x)) {throw new Error(`bad coordinate "${pair}"`);}
    return [x, y];
  });
}

// ── Geohash ─────────────────────────────────────────────────────────────────

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function decodeGeohash(hash: string): LatLng | null {
  let even = true;
  let lat: [number, number] = [-90, 90];
  let lng: [number, number] = [-180, 180];
  for (const ch of hash) {
    const index = BASE32.indexOf(ch);
    if (index < 0) {return null;}
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lng : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((index >> bit) & 1) {range[0] = mid;}
      else {range[1] = mid;}
      even = !even;
    }
  }
  return latLng((lat[0] + lat[1]) / 2, (lng[0] + lng[1]) / 2);
}

// ── Shapes: vertices, anchor, bounds ─────────────────────────────────────────

/** Every [lng, lat] vertex of a shape. */
function vertices(shape: Shape): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) {return;}
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      out.push([value[0], value[1]]);
      return;
    }
    for (const child of value) {visit(child);}
  };
  if (shape.type === "GeometryCollection") {
    for (const geometry of shape.geometries) {
      if ("coordinates" in geometry) {visit(geometry.coordinates);}
    }
  } else {
    visit(shape.coordinates);
  }
  return out;
}

/** The mean of a shape's vertices — good enough to hang a marker on. */
export function shapeAnchor(shape: Shape): LatLng | null {
  const points = vertices(shape);
  if (points.length === 0) {return null;}
  const lng = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const lat = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  return latLng(lat, lng);
}

/** [[west, south], [east, north]], MapLibre's fitBounds order. */
export type Bounds = [[number, number], [number, number]];

export function boundsOf(points: Iterable<[number, number]>): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return Number.isFinite(west) ? [[west, south], [east, north]] : null;
}

export function shapeBounds(shape: Shape): Bounds | null {
  return boundsOf(vertices(shape));
}
