/**
 * The pure part of build-data.mjs: Natural Earth features and World Bank rows
 * in, records, views and a manifest out. No files, no network — those are the
 * CLI's — so every rule here is unit-tested (scripts/lib.test.ts).
 */

import polygonClipping from "polygon-clipping";

export const MANIFEST_SCHEMA = 1;

/** Natural Earth's marker for "no value". Arrives as a number or a string. */
export function missing(value) {
  return value === undefined || value === null || value === "" || value === -99 || value === "-99";
}

/** A field, or undefined when Natural Earth has no value for it. */
function field(props, key) {
  const value = props[key];
  return missing(value) ? undefined : value;
}

// ── Ids ──────────────────────────────────────────────────────────────────────

/**
 * Each feature's id: its ISO 3166 alpha-3 code where it has one, because that
 * is what other data joins on — and Natural Earth's own ADM0_A3 where it does
 * not (Kosovo, Somaliland, N. Cyprus…).
 *
 * ISO_A3_EH, not ISO_A3: ISO_A3 is -99 for France and Norway (their overseas
 * parts complicate the code), and joining on it silently loses both. If two
 * features would share an ISO code, the second falls back to ADM0_A3.
 *
 * Returns ADM0_A3 → id, which is also how the point-of-view fields (whose
 * values are ADM0_A3 codes) are turned into ids.
 */
export function assignIds(features) {
  const adm0ToId = new Map();
  const taken = new Set();
  for (const { properties: p } of features) {
    const adm0 = p.ADM0_A3;
    if (adm0ToId.has(adm0)) {continue;}
    const iso = field(p, "ISO_A3_EH");
    const id = iso && !taken.has(iso) ? iso : adm0;
    adm0ToId.set(adm0, id);
    taken.add(id);
  }
  return adm0ToId;
}

// ── Region schemes ───────────────────────────────────────────────────────────

/** Natural Earth fields that group countries, and what each scheme is called. */
export const REGION_SCHEMES = [
  { id: "un-region", label: "UN regions", field: "REGION_UN" },
  { id: "un-subregion", label: "UN subregions", field: "SUBREGION" },
  { id: "wb-region", label: "World Bank regions", field: "REGION_WB" },
  { id: "continent", label: "Continents", field: "CONTINENT" },
  { id: "income", label: "Income groups", field: "INCOME_GRP" },
];

/** "5. Low income" → "Low income": Natural Earth numbers its groups for sorting. */
export function regionName(value) {
  if (missing(value)) {return undefined;}
  const text = String(value).trim();
  const dot = text.indexOf(". ");
  return dot > 0 && /^\d+$/.test(text.slice(0, dot)) ? text.slice(dot + 2) : text;
}

// ── Records ──────────────────────────────────────────────────────────────────

const NAME_FIELDS = [
  "AR", "BN", "DE", "EL", "EN", "ES", "FA", "FR", "HE", "HI", "HU", "ID", "IT", "JA", "KO",
  "NL", "PL", "PT", "RU", "SV", "TR", "UK", "UR", "VI", "ZH", "ZHT",
];

/** Figures as Natural Earth carries them: one population and one GDP estimate. */
export function naturalEarthFigures(p) {
  const figures = {};
  const population = field(p, "POP_EST");
  if (typeof population === "number" && population > 0) {
    figures.population = { value: population, ...yearOf(p.POP_YEAR), source: "Natural Earth" };
  }
  const gdp = field(p, "GDP_MD");
  if (typeof gdp === "number" && gdp > 0) {
    figures.gdpUsd = { value: gdp * 1e6, ...yearOf(p.GDP_YEAR), source: "Natural Earth" };
  }
  return figures;
}

function yearOf(value) {
  const year = Number(value);
  return Number.isInteger(year) && year > 1900 ? { year } : {};
}

/** One record from a feature's properties, plus its capital when known. */
export function recordFrom(p, id, { capital, sovereignId } = {}) {
  const names = {};
  for (const code of NAME_FIELDS) {
    const name = field(p, `NAME_${code}`);
    if (typeof name === "string" && name !== p.NAME) {names[code.toLowerCase()] = name;}
  }
  const regions = {};
  for (const scheme of REGION_SCHEMES) {
    const name = regionName(p[scheme.field]);
    if (name) {regions[scheme.id] = name;}
  }
  const record = {
    id,
    name: tidy(p.NAME),
    regions,
    figures: naturalEarthFigures(p),
  };
  const longName = field(p, "FORMAL_EN") ?? field(p, "NAME_LONG");
  if (longName && longName !== p.NAME) {record.longName = longName;}
  if (Object.keys(names).length > 0) {record.names = names;}
  const iso2 = field(p, "ISO_A2_EH");
  const iso3 = field(p, "ISO_A3_EH");
  const isoNumeric = field(p, "ISO_N3_EH");
  if (iso2) {record.iso2 = iso2;}
  if (iso3) {record.iso3 = iso3;}
  if (isoNumeric) {record.isoNumeric = String(isoNumeric).padStart(3, "0");}
  if (field(p, "TYPE")) {record.kind = p.TYPE;}
  if (sovereignId && sovereignId !== id) {record.sovereign = sovereignId;}
  if (capital) {record.capital = capital;}
  if (typeof p.LABEL_X === "number" && typeof p.LABEL_Y === "number") {
    record.label = [round(p.LABEL_X, 4), round(p.LABEL_Y, 4)];
  }
  if (field(p, "WIKIDATAID")) {record.wikidata = p.WIKIDATAID;}
  return record;
}

/** How sure a populated place is to be a country's capital; lower wins. */
function capitalRank(p) {
  const kind = String(p.featurecla ?? "");
  const alternate = Number(p.capalt) === 1 || kind === "Admin-0 capital alt";
  if (alternate) {return 2;}
  // adm0cap is not set on every capital (Juba has it 0), so the feature class
  // counts as much as the flag does.
  if (Number(p.adm0cap) === 1 || kind === "Admin-0 capital") {return 0;}
  // A dependency's seat: Nuuk for Greenland, Stanley for the Falklands.
  if (kind === "Admin-0 region capital") {return 1;}
  return Infinity;
}

/** Spaces as one: Natural Earth has "Washington,  D.C.". */
export function tidy(text) {
  return String(text).split(" ").filter(Boolean).join(" ");
}

/**
 * Capitals from Natural Earth's populated places, by country id: the
 * national capital where there is one, a dependency's administrative seat
 * where there is not, and an alternate capital (La Paz, Laayoune) last.
 */
export function capitalsFrom(placeFeatures, adm0ToId) {
  const best = new Map();
  for (const { properties: p } of placeFeatures) {
    const rank = capitalRank(p);
    if (rank === Infinity) {continue;}
    const id = adm0ToId.get(p.adm0_a3) ?? p.adm0_a3;
    const known = best.get(id);
    if (known && known.rank <= rank) {continue;}
    best.set(id, {
      rank,
      capital: { name: tidy(p.name), lon: round(Number(p.longitude), 4), lat: round(Number(p.latitude), 4) },
    });
  }
  return new Map([...best].map(([id, { capital }]) => [id, capital]));
}

// ── Views ────────────────────────────────────────────────────────────────────

/** The point-of-view codes in the data: ADM0_A3_US → "US". */
export function viewCodes(properties) {
  return Object.keys(properties)
    .filter((key) => /^ADM0_A3_[A-Z]{2}$/.test(key))
    .map((key) => key.slice("ADM0_A3_".length));
}

/** Who a view code is: mostly the country with that ISO alpha-2 code. */
const VIEW_NAMES = { KO: "South Korea", UN: "the United Nations", WB: "the World Bank" };

export function viewLabel(code, features) {
  if (VIEW_NAMES[code]) {return `As seen by ${VIEW_NAMES[code]}`;}
  const match = features.find((f) => f.properties.ISO_A2_EH === code || f.properties.ISO_A2 === code);
  return `As seen by ${match ? match.properties.NAME : code}`;
}

/**
 * Which id each feature belongs to under a view. A point-of-view field holds
 * the ADM0_A3 the feature is counted under from that country's point of view
 * (Western Sahara under Morocco's is "MAR"); -99 means no change, which is
 * how the UN and World Bank columns, empty throughout, come out identical to
 * the default and get dropped.
 *
 * A code that is no country's (Siachen Glacier under the US view is "B45")
 * becomes an id of its own.
 */
export function assignmentFor(features, adm0ToId, code) {
  return features.map(({ properties: p }) => {
    const own = adm0ToId.get(p.ADM0_A3);
    if (!code) {return own;}
    const target = p[`ADM0_A3_${code}`];
    return missing(target) ? own : (adm0ToId.get(target) ?? String(target));
  });
}

/** A short key for an assignment, so identical views can share one set of files. */
export function assignmentKey(assignment) {
  return assignment.join("|");
}

/**
 * The views to build: the default plus every point of view that groups the
 * features differently from it. Views that group identically to each other
 * share files (`fileKey`), but each is still listed under its own name.
 */
export function planViews(features, adm0ToId, wanted = "all") {
  const codes = viewCodes(features[0]?.properties ?? {});
  const chosen = wanted === "all" ? codes : wanted === "default" ? [] : wanted.filter((code) => codes.includes(code));
  const defaultAssignment = assignmentFor(features, adm0ToId, null);
  const defaultKey = assignmentKey(defaultAssignment);
  const views = [
    {
      id: "default",
      label: "De facto (Natural Earth)",
      description:
        "Natural Earth's own lines: borders as they are controlled on the ground, with disputed areas drawn as units of their own.",
      fileKey: "default",
      assignment: defaultAssignment,
    },
  ];
  const fileKeys = new Map([[defaultKey, "default"]]);
  for (const code of chosen) {
    const assignment = assignmentFor(features, adm0ToId, code);
    const key = assignmentKey(assignment);
    if (key === defaultKey) {continue;}
    if (!fileKeys.has(key)) {fileKeys.set(key, code.toLowerCase());}
    views.push({
      id: code.toLowerCase(),
      label: viewLabel(code, features),
      description: `Disputed territory drawn as the government of this country recognises it (Natural Earth point of view "${code}").`,
      fileKey: fileKeys.get(key),
      assignment,
    });
  }
  return views;
}

// ── Geometry ─────────────────────────────────────────────────────────────────

export function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundRing(ring, decimals) {
  const out = [];
  for (const [lon, lat] of ring) {
    const point = [round(lon, decimals), round(lat, decimals)];
    const last = out[out.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) {out.push(point);}
  }
  // Closed again if rounding merged the last point into the first.
  const first = out[0];
  const last = out[out.length - 1];
  if (first && (first[0] !== last[0] || first[1] !== last[1])) {out.push([...first]);}
  return out;
}

/**
 * Coordinates rounded to the precision the scale is drawn at (two decimals is
 * about 1 km, plenty for 1:110m), with the points that rounding makes
 * duplicate dropped, and any ring left with no area removed.
 */
export function roundGeometry(geometry, decimals) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const kept = polygons
    .map((polygon) => polygon.map((ring) => roundRing(ring, decimals)).filter((ring) => ring.length >= 4))
    .filter((polygon) => polygon.length > 0);
  if (kept.length === 0) {return null;}
  return kept.length === 1 ? { type: "Polygon", coordinates: kept[0] } : { type: "MultiPolygon", coordinates: kept };
}

/**
 * Rounding each point on its own can put two nearby edges onto each other so
 * they cross, and MapLibre draws a self-crossing ring as stray slivers across
 * the country (Greenland and Russia at 1:10m, for two). A union of the shape
 * with itself resolves the crossings into a valid outline.
 */
export function clean(geometry) {
  if (!geometry) {return null;}
  const merged = polygonClipping.union(coordinatesOf(geometry));
  if (merged.length === 0) {return null;}
  return merged.length === 1 ? { type: "Polygon", coordinates: merged[0] } : { type: "MultiPolygon", coordinates: merged };
}

function coordinatesOf(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/**
 * The outlines of a view: features grouped by the id they are assigned to,
 * and each group with more than one member merged into one shape, so the
 * line between Morocco and Western Sahara disappears in Morocco's view
 * rather than being drawn as an internal border.
 */
export function viewCollection(features, assignment, decimals) {
  const groups = new Map();
  features.forEach((feature, index) => {
    if (!feature.geometry) {return;}
    const id = assignment[index];
    const list = groups.get(id);
    if (list) {list.push(feature.geometry);}
    else {groups.set(id, [feature.geometry]);}
  });
  const out = [];
  for (const [id, geometries] of groups) {
    let geometry;
    if (geometries.length === 1) {
      geometry = geometries[0];
    } else {
      const merged = polygonClipping.union(...geometries.map(coordinatesOf));
      geometry = merged.length === 1 ? { type: "Polygon", coordinates: merged[0] } : { type: "MultiPolygon", coordinates: merged };
    }
    const rounded = clean(roundGeometry(geometry, decimals));
    if (rounded) {out.push({ type: "Feature", properties: { id }, geometry: rounded });}
  }
  out.sort((a, b) => (a.properties.id < b.properties.id ? -1 : 1));
  return { type: "FeatureCollection", features: out };
}

// ── Area ─────────────────────────────────────────────────────────────────────

/** Mean Earth radius, km. The same formula as src/core/geometry.ts — kept in step by a test. */
const EARTH_RADIUS_KM = 6371.0088;

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    sum += ((lon2 - lon1) * Math.PI) / 180 * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

/** Spherical area of a Polygon or MultiPolygon in km², holes subtracted. */
export function areaKm2(geometry) {
  let total = 0;
  for (const [outer, ...holes] of coordinatesOf(geometry)) {
    if (!outer) {continue;}
    total += ringArea(outer);
    for (const hole of holes) {total -= ringArea(hole);}
  }
  return total;
}

// ── World Bank ───────────────────────────────────────────────────────────────

/** The indicators read, and the figure each becomes. */
export const WORLD_BANK_INDICATORS = {
  "SP.POP.TOTL": "population",
  "AG.LND.TOTL.K2": "landAreaKm2",
  "AG.SRF.TOTL.K2": "totalAreaKm2",
  "NY.GDP.MKTP.CD": "gdpUsd",
  "NY.GDP.PCAP.CD": "gdpPerCapitaUsd",
};

/** Where the World Bank's code is not the record's ISO code. */
export const WORLD_BANK_ALIASES = { KOS: "XKX" };

/**
 * Indicator rows (`mrnev=1`: each country's most recent value) and country
 * rows, folded into the records: World Bank figures replace Natural Earth's,
 * and fill the capital and income group where they are missing.
 *
 * Returns the ids of sovereign countries the World Bank had nothing for, so
 * the CLI can report them — a silent gap is how a join goes wrong unnoticed.
 */
export function joinWorldBank(records, { indicators, countries }) {
  const byCode = new Map();
  for (const [indicator, rows] of Object.entries(indicators)) {
    const key = WORLD_BANK_INDICATORS[indicator];
    if (!key) {continue;}
    for (const row of rows ?? []) {
      if (!row || row.value === null || row.value === undefined || !row.countryiso3code) {continue;}
      const entry = byCode.get(row.countryiso3code) ?? {};
      entry[key] = { value: Number(row.value), ...yearOf(row.date), source: "World Bank" };
      byCode.set(row.countryiso3code, entry);
    }
  }
  const meta = new Map((countries ?? []).map((row) => [row.id, row]));
  const unmatched = [];
  for (const record of records) {
    const code = WORLD_BANK_ALIASES[record.id] ?? record.iso3 ?? record.id;
    const figures = byCode.get(code);
    if (figures) {Object.assign(record.figures, figures);}
    const country = meta.get(code);
    if (country) {
      const income = country.incomeLevel?.value;
      if (income && income !== "Not classified") {record.regions.income = income;}
      if (!record.capital && country.capitalCity && country.longitude && country.latitude) {
        record.capital = {
          name: country.capitalCity,
          lon: round(Number(country.longitude), 4),
          lat: round(Number(country.latitude), 4),
        };
      }
    }
    if (!figures && record.kind === "Sovereign country") {unmatched.push(record.id);}
  }
  return unmatched;
}

// ── Manifest ─────────────────────────────────────────────────────────────────

export const SOURCES = {
  naturalEarth: (version) => ({
    name: "Natural Earth",
    url: "https://www.naturalearthdata.com/",
    licence: "Public domain",
    provides: "borders, points of view, regions, names, capitals",
    ...(version ? { version } : {}),
  }),
  worldBank: (retrieved) => ({
    name: "World Bank",
    url: "https://data.worldbank.org/",
    licence: "CC BY 4.0",
    provides: "population, areas, GDP, income groups",
    retrieved,
  }),
};

export function buildManifest({ views, scales, sources, generatedAt }) {
  return {
    schema: MANIFEST_SCHEMA,
    generatedAt,
    countries: "countries.json",
    views: views.map((view) => ({
      id: view.id,
      label: view.label,
      ...(view.description ? { description: view.description } : {}),
      files: scales.map((scale, index) => ({
        path: `views/${view.fileKey}/${scale.name}.geojson`,
        minZoom: index === 0 ? 0 : scale.minZoom,
      })),
    })),
    defaultView: "default",
    regionSchemes: REGION_SCHEMES.map(({ id, label }) => ({ id, label })),
    defaultRegionScheme: "un-region",
    sources,
  };
}
