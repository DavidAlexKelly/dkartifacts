/**
 * Records → events and areas.
 *
 * Every source — a dataset's rows, a media set's GeoJSON features, a stream's
 * records — ends up here as a flat list of records with unknown column names.
 * This module decides, once per source, which columns mean what (`detectFields`)
 * and then reads every record through that mapping (`interpretRecords`).
 *
 * The rule for what a record becomes:
 *
 *   located at a POINT  →  an event, a marker on the map
 *   located by a SHAPE  →  an area, drawn under the events (a zone, a
 *                          boundary, a route), clickable for its fields
 *   no location         →  skipped, and counted, so the page can say so
 *
 * Detection is by column name first and then confirmed against sample values:
 * a column called "time" that holds no parseable times is not the time column.
 * Everything detected is reported back (`FieldMap`), so the page can show what
 * it guessed rather than leaving someone to wonder why nothing appeared.
 */

import { CATEGORIES } from "../eventsLayer";
import {
  SEVERITIES,
  type EventCategory,
  type EventMetric,
  type MonitorEvent,
  type Severity,
} from "../mockEvents";
import { parsePoint, parseShape, isValidLatLng, type LatLng, type Shape } from "./geo";

export type GeoMapping =
  | { kind: "latlng"; lat: string; lng: string }
  | { kind: "point"; field: string }
  | { kind: "shape"; field: string };

export interface FieldMap {
  geo: GeoMapping | null;
  id?: string;
  title?: string;
  category?: string;
  /** Other category-like columns, tried when the main one says nothing. */
  categoryAlternates?: string[];
  severity?: string;
  time?: string;
  summary?: string;
  place?: string;
  country?: string;
  source?: string;
  magnitude?: string;
  casualties?: string;
}

export interface MonitorArea {
  id: string;
  sourceKey: string;
  name: string;
  category: EventCategory;
  geometry: Shape;
  source: string;
  fields: Record<string, unknown>;
}

export interface InterpretContext {
  sourceKey: string;
  /** Human name for the source, used where a record has no source of its own. */
  sourceLabel: string;
  /** Category for records whose own fields say nothing recognisable. */
  defaultCategory?: EventCategory;
  /** For sanity-checking times: anything more than a year ahead is rejected. */
  now: number;
  live?: boolean;
  /**
   * Position of the first record in the source, for records with no id of
   * their own. A stream read in batches passes its running count, so a record
   * keeps one id however it arrived.
   */
  firstIndex?: number;
  /**
   * The largest value in the severity column, which sets the scale a number
   * is read on. Computed from `records` when absent; a stream read in batches
   * passes one computed over everything it has seen, so "3" means the same
   * in every batch.
   */
  severityMax?: number;
}

export interface Interpreted {
  events: MonitorEvent[];
  areas: MonitorArea[];
  /** Records with no usable location. */
  skipped: number;
}

// ── Column names ────────────────────────────────────────────────────────────

/** "Event_Time", "event-time" and "eventTime" all compare as "eventtime". */
function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface Hints {
  exact: string[];
  contains?: string[];
}

const HINTS = {
  id: {
    exact: ["id", "eventid", "uid", "uuid", "key", "incidentid", "recordid", "objectid", "eventidcnty", "entityid", "featureid"],
    // Things that move: a stream of positions keyed by one of these is a set
    // of tracks, each record replacing that entity's last.
    contains: ["callsign", "mmsi", "icao", "imo", "registration", "tailnumber", "vesselid", "vehicleid", "trackid", "deviceid", "assetid", "unitid"],
  },
  title: { exact: ["title", "headline", "name", "eventname", "label", "subject", "displayname"], contains: ["title", "headline"] },
  category: {
    exact: ["category", "eventtype", "type", "kind", "class", "classification", "incidenttype", "disastertype", "hazard", "hazardtype", "subeventtype"],
    contains: ["category", "eventtype", "incidenttype"],
  },
  severity: {
    exact: ["severity", "priority", "level", "threatlevel", "risk", "risklevel", "alertlevel", "impact", "intensity"],
    contains: ["severity", "priority", "threat", "alert"],
  },
  time: {
    exact: ["timestamp", "time", "datetime", "date", "eventtime", "eventdate", "eventtimestamp", "occurredat", "createdat", "reportedat", "starttime", "ts", "updatedat"],
    contains: ["timestamp", "datetime", "date", "time"],
  },
  summary: {
    exact: ["description", "summary", "details", "notes", "text", "body", "content", "message", "narrative"],
    contains: ["description", "summary", "notes"],
  },
  place: {
    exact: ["place", "placename", "locationname", "location", "city", "town", "admin1", "region", "province", "state", "area", "site", "locality", "address"],
  },
  country: { exact: ["country", "countryname", "nation"], contains: ["country"] },
  source: { exact: ["source", "sourcename", "provider", "feed", "publisher", "reporter"] },
  magnitude: { exact: ["mag", "magnitude"] },
  casualties: {
    exact: ["fatalities", "casualties", "deaths", "killed", "dead"],
    contains: ["fatalit", "casualt", "death"],
  },
} satisfies Record<string, Hints>;

const LAT_NAMES = ["lat", "latitude", "y", "decimallatitude", "latdd"];
const LNG_NAMES = ["lng", "lon", "long", "longitude", "x", "decimallongitude", "londd"];

const POINT_NAME_HINTS = ["geopoint", "latlng", "latlong", "coordinates", "coord", "position", "point", "location", "geo"];
const SHAPE_NAME_HINTS = ["geometry", "geom", "shape", "polygon", "boundary", "border", "wkt", "geojson", "area", "zone", "footprint"];

function candidates(fields: string[], hints: Hints): string[] {
  const exact = fields.filter((f) => hints.exact.includes(norm(f)));
  const contains = (hints.contains ?? []).flatMap((h) =>
    fields.filter((f) => norm(f).includes(h) && !exact.includes(f)),
  );
  return [...exact, ...contains];
}

/** The first candidate whose sample values satisfy `accept`, if any do. */
function pick(
  fields: string[],
  hints: Hints,
  sample: Record<string, unknown>[],
  accept: (value: unknown) => boolean,
  exclude: Set<string>,
): string | undefined {
  for (const field of candidates(fields, hints)) {
    if (exclude.has(field)) {continue;}
    const values = sample.map((row) => row[field]).filter((v) => v != null && v !== "");
    if (values.length > 0 && values.some(accept)) {return field;}
  }
  return undefined;
}

const isText = (value: unknown): boolean =>
  typeof value === "string" ? value.trim() !== "" && !value.trim().startsWith("{") : typeof value === "number";
const isNumeric = (value: unknown): boolean => toNumber(value) != null;

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {return Number.isFinite(value) ? value : null;}
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ── Location ────────────────────────────────────────────────────────────────

function detectGeo(fields: string[], sample: Record<string, unknown>[]): GeoMapping | null {
  // Separate latitude and longitude columns: the commonest shape for event
  // tables, and one the widget this is adapted from did not handle.
  const lat = fields.find((f) => LAT_NAMES.includes(norm(f))) ?? fields.find((f) => norm(f).endsWith("latitude"));
  const lng = fields.find((f) => LNG_NAMES.includes(norm(f))) ?? fields.find((f) => norm(f).endsWith("longitude"));
  if (lat && lng && sample.some((row) => {
    const a = toNumber(row[lat]);
    const b = toNumber(row[lng]);
    return a != null && b != null && isValidLatLng(a, b);
  })) {
    return { kind: "latlng", lat, lng };
  }

  // One column holding the whole location. Score every column on the sample
  // and take the one that parses most often, preferring named geo columns.
  let best: { mapping: GeoMapping; score: number } | null = null;
  for (const field of fields) {
    const name = norm(field);
    const pointNamed = POINT_NAME_HINTS.some((h) => name.includes(h));
    const shapeNamed = SHAPE_NAME_HINTS.some((h) => name.includes(h));
    let points = 0;
    let shapes = 0;
    for (const row of sample) {
      const value = row[field];
      if (parseShape(value)) {shapes++;}
      else if (parsePoint(value, { geohash: pointNamed })) {points++;}
    }
    if (points + shapes === 0) {continue;}
    const bonus = pointNamed || shapeNamed ? 0.5 : 0;
    const score = points + shapes + bonus;
    const mapping: GeoMapping =
      shapes > points ? { kind: "shape", field } : { kind: "point", field };
    if (!best || score > best.score) {best = { mapping, score };}
  }
  return best?.mapping ?? null;
}

function locate(
  record: Record<string, unknown>,
  geo: GeoMapping,
  geohash: boolean,
): { point: LatLng } | { shape: Shape } | null {
  if (geo.kind === "latlng") {
    const a = toNumber(record[geo.lat]);
    const b = toNumber(record[geo.lng]);
    return a != null && b != null && isValidLatLng(a, b) ? { point: { lat: a, lng: b } } : null;
  }
  // A geo column can mix points and shapes (a GeoJSON column often does), so
  // each value is read for what it is rather than what the column mostly is.
  const value = record[geo.field];
  const shape = parseShape(value);
  if (shape) {return { shape };}
  const point = parsePoint(value, { geohash });
  return point ? { point } : null;
}

// ── Detection ───────────────────────────────────────────────────────────────

/** How many records to look at when deciding what the columns mean. */
export const SAMPLE_SIZE = 50;

export function detectFields(
  fields: string[],
  records: Record<string, unknown>[],
): FieldMap {
  const sample = records.slice(0, SAMPLE_SIZE);
  const geo = detectGeo(fields, sample);
  const used = new Set<string>();
  if (geo?.kind === "latlng") {
    used.add(geo.lat);
    used.add(geo.lng);
  } else if (geo) {
    used.add(geo.field);
  }

  const take = (key: keyof typeof HINTS, accept: (value: unknown) => boolean) => {
    const field = pick(fields, HINTS[key], sample, accept, used);
    if (field) {used.add(field);}
    return field;
  };

  // Order matters where hints overlap: "location" is a place name only once
  // it is known not to be the geo column, and "name" is a title before it is
  // anything else.
  const map: FieldMap = { geo };
  map.time = take("time", (v) => parseTime(v, Date.now()) != null);
  map.id = take("id", isText);
  map.title = take("title", isText);
  map.category = take("category", isText);
  const alternates = candidates(fields, HINTS.category).filter((f) => !used.has(f));
  if (alternates.length > 0) {map.categoryAlternates = alternates;}
  map.severity = take("severity", (v) => isNumeric(v) || severityFromText(String(v)) != null);
  map.magnitude = take("magnitude", isNumeric);
  map.casualties = take("casualties", isNumeric);
  map.summary = take("summary", isText);
  map.country = take("country", isText);
  map.place = take("place", isText);
  map.source = take("source", isText);
  return map;
}

// ── Values ──────────────────────────────────────────────────────────────────

const YEAR = 365 * 24 * 60 * 60 * 1000;
const EARLIEST = Date.UTC(1900, 0, 1);

/** Epoch ms from an ISO string, a date string, or epoch seconds / ms. */
export function parseTime(value: unknown, now: number): number | null {
  if (value == null || value === "") {return null;}
  let ms: number | null = null;
  const n = toNumber(value);
  if (n != null) {
    if (Number.isInteger(n) && n >= 1900 && n <= 2200) {
      // A bare year: the start of it, rather than 2,024 seconds after 1970.
      ms = Date.UTC(n, 0, 1);
    } else if (Math.abs(n) < 1e8) {
      // Too small to be an epoch in either unit (1e8 s is 1973): a count or
      // an id, not a time.
      return null;
    } else {
      // Seconds until 1e11 (the year 5138); milliseconds after.
      ms = Math.abs(n) < 1e11 ? n * 1000 : n;
    }
  } else if (typeof value === "string") {
    const parsed = Date.parse(value.trim());
    ms = Number.isFinite(parsed) ? parsed : null;
  }
  if (ms == null || ms < EARLIEST || ms > now + YEAR) {return null;}
  return ms;
}

const CATEGORY_KEYWORDS: Array<[Exclude<EventCategory, "other">, RegExp]> = [
  ["earthquake", /\b(earthquakes?|quakes?|seismic|tremors?|tsunami)\b/],
  ["wildfire", /\b(wild ?fires?|bush ?fires?|forest fires?|fires?|blaze|burn(ing|ed)?|thermal anomal)/],
  ["weather", /\b(floods?|flooding|storms?|cyclones?|hurricanes?|typhoons?|tornado(es)?|landslides?|avalanches?|drought|heat ?waves?|weather|volcan\w*|blizzard)\b/],
  ["outbreak", /\b(outbreaks?|disease|epidemic|pandemic|cholera|ebola|measles|mpox|dengue|virus|covid|health emergency)\b/],
  ["cyber", /\b(cyber\w*|ransomware|ddos|malware|phishing|data breach|breach|hack(ed|ing)?)\b/],
  // Before protest: "airstrike" and "drone strike" are violence, and a bare
  // "strike" further down is a labour one.
  ["conflict", /\b(battles?|clash(es)?|attacks?|armed|violence|explosions?|remote violence|shelling|air ?strikes?|drone strikes?|bombing|conflict|war|fighting|ambush|terror\w*|shooting|killing|abduction)\b/],
  ["protest", /\b(protests?|riots?|demonstrations?|strikes?|unrest|rall(y|ies)|march(es)?|civil disorder)\b/],
  ["infrastructure", /\b(outages?|power cut|blackout|cables?|pipelines?|ports?|rail|bridges?|infrastructure|grid|telecoms?|disruption)\b/],
  ["military", /\b(military|naval|navy|army|exercises?|troops?|deployments?|patrol|warships?|carrier|missile test|strategic developments?|air defen[cs]e|isr)\b/],
];

export function categoryFrom(...texts: Array<unknown>): EventCategory | null {
  for (const text of texts) {
    if (text == null || text === "") {continue;}
    const lower = String(text).toLowerCase().trim();
    // A source that already uses these category names, or their labels.
    for (const [key, meta] of Object.entries(CATEGORIES)) {
      if (lower === key || lower === meta.label.toLowerCase()) {return key as EventCategory;}
    }
    for (const [category, pattern] of CATEGORY_KEYWORDS) {
      if (pattern.test(lower)) {return category;}
    }
  }
  return null;
}

export function severityFromText(text: string): Severity | null {
  const lower = text.toLowerCase().trim();
  if (/\b(critical|extreme|severe|catastrophic|emergency|red|very high|p0|sev ?1)\b/.test(lower)) {return "critical";}
  if (/\b(high|major|orange|serious|p1|sev ?2)\b/.test(lower)) {return "high";}
  if (/\b(medium|moderate|elevated|amber|yellow|p2|sev ?3)\b/.test(lower)) {return "moderate";}
  if (/\b(low|minor|green|info|informational|negligible|p3|p4|sev ?4)\b/.test(lower)) {return "low";}
  return null;
}

/**
 * A numeric severity on the column's own scale. The scale is read from the
 * largest value in the source, so "4" means critical in a 1–4 column and high
 * in a 1–5 one.
 */
function severityFromNumber(value: number, max: number): Severity {
  const fraction = max <= 1 ? value : max <= 4 ? (value - 1) / 3 : max <= 5 ? (value - 1) / 4 : max <= 10 ? value / 10 : value / 100;
  if (fraction >= 0.85) {return "critical";}
  if (fraction >= 0.6) {return "high";}
  if (fraction >= 0.3) {return "moderate";}
  return "low";
}

function severityFromMagnitude(magnitude: number): Severity {
  if (magnitude >= 6.5) {return "critical";}
  if (magnitude >= 5.5) {return "high";}
  if (magnitude >= 4.5) {return "moderate";}
  return "low";
}

function severityFromCasualties(count: number): Severity {
  if (count >= 50) {return "critical";}
  if (count >= 10) {return "high";}
  if (count >= 1) {return "moderate";}
  return "low";
}

function text(value: unknown): string {
  if (value == null) {return "";}
  if (typeof value === "string") {return value.trim();}
  if (typeof value === "number" || typeof value === "boolean") {return String(value);}
  return "";
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1).trimEnd()}…` : value;
}

/** "fatalities_count" → "Fatalities count". */
export function prettyFieldName(field: string): string {
  const spaced = field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatNumber(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString("en-GB")
    : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

// ── Interpretation ──────────────────────────────────────────────────────────

/** The largest numeric value in the severity column, or -Infinity. */
export function severityScaleOf(records: Record<string, unknown>[], map: FieldMap): number {
  if (!map.severity) {return -Infinity;}
  let max = -Infinity;
  for (const record of records) {
    const n = toNumber(record[map.severity]);
    if (n != null && n > max) {max = n;}
  }
  return max;
}

/**
 * The detected mapping with a chosen title column in place of the detected
 * one. The chosen column also stops counting as a metric or anything else,
 * since `mapped` is built from the map's values.
 */
export function withTitle(map: FieldMap, titleField: string | undefined): FieldMap {
  return titleField ? { ...map, title: titleField } : map;
}

const METRIC_LIMIT = 4;

export function interpretRecords(
  records: Record<string, unknown>[],
  map: FieldMap,
  context: InterpretContext,
): Interpreted {
  const events: MonitorEvent[] = [];
  const areas: MonitorArea[] = [];
  let skipped = 0;
  if (!map.geo) {
    return { events, areas, skipped: records.length };
  }

  const severityMax = context.severityMax ?? severityScaleOf(records, map);
  const geohash =
    map.geo.kind === "point" &&
    POINT_NAME_HINTS.some((h) => norm((map.geo as { field: string }).field).includes(h));

  const mapped = new Set(
    Object.values(map).filter((v): v is string => typeof v === "string"),
  );
  if (map.geo.kind === "latlng") {
    mapped.add(map.geo.lat);
    mapped.add(map.geo.lng);
  } else {
    mapped.add(map.geo.field);
  }

  records.forEach((record, index) => {
    const located = locate(record, map.geo!, geohash);
    if (!located) {
      skipped++;
      return;
    }

    const title = text(map.title && record[map.title]);
    const summary = text(map.summary && record[map.summary]);
    const categoryText = text(map.category && record[map.category]);
    const category =
      categoryFrom(categoryText, ...(map.categoryAlternates ?? []).map((f) => record[f])) ??
      context.defaultCategory ??
      categoryFrom(title, summary) ??
      "other";
    const place = text(map.place && record[map.place]);
    const country = text(map.country && record[map.country]);
    const ownId = text(map.id && record[map.id]);
    const id = `${context.sourceKey}:${ownId || (context.firstIndex ?? 0) + index}`;
    const source = text(map.source && record[map.source]) || context.sourceLabel;

    if ("shape" in located) {
      areas.push({
        id,
        sourceKey: context.sourceKey,
        name: title || place || categoryText || `Area ${index + 1}`,
        category,
        geometry: located.shape,
        source,
        fields: record,
      });
      return;
    }

    const severity = readSeverity(record, map, severityMax);
    const time = map.time ? parseTime(record[map.time], context.now) : null;

    // A title column if there is one; otherwise what and where ("Battles —
    // Pokrovsk", "ISR flight — RCH101"), which reads better in a feed than
    // the first line of a note.
    const where = place || ownId;
    const label = CATEGORIES[category].label;
    const fallbackTitle =
      categoryText && where
        ? `${categoryText.charAt(0).toUpperCase()}${categoryText.slice(1)} — ${where}`
        : summary || (where ? `${label} — ${where}` : label);
    events.push({
      id,
      category,
      severity,
      title: truncate(title || fallbackTitle, 120),
      summary: summary && summary !== title ? summary : "",
      place,
      country,
      lon: located.point.lng,
      lat: located.point.lat,
      time,
      source,
      metrics: readMetrics(record, map, mapped),
      sourceKey: context.sourceKey,
      live: context.live,
      fields: record,
    });
  });

  return { events, areas, skipped };
}

function readSeverity(
  record: Record<string, unknown>,
  map: FieldMap,
  severityMax: number,
): Severity {
  if (map.severity) {
    const raw = record[map.severity];
    const n = toNumber(raw);
    if (n != null) {return severityFromNumber(n, severityMax);}
    const fromText = severityFromText(text(raw));
    if (fromText) {return fromText;}
  }
  const magnitude = map.magnitude ? toNumber(record[map.magnitude]) : null;
  if (magnitude != null) {return severityFromMagnitude(magnitude);}
  const casualties = map.casualties ? toNumber(record[map.casualties]) : null;
  if (casualties != null) {return severityFromCasualties(casualties);}
  return SEVERITIES[0];
}

/** The figures worth a tile: magnitude and casualties first, then other numbers. */
function readMetrics(
  record: Record<string, unknown>,
  map: FieldMap,
  mapped: Set<string>,
): EventMetric[] {
  const metrics: EventMetric[] = [];
  for (const field of [map.magnitude, map.casualties]) {
    const n = field ? toNumber(record[field]) : null;
    if (field && n != null) {metrics.push({ label: prettyFieldName(field), value: formatNumber(n) });}
  }
  for (const [field, value] of Object.entries(record)) {
    if (metrics.length >= METRIC_LIMIT) {break;}
    if (mapped.has(field) || /(^|_)(id|lat|lng|lon|x|y)$/i.test(field)) {continue;}
    const n = toNumber(value);
    if (n != null && typeof value !== "boolean") {
      metrics.push({ label: prettyFieldName(field), value: formatNumber(n) });
    }
  }
  return metrics;
}

// ── Record shapes ───────────────────────────────────────────────────────────

/**
 * Lift nested objects to the top level: a stream record of
 * `{ timestamp, value: "{\"lat\":…}" }` becomes `{ timestamp, lat, … }`, and a
 * struct column becomes its fields — so a payload's callsign and alert level
 * are found by the same detection as a table's columns. GeoJSON geometries
 * and Features are left whole: their "type" must not be mistaken for the
 * event type, and they are read as one location. Keys already at the top
 * level win.
 */
export function flattenRecord(record: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...record };
  for (const [key, raw] of Object.entries(record)) {
    let value = raw;
    if (typeof raw === "string" && raw.trim().startsWith("{")) {
      try {
        value = JSON.parse(raw);
      } catch {
        continue;
      }
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {continue;}
    if (isGeoJson(value as Record<string, unknown>)) {continue;}
    for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
      if (!(inner in flat)) {flat[inner] = innerValue;}
    }
    delete flat[key];
  }
  return flat;
}

function isGeoJson(value: Record<string, unknown>): boolean {
  return (
    typeof value.type === "string" &&
    ("coordinates" in value || "geometry" in value || "geometries" in value || "features" in value)
  );
}

/** A GeoJSON FeatureCollection's features as records: properties plus a `geometry`. */
export function featuresToRecords(collection: unknown): Record<string, unknown>[] {
  const features = extractFeatures(collection);
  return features.map((feature) => ({
    ...(typeof feature.properties === "object" && feature.properties ? feature.properties : {}),
    // Under a name no properties object is likely to use, so it is found as
    // the geo column and not mistaken for a property.
    __geometry: feature.geometry,
    ...(feature.id != null ? { __featureId: feature.id } : {}),
  }));
}

interface FeatureLike {
  id?: unknown;
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
}

function extractFeatures(value: unknown): FeatureLike[] {
  if (typeof value !== "object" || value === null) {return [];}
  const object = value as { type?: unknown; features?: unknown; geometry?: unknown };
  if (object.type === "FeatureCollection" && Array.isArray(object.features)) {
    return (object.features as FeatureLike[]).flatMap(explodeMultiPoint);
  }
  if (object.type === "Feature") {return explodeMultiPoint(object as FeatureLike);}
  if (typeof object.type === "string") {
    return explodeMultiPoint({ geometry: value, properties: {} });
  }
  return [];
}

/** One event per point: a MultiPoint of incidents is several incidents. */
function explodeMultiPoint(feature: FeatureLike): FeatureLike[] {
  const geometry = feature.geometry as { type?: unknown; coordinates?: unknown } | undefined;
  if (geometry?.type !== "MultiPoint" || !Array.isArray(geometry.coordinates)) {return [feature];}
  return (geometry.coordinates as unknown[]).map((coordinates, index) => ({
    ...feature,
    id: feature.id != null ? `${String(feature.id)}.${index}` : undefined,
    geometry: { type: "Point", coordinates },
  }));
}

/** GeoJSON, a bare array of records, or an object wrapping one. */
export function recordsFromJson(json: unknown): Record<string, unknown>[] {
  const geo = featuresToRecords(json);
  if (geo.length > 0) {return geo;}
  if (Array.isArray(json)) {
    return json.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
  }
  if (typeof json === "object" && json !== null) {
    for (const value of Object.values(json)) {
      if (Array.isArray(value) && value.some((v) => typeof v === "object" && v !== null)) {
        return recordsFromJson(value);
      }
    }
  }
  return [];
}
