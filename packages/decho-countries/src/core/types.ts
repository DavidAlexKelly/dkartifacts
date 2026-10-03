/**
 * The shapes of a countries dataset, and of what loading one gives you.
 *
 * A dataset is three kinds of file, all JSON:
 *
 *   manifest.json     what is in the dataset: its border views, its region
 *                     schemes, the detail levels of each view, and where the
 *                     data came from. Everything else is found through it.
 *   countries.json    one record per country — names, codes, capital, which
 *                     region it is in under each scheme, and its figures.
 *   views/…           GeoJSON outlines, one file per view and detail level.
 *                     Each feature carries only `properties.id`, the key of
 *                     its record in countries.json.
 *
 * Nothing here is specific to Natural Earth or the World Bank. Those are what
 * scripts/build-data.mjs reads, but any dataset in this shape works — which is
 * what lets the data decide which border views and region schemes exist.
 */

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

/** Bumped only when an old reader could not read a new dataset. */
export const MANIFEST_SCHEMA = 1;

export interface CountriesManifest {
  schema: number;
  /** ISO timestamp of the build. */
  generatedAt?: string;
  /** Path of countries.json, relative to the dataset root. */
  countries: string;
  /** At least one. Their ids are the values `setView` takes. */
  views: ViewInfo[];
  /** Id of the view shown unless asked otherwise. */
  defaultView: string;
  /** May be empty: a dataset without regions still has countries. */
  regionSchemes: RegionSchemeInfo[];
  defaultRegionScheme?: string;
  /** Shown beside the figures; licences that require credit get it here. */
  sources: SourceInfo[];
}

/**
 * One way of drawing the borders. Where territory is disputed, whose claim
 * the map follows: Natural Earth's own de facto lines, or a given country's.
 */
export interface ViewInfo {
  id: string;
  label: string;
  description?: string;
  /**
   * The same outlines at increasing detail, each used from its `minZoom` up
   * to the next one's. The first should start at 0.
   */
  files: GeometryFile[];
}

export interface GeometryFile {
  path: string;
  minZoom: number;
}

/** A way of grouping countries: UN regions, World Bank regions, continents… */
export interface RegionSchemeInfo {
  id: string;
  label: string;
}

export interface SourceInfo {
  name: string;
  url?: string;
  licence?: string;
  /** What this source supplied, e.g. "borders and regions" or "population". */
  provides?: string;
  version?: string;
  retrieved?: string;
}

export interface CountriesFile {
  countries: CountryRecord[];
}

/**
 * One country, territory or disputed area. "Country" throughout this package
 * means whatever the outlines draw as a unit — a dependency or a disputed
 * area has a record of its own.
 */
export interface CountryRecord {
  /** The key outlines use. Stable across views and detail levels. */
  id: string;
  name: string;
  /** Formal name, e.g. "French Republic". */
  longName?: string;
  /** By language code: { fr: "Allemagne", de: "Deutschland" }. */
  names?: Record<string, string>;
  iso2?: string;
  iso3?: string;
  isoNumeric?: string;
  /** "Sovereign country", "Dependency", "Disputed"… as the source has it. */
  kind?: string;
  /** Id of the sovereign, when this is a dependency. */
  sovereign?: string;
  capital?: { name: string; lon: number; lat: number };
  /** By region scheme id: { "un-region": "Africa" }. The name is the id. */
  regions: Record<string, string>;
  /** By figure key; see FIGURE_LABELS for the ones this package names. */
  figures: Record<string, Figure>;
  /** Where to put a label: inside the country, unlike a centroid. */
  label?: [number, number];
  /** Wikidata item, e.g. "Q142", for anything not carried here. */
  wikidata?: string;
}

export interface Figure {
  value: number;
  /** The year the figure is for. */
  year?: number;
  /** Which entry of the manifest's sources it came from, by name. */
  source?: string;
  /** Anything a reader should know, e.g. "computed from the outline". */
  note?: string;
}

export type CountryGeometry = Polygon | MultiPolygon;

export type CountryFeature = Feature<CountryGeometry, { id: string }>;

export type CountryFeatureCollection = FeatureCollection<CountryGeometry, { id: string }>;

/** A region under one scheme, gathered from its countries' records. */
export interface Region {
  /** The region's name, which is also its id within the scheme. */
  id: string;
  scheme: string;
  /** Country ids, sorted by name. */
  countries: string[];
  /**
   * Sums over the members for the figures that add up — population, areas,
   * GDP. A member without the figure leaves the sum short, so `members` says
   * how many contributed.
   */
  figures: Record<string, Figure & { members: number }>;
}
