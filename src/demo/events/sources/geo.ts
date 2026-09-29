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
 *
 * NO REGULAR EXPRESSIONS. Every value parsed here comes out of someone's
 * dataset, and a single cell can be megabytes of WKT. The text formats are
 * read by scanning characters instead, which is linear in the input whatever
 * it holds — a backtracking pattern over data nobody vetted is a denial of
 * service waiting for the wrong row (and Foundry's code scan fails the build
 * on one). Keep it that way when adding a format.
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

// ── Scanning helpers ────────────────────────────────────────────────────────

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";
}

/** Split on runs of whitespace, dropping empty pieces. */
function splitWhitespace(text: string): string[] {
  const parts: string[] = [];
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const space = i === text.length || isWhitespace(text[i]);
    if (space && start >= 0) {
      parts.push(text.slice(start, i));
      start = -1;
    } else if (!space && start < 0) {
      start = i;
    }
  }
  return parts;
}

/** "-12", "51.5", "0.12": an optional minus, digits, an optional fraction. */
function isPlainDecimal(text: string): boolean {
  let i = text.startsWith("-") ? 1 : 0;
  let digits = 0;
  let dot = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch >= "0" && ch <= "9") {digits++;}
    else if (ch === "." && !dot && digits > 0) {dot = true;}
    else {return false;}
  }
  return digits > 0 && !text.endsWith(".");
}

/** A WKT ordinate: digits, sign, point and exponent only — never hex or "Infinity". */
function toOrdinate(part: string): number | null {
  if (part.length === 0) {return null;}
  for (const ch of part) {
    if (!((ch >= "0" && ch <= "9") || ch === "." || ch === "-" || ch === "+" || ch === "e" || ch === "E")) {
      return null;
    }
  }
  const n = Number(part);
  return Number.isFinite(n) ? n : null;
}

/**
 * "51.50, -0.12" (or with a semicolon): exactly two plain decimals and one
 * separator, as Foundry writes a geopoint string. Latitude first.
 */
function parseLatLngText(text: string): LatLng | null {
  let separator = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "," || text[i] === ";") {
      if (separator >= 0) {return null;}
      separator = i;
    }
  }
  if (separator < 0) {return null;}
  const lat = text.slice(0, separator).trim();
  const lng = text.slice(separator + 1).trim();
  return isPlainDecimal(lat) && isPlainDecimal(lng) ? latLng(lat, lng) : null;
}

/**
 * The WKT keyword at the start of `text` (case-insensitive), and what follows
 * it once a Z, M or ZM dimension marker is skipped — or null.
 */
function wktBody(text: string, keyword: string): string | null {
  const trimmed = text.trim();
  if (trimmed.slice(0, keyword.length).toUpperCase() !== keyword) {return null;}
  let rest = trimmed.slice(keyword.length).trimStart();
  const marker = rest.slice(0, 2).toUpperCase();
  if (marker === "ZM") {rest = rest.slice(2).trimStart();}
  else if (marker[0] === "Z" || marker[0] === "M") {rest = rest.slice(1).trimStart();}
  return rest.startsWith("(") && rest.endsWith(")") ? rest : null;
}

/** POINT (lng lat), with an optional third and fourth ordinate ignored. */
function parseWktPoint(text: string): LatLng | null {
  const body = wktBody(text, "POINT");
  if (!body) {return null;}
  const tokens = splitWhitespace(body.slice(1, -1));
  if (tokens.length < 2 || tokens.length > 4) {return null;}
  const ordinates = tokens.map(toOrdinate);
  if (ordinates.some((n) => n == null)) {return null;}
  return latLng(ordinates[1], ordinates[0]);
}

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

function isGeohash(text: string): boolean {
  if (text.length < 4 || text.length > 12) {return false;}
  for (const ch of text) {
    if (!BASE32.includes(ch)) {return false;}
  }
  return true;
}

export interface PointOptions {
  /** Accept geohash strings. Only safe for a column already known to be geo. */
  geohash?: boolean;
}

export function parsePoint(raw: unknown, options: PointOptions = {}): LatLng | null {
  if (raw == null || raw === "") {return null;}
  const value = maybeJson(raw);

  if (typeof value === "string") {
    const point = parseLatLngText(value) ?? parseWktPoint(value);
    if (point) {return point;}
    if (options.geohash) {
      const hash = value.trim().toLowerCase();
      if (isGeohash(hash)) {return decodeGeohash(hash);}
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

/** Longest first, so MULTIPOLYGON is not read as POLYGON's prefix and so on. */
const WKT_SHAPES = ["MULTIPOLYGON", "MULTILINESTRING", "POLYGON", "LINESTRING"] as const;

function parseWktShape(text: string): Shape | null {
  let kind: (typeof WKT_SHAPES)[number] | null = null;
  let body: string | null = null;
  for (const keyword of WKT_SHAPES) {
    body = wktBody(text, keyword);
    if (body) {
      kind = keyword;
      break;
    }
  }
  if (!kind || !body) {return null;}
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
    const [x, y] = splitWhitespace(pair).map(toOrdinate);
    if (x == null || y == null || !isValidLatLng(y, x)) {
      throw new Error(`bad coordinate "${pair}"`);
    }
    return [x, y];
  });
}

// ── Geohash ─────────────────────────────────────────────────────────────────

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
