/**
 * Mock events for the event monitor demo.
 *
 * Deterministic: the same seed and `now` always give the same events, so the
 * page, its tests and anyone's screenshot agree. Events are scattered around
 * real hotspots rather than uniformly, because clustering is the thing being
 * demonstrated and a uniform scatter never clusters interestingly — dense
 * theatres (eastern Ukraine, Gaza, Sudan) break apart over several zoom levels,
 * while isolated earthquakes stand alone from the start.
 *
 * None of this is real. Titles, figures and sources are templated, and the
 * page labels them as mock data.
 */

import type { BuiltinCategory } from "./categories";
import type { MediaRef } from "./sources/media";

/**
 * A category id: one of the built-ins (see categories.ts) or a custom one a
 * Workshop module defined, "custom:…".
 */
export type EventCategory = string;

/** The categories mock data is written in: the built-ins, less "other". */
type MockCategory = Exclude<BuiltinCategory, "other">;

export type Severity = "low" | "moderate" | "high" | "critical";

export const SEVERITIES: readonly Severity[] = [
  "low",
  "moderate",
  "high",
  "critical",
];

/** 1 (low) to 4 (critical); what the map sorts and clusters on. */
export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity) + 1;
}

export interface EventMetric {
  label: string;
  value: string;
}

export interface MonitorEvent {
  id: string;
  category: EventCategory;
  severity: Severity;
  title: string;
  summary: string;
  place: string;
  country: string;
  lon: number;
  lat: number;
  /** Epoch milliseconds, or null when the source gave no usable time. */
  time: number | null;
  source: string;
  metrics: EventMetric[];
  /** Which configured source this came from; absent for mock events. */
  sourceKey?: string;
  /** Arrived on a stream after the page loaded. */
  live?: boolean;
  /** The record as the source had it, for the details panel. */
  fields?: Record<string, unknown>;
  /**
   * The source's own word for the category ("Battles"), whatever category
   * it was sorted into — what a value-to-category mapping is keyed on.
   */
  categoryValue?: string;
  /** Media items the record references, previewed in the details panel. */
  media?: MediaRef[];
  /**
   * The primary key as its source knows it — the value of its id column —
   * for the Workshop selected-event variable. Absent when the source has no
   * id column; `primaryKey()` then falls back to `id`.
   */
  pk?: string;
}

/** What the selected-event variable holds for an event or area. */
export function primaryKey(item: { id: string; pk?: string }): string {
  return item.pk ?? item.id;
}

interface Hotspot {
  place: string;
  country: string;
  lon: number;
  lat: number;
  /** Degrees of jitter around the centre. Small for cities, large for regions. */
  spread: number;
  /** Relative likelihood of an event landing here. */
  weight: number;
  /** Open water: military activity here is naval, not a column on a road. */
  sea?: boolean;
  categories: MockCategory[];
}

const HOTSPOTS: Hotspot[] = [
  // Conflict theatres — heavy, so they cluster and split over several zooms.
  { place: "Donetsk Oblast", country: "Ukraine", lon: 37.8, lat: 48.0, spread: 1.2, weight: 14, categories: ["conflict", "conflict", "military", "infrastructure"] },
  { place: "Kharkiv", country: "Ukraine", lon: 36.23, lat: 49.99, spread: 0.6, weight: 6, categories: ["conflict", "infrastructure", "military"] },
  { place: "Kyiv", country: "Ukraine", lon: 30.52, lat: 50.45, spread: 0.3, weight: 4, categories: ["conflict", "infrastructure", "cyber"] },
  { place: "Zaporizhzhia", country: "Ukraine", lon: 35.14, lat: 47.84, spread: 0.8, weight: 5, categories: ["conflict", "military"] },
  { place: "Gaza Strip", country: "Palestine", lon: 34.4, lat: 31.45, spread: 0.15, weight: 10, categories: ["conflict", "conflict", "outbreak", "infrastructure"] },
  { place: "Southern Lebanon", country: "Lebanon", lon: 35.4, lat: 33.25, spread: 0.3, weight: 4, categories: ["conflict", "military"] },
  { place: "Khartoum", country: "Sudan", lon: 32.53, lat: 15.6, spread: 0.6, weight: 7, categories: ["conflict", "outbreak", "infrastructure"] },
  { place: "North Darfur", country: "Sudan", lon: 25.3, lat: 13.6, spread: 1.5, weight: 6, categories: ["conflict", "conflict", "outbreak"] },
  { place: "North Kivu", country: "DR Congo", lon: 29.2, lat: -1.2, spread: 0.9, weight: 7, categories: ["conflict", "outbreak", "outbreak"] },
  { place: "Sahel (Mali–Burkina Faso)", country: "Mali", lon: -1.5, lat: 14.5, spread: 2.5, weight: 7, categories: ["conflict", "conflict", "military"] },
  { place: "Sagaing Region", country: "Myanmar", lon: 95.6, lat: 22.5, spread: 1.4, weight: 5, categories: ["conflict", "protest"] },
  { place: "Port-au-Prince", country: "Haiti", lon: -72.33, lat: 18.54, spread: 0.2, weight: 4, categories: ["conflict", "protest", "outbreak"] },
  { place: "Sana'a", country: "Yemen", lon: 44.2, lat: 15.35, spread: 0.8, weight: 3, categories: ["conflict", "outbreak"] },
  { place: "Red Sea shipping lane", country: "International waters", lon: 41.5, lat: 15.5, spread: 1.8, weight: 4, sea: true, categories: ["military", "infrastructure"] },

  // Military posture.
  { place: "Taiwan Strait", country: "International waters", lon: 119.8, lat: 24.3, spread: 1.0, weight: 4, sea: true, categories: ["military", "military", "cyber"] },
  { place: "South China Sea (Spratlys)", country: "International waters", lon: 114.5, lat: 10.0, spread: 1.8, weight: 3, sea: true, categories: ["military"] },
  { place: "Korean DMZ", country: "South Korea", lon: 127.0, lat: 38.1, spread: 0.4, weight: 3, categories: ["military", "cyber"] },
  { place: "Baltic Sea", country: "International waters", lon: 19.5, lat: 57.5, spread: 1.8, weight: 4, sea: true, categories: ["military", "infrastructure", "infrastructure"] },
  { place: "Black Sea", country: "International waters", lon: 33.0, lat: 43.5, spread: 1.6, weight: 3, sea: true, categories: ["military", "conflict"] },

  // Unrest.
  { place: "Paris", country: "France", lon: 2.35, lat: 48.86, spread: 0.1, weight: 3, categories: ["protest", "protest", "cyber"] },
  { place: "Nairobi", country: "Kenya", lon: 36.82, lat: -1.29, spread: 0.15, weight: 3, categories: ["protest", "protest"] },
  { place: "Buenos Aires", country: "Argentina", lon: -58.38, lat: -34.6, spread: 0.15, weight: 2, categories: ["protest"] },
  { place: "Dhaka", country: "Bangladesh", lon: 90.41, lat: 23.81, spread: 0.2, weight: 3, categories: ["protest", "weather"] },
  { place: "Tbilisi", country: "Georgia", lon: 44.79, lat: 41.72, spread: 0.1, weight: 2, categories: ["protest"] },

  // Seismic — mostly isolated points on the plate boundaries.
  { place: "Honshu east coast", country: "Japan", lon: 142.4, lat: 38.3, spread: 1.6, weight: 4, categories: ["earthquake"] },
  { place: "Sumatra", country: "Indonesia", lon: 99.5, lat: 0.5, spread: 2.5, weight: 3, categories: ["earthquake", "weather"] },
  { place: "Atacama", country: "Chile", lon: -70.3, lat: -24.5, spread: 2.0, weight: 3, categories: ["earthquake"] },
  { place: "Eastern Anatolia", country: "Türkiye", lon: 38.3, lat: 38.0, spread: 1.5, weight: 2, categories: ["earthquake"] },
  { place: "Gorkha", country: "Nepal", lon: 84.7, lat: 28.2, spread: 1.0, weight: 2, categories: ["earthquake", "weather"] },
  { place: "Alaska Peninsula", country: "United States", lon: -156.0, lat: 56.5, spread: 2.5, weight: 2, categories: ["earthquake"] },
  { place: "Reykjanes Peninsula", country: "Iceland", lon: -22.3, lat: 63.9, spread: 0.3, weight: 2, categories: ["earthquake", "infrastructure"] },

  // Fire and weather.
  { place: "Northern California", country: "United States", lon: -121.5, lat: 39.5, spread: 1.4, weight: 4, categories: ["wildfire", "wildfire", "infrastructure"] },
  { place: "British Columbia interior", country: "Canada", lon: -121.0, lat: 51.5, spread: 2.0, weight: 3, categories: ["wildfire"] },
  { place: "Attica", country: "Greece", lon: 23.8, lat: 38.1, spread: 0.6, weight: 2, categories: ["wildfire"] },
  { place: "New South Wales", country: "Australia", lon: 150.3, lat: -33.2, spread: 1.5, weight: 3, categories: ["wildfire", "weather"] },
  { place: "Eastern Visayas", country: "Philippines", lon: 125.0, lat: 11.2, spread: 1.5, weight: 3, categories: ["weather", "weather"] },
  { place: "Gulf Coast", country: "United States", lon: -90.5, lat: 29.8, spread: 2.0, weight: 3, categories: ["weather", "infrastructure"] },
  { place: "Lesser Antilles", country: "Caribbean", lon: -61.5, lat: 15.5, spread: 2.0, weight: 2, categories: ["weather"] },
  // Western Norway is inside the DEM this repo serves from Foundry, so zooming
  // into these shows real relief under the events.
  { place: "Jotunheimen", country: "Norway", lon: 8.6, lat: 61.55, spread: 0.5, weight: 3, categories: ["weather", "weather", "infrastructure"] },
  { place: "Sognefjord", country: "Norway", lon: 6.8, lat: 61.1, spread: 0.5, weight: 2, categories: ["weather", "infrastructure"] },

  // Health.
  { place: "Lagos", country: "Nigeria", lon: 3.38, lat: 6.52, spread: 0.3, weight: 3, categories: ["outbreak", "protest"] },
  { place: "Kerala", country: "India", lon: 76.3, lat: 10.0, spread: 0.8, weight: 2, categories: ["outbreak", "weather"] },

  // Cyber and infrastructure — capitals and chokepoints.
  { place: "Washington, D.C.", country: "United States", lon: -77.04, lat: 38.9, spread: 0.2, weight: 3, categories: ["cyber", "cyber", "protest"] },
  { place: "London", country: "United Kingdom", lon: -0.12, lat: 51.51, spread: 0.2, weight: 3, categories: ["cyber", "protest", "infrastructure"] },
  { place: "Frankfurt", country: "Germany", lon: 8.68, lat: 50.11, spread: 0.2, weight: 2, categories: ["cyber", "infrastructure"] },
  { place: "Tallinn", country: "Estonia", lon: 24.75, lat: 59.44, spread: 0.1, weight: 2, categories: ["cyber"] },
  { place: "Singapore Strait", country: "Singapore", lon: 103.85, lat: 1.25, spread: 0.3, weight: 2, categories: ["infrastructure", "cyber"] },
  { place: "Suez Canal", country: "Egypt", lon: 32.35, lat: 30.4, spread: 0.4, weight: 2, categories: ["infrastructure", "military"] },
  { place: "Gauteng", country: "South Africa", lon: 28.05, lat: -26.2, spread: 0.5, weight: 2, categories: ["infrastructure", "protest"] },
];

const SOURCES: Record<MockCategory, string[]> = {
  conflict: ["ACLED (mock)", "Field reporting (mock)", "OSINT aggregation (mock)"],
  protest: ["ACLED (mock)", "Local media (mock)"],
  military: ["ADS-B feed (mock)", "AIS feed (mock)", "Defence ministry statement (mock)"],
  earthquake: ["USGS (mock)", "EMSC (mock)"],
  wildfire: ["NASA FIRMS (mock)", "Civil protection (mock)"],
  weather: ["GDACS (mock)", "National met service (mock)"],
  outbreak: ["WHO DON (mock)", "ProMED (mock)"],
  cyber: ["CERT advisory (mock)", "Threat intel feed (mock)"],
  infrastructure: ["Grid operator (mock)", "Cable operator notice (mock)", "Port authority (mock)"],
};

type Rng = () => number;

/** mulberry32: small, fast, and good enough to scatter points. */
function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function between(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

function int(rng: Rng, min: number, max: number): number {
  return Math.floor(between(rng, min, max + 1));
}

function pickHotspot(rng: Rng): Hotspot {
  const total = HOTSPOTS.reduce((sum, h) => sum + h.weight, 0);
  let roll = rng() * total;
  for (const hotspot of HOTSPOTS) {
    roll -= hotspot.weight;
    if (roll <= 0) {return hotspot;}
  }
  return HOTSPOTS[HOTSPOTS.length - 1];
}

/** Skewed low: most events are minor, a few are critical. */
function pickSeverity(rng: Rng): Severity {
  const roll = rng();
  if (roll < 0.42) {return "low";}
  if (roll < 0.74) {return "moderate";}
  if (roll < 0.93) {return "high";}
  return "critical";
}

interface Written {
  title: string;
  summary: string;
  metrics: EventMetric[];
}

/** Scales a figure with severity so a "critical" event reads as one. */
function scaled(rng: Rng, severity: Severity, base: number): number {
  return Math.round(base * severityRank(severity) ** 2 * between(rng, 0.6, 1.4));
}


function write(rng: Rng, category: MockCategory, severity: Severity, hotspot: Hotspot): Written {
  const { place } = hotspot;
  switch (category) {
    case "conflict": {
      const kind = pick(rng, ["Artillery exchange", "Armed clash", "Drone strike", "Airstrike", "Ambush on convoy"]);
      const casualties = scaled(rng, severity, 1.5);
      return {
        title: `${kind} near ${place}`,
        summary: `${kind} reported near ${place}. Casualty figures are preliminary and unverified; further strikes in the area were reported in the following hours.`,
        metrics: [
          { label: "Reported casualties", value: String(casualties) },
          { label: "Confidence", value: pick(rng, ["Low", "Medium", "Medium", "High"]) },
        ],
      };
    }
    case "protest": {
      const kind = pick(rng, ["Mass demonstration", "Labour strike", "Student protest", "Road blockade"]);
      return {
        title: `${kind} in ${place}`,
        summary: `${kind} over ${pick(rng, ["cost of living", "election results", "fuel prices", "a proposed law", "police conduct"])}. ${severity === "high" || severity === "critical" ? "Clashes with security forces reported." : "Largely peaceful so far."}`,
        metrics: [
          { label: "Estimated crowd", value: scaled(rng, severity, 400).toLocaleString("en-GB") },
          { label: "Arrests", value: String(scaled(rng, severity, 3)) },
        ],
      };
    }
    case "military": {
      const kind = hotspot.sea
        ? pick(rng, ["Naval task group sighted", "Carrier movement", "Submarine contact reported", "ISR flight tracked"])
        : pick(rng, ["Armoured column sighted", "ISR flight tracked", "Air defence activation", "Large-scale exercise"]);
      return {
        title: `${kind} — ${place}`,
        summary: `${kind} in the ${place} area, picked up on open tracking feeds. Activity is ${severity === "low" ? "consistent with routine patterns" : "above the recent baseline"}.`,
        metrics: [
          { label: "Assets tracked", value: String(int(rng, 1, 4) * severityRank(severity)) },
          { label: "Deviation from baseline", value: `${scaled(rng, severity, 8)}%` },
        ],
      };
    }
    case "earthquake": {
      const magnitude = (3.6 + severityRank(severity) * 0.9 + between(rng, -0.4, 0.4)).toFixed(1);
      const depth = int(rng, 5, 120);
      return {
        title: `M${magnitude} earthquake — ${place}`,
        summary: `A magnitude ${magnitude} earthquake struck at a depth of ${depth} km. ${severity === "critical" ? "Tsunami warning issued for nearby coastlines." : "No tsunami warning issued."}`,
        metrics: [
          { label: "Magnitude", value: magnitude },
          { label: "Depth", value: `${depth} km` },
          { label: "Felt reports", value: scaled(rng, severity, 60).toLocaleString("en-GB") },
        ],
      };
    }
    case "wildfire": {
      const hectares = scaled(rng, severity, 180);
      return {
        title: `Wildfire — ${place}`,
        summary: `Active fire detected by satellite thermal anomalies. ${severity === "high" || severity === "critical" ? "Evacuation orders in effect for nearby communities." : "Crews report the fire is being contained."}`,
        metrics: [
          { label: "Area burned", value: `${hectares.toLocaleString("en-GB")} ha` },
          { label: "Containment", value: `${Math.max(0, 90 - severityRank(severity) * 20 + int(rng, -10, 10))}%` },
        ],
      };
    }
    case "weather": {
      const kind = pick(rng, ["Flash flooding", "Tropical storm", "Landslide", "Severe thunderstorm", "Storm surge"]);
      return {
        title: `${kind} — ${place}`,
        summary: `${kind} affecting ${place}. ${severity === "low" ? "Localised disruption to transport." : "Roads cut and power outages reported across the area."}`,
        metrics: [
          { label: "People affected", value: scaled(rng, severity, 900).toLocaleString("en-GB") },
          { label: "Rainfall (24 h)", value: `${int(rng, 40, 90) * severityRank(severity)} mm` },
        ],
      };
    }
    case "outbreak": {
      const disease = pick(rng, ["Cholera", "Mpox", "Measles", "Dengue", "Lassa fever"]);
      return {
        title: `${disease} cases rising — ${place}`,
        summary: `Health authorities report a rise in suspected ${disease.toLowerCase()} cases around ${place}. ${severity === "critical" ? "Local health system reported to be overwhelmed." : "Response teams deployed."}`,
        metrics: [
          { label: "Suspected cases", value: scaled(rng, severity, 35).toLocaleString("en-GB") },
          { label: "Deaths", value: String(scaled(rng, severity, 0.8)) },
        ],
      };
    }
    case "cyber": {
      const kind = pick(rng, ["Ransomware attack", "DDoS campaign", "Data breach", "Supply-chain compromise"]);
      const target = pick(rng, ["a hospital network", "a regional bank", "government portals", "a telecoms operator", "a logistics firm"]);
      return {
        title: `${kind} on ${target}`,
        summary: `${kind} affecting ${target} in ${place}. ${severity === "low" ? "Services restored within hours." : "Services remain degraded; attribution under investigation."}`,
        metrics: [
          { label: "Systems affected", value: String(scaled(rng, severity, 6)) },
          { label: "Downtime", value: `${int(rng, 1, 6) * severityRank(severity)} h` },
        ],
      };
    }
    case "infrastructure": {
      const kind = pick(rng, ["Power outage", "Subsea cable fault", "Port closure", "Pipeline shutdown", "Rail disruption"]);
      return {
        title: `${kind} — ${place}`,
        summary: `${kind} reported in the ${place} area. ${severity === "low" ? "Limited impact; repairs under way." : "Knock-on disruption expected across the region."}`,
        metrics: [
          { label: "Customers affected", value: scaled(rng, severity, 2500).toLocaleString("en-GB") },
          { label: "Estimated restoration", value: `${int(rng, 2, 12) * severityRank(severity)} h` },
        ],
      };
    }
  }
}

export interface GenerateOptions {
  count?: number;
  seed?: number;
  /** Events are placed in the 30 days before this. */
  now?: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function generateEvents({
  count = 420,
  seed = 20260928,
  now = Date.now(),
}: GenerateOptions = {}): MonitorEvent[] {
  const rng = createRng(seed);
  const events: MonitorEvent[] = [];

  for (let i = 0; i < count; i++) {
    const hotspot = pickHotspot(rng);
    const category = pick(rng, hotspot.categories);
    const severity = pickSeverity(rng);
    // Uniform in a disc rather than a square, so a theatre reads as a region
    // and not as a box.
    const radius = hotspot.spread * Math.sqrt(rng());
    const angle = rng() * 2 * Math.PI;
    const lat = hotspot.lat + radius * Math.sin(angle);
    const lon = hotspot.lon + (radius * Math.cos(angle)) / Math.cos((hotspot.lat * Math.PI) / 180);
    // Skewed towards the present: a monitor is mostly about the last few days.
    const age = rng() ** 2.2 * 30 * DAY;
    const written = write(rng, category, severity, hotspot);

    events.push({
      id: `evt-${String(i + 1).padStart(4, "0")}`,
      category,
      severity,
      ...written,
      place: hotspot.place,
      country: hotspot.country,
      lon: round(lon, 4),
      lat: round(lat, 4),
      time: Math.round(now - age),
      source: pick(rng, SOURCES[category]),
    });
  }

  return sortNewestFirst(events);
}

/** Newest first; events with no time sort after every dated one. */
export function sortNewestFirst<T extends { time: number | null }>(events: T[]): T[] {
  return events.sort((a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
