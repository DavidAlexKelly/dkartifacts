/**
 * loadCountries() — read a countries dataset and get everything else from it.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 *   { kind: "dataset", datasetRid }   a Foundry dataset built by
 *                                     scripts/build-data.mjs (or anything in
 *                                     the same shape), read through
 *                                     @acc/decho-foundry-bytes like every
 *                                     other decho package. Needs
 *                                     configureFoundryBytes (configureBasemap)
 *                                     first, and the dataset as a Resource on
 *                                     the app in Developer Console.
 *   { kind: "builtin" }               the low-detail world that ships inside
 *                                     this package: Natural Earth 1:110m, one
 *                                     view, figures as Natural Earth has them.
 *                                     Works with no Foundry setup at all; for
 *                                     demos, tests and a first look.
 *   { kind: "files", files }          files you already hold, by path — for
 *                                     tests, or data fetched some other way.
 *
 * Whichever it is, everything is read through one `read(path)` and the rest
 * of the package cannot tell them apart.
 *
 * WHAT IS CACHED
 * --------------
 * The manifest and records once per loadCountries call; each geometry file
 * once per call, the first time a view at that detail is asked for. Views and
 * detail levels nobody looks at are never read.
 */

import { getJson } from "@acc/decho-foundry-bytes";

import { sumFigures } from "./figures.js";
import { createCountryIndex, type CountryIndex } from "./geometry.js";
import { CountriesDataError, fileForZoom, parseCountries, parseManifest } from "./manifest.js";
import type {
  CountriesManifest,
  CountryFeatureCollection,
  CountryRecord,
  Region,
  RegionSchemeInfo,
  ViewInfo,
} from "./types.js";

export type CountriesStore =
  | { kind: "dataset"; datasetRid: string; manifestPath?: string }
  | { kind: "builtin" }
  | { kind: "files"; files: Record<string, unknown>; manifestPath?: string };

export interface CountriesData {
  manifest: CountriesManifest;
  /** Every record, sorted by name. */
  records: CountryRecord[];
  country(id: string): CountryRecord | undefined;
  /** A view by id; the default view when omitted. Throws for an unknown id. */
  view(id?: string): ViewInfo;
  /** A region scheme by id; the default when omitted. Undefined if the data has none. */
  regionScheme(id?: string): RegionSchemeInfo | undefined;
  /** The outlines of a view, at the detail for a zoom (the least detailed when omitted). */
  geometry(viewId?: string, zoom?: number): Promise<CountryFeatureCollection>;
  /** Point lookup and bounds over the same outlines. */
  index(viewId?: string, zoom?: number): Promise<CountryIndex>;
  /** The regions of a scheme, sorted by name. Empty for an unknown scheme. */
  regions(schemeId?: string): Region[];
  /** The region a country is in under a scheme. */
  regionOf(countryId: string, schemeId?: string): Region | undefined;
}

const DEFAULT_MANIFEST = "manifest.json";

/** Paths in the manifest are relative to the manifest's own folder. */
function resolvePath(manifestPath: string, path: string): string {
  const slash = manifestPath.lastIndexOf("/");
  return slash === -1 ? path : `${manifestPath.slice(0, slash + 1)}${path}`;
}

async function readerFor(
  store: CountriesStore,
): Promise<{ read: (path: string) => Promise<unknown>; manifestPath: string }> {
  if (store.kind === "dataset") {
    if (!store.datasetRid) {throw new CountriesDataError("a dataset store needs a datasetRid.");}
    return {
      read: (path) => getJson<unknown>(store.datasetRid, path),
      manifestPath: store.manifestPath ?? DEFAULT_MANIFEST,
    };
  }
  const files =
    store.kind === "builtin"
      ? (await import("../builtin/world.js")).BUILTIN_FILES
      : store.files;
  return {
    read: async (path) => {
      if (!(path in files)) {throw new CountriesDataError(`no file "${path}" in the store.`);}
      return files[path];
    },
    manifestPath: store.kind === "files" ? (store.manifestPath ?? DEFAULT_MANIFEST) : DEFAULT_MANIFEST,
  };
}

export async function loadCountries(store: CountriesStore = { kind: "builtin" }): Promise<CountriesData> {
  const { read, manifestPath } = await readerFor(store);
  const manifest = parseManifest(await read(manifestPath));
  const records = parseCountries(await read(resolvePath(manifestPath, manifest.countries))).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const byId = new Map(records.map((record) => [record.id, record]));

  const view = (id?: string): ViewInfo => {
    const wanted = id ?? manifest.defaultView;
    const found = manifest.views.find((candidate) => candidate.id === wanted);
    if (!found) {
      throw new CountriesDataError(
        `no view "${wanted}". This dataset has: ${manifest.views.map((v) => v.id).join(", ")}.`,
      );
    }
    return found;
  };

  const geometries = new Map<string, Promise<CountryFeatureCollection>>();
  const geometry = (viewId?: string, zoom = 0): Promise<CountryFeatureCollection> => {
    const path = resolvePath(manifestPath, fileForZoom(view(viewId), zoom).path);
    let pending = geometries.get(path);
    if (!pending) {
      pending = read(path).then((raw) => {
        const collection = raw as CountryFeatureCollection;
        if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
          throw new CountriesDataError(`${path} is not a GeoJSON FeatureCollection.`);
        }
        return collection;
      });
      // A failed read is not cached: the next ask tries again.
      pending.catch(() => geometries.delete(path));
      geometries.set(path, pending);
    }
    return pending;
  };

  const indexes = new Map<CountryFeatureCollection, CountryIndex>();
  const index = async (viewId?: string, zoom?: number): Promise<CountryIndex> => {
    const collection = await geometry(viewId, zoom);
    let built = indexes.get(collection);
    if (!built) {
      built = createCountryIndex(collection);
      indexes.set(collection, built);
    }
    return built;
  };

  const regionScheme = (id?: string) => {
    const wanted = id ?? manifest.defaultRegionScheme;
    return manifest.regionSchemes.find((scheme) => scheme.id === wanted);
  };

  const regionCache = new Map<string, Region[]>();
  const regions = (schemeId?: string): Region[] => {
    const scheme = regionScheme(schemeId);
    if (!scheme) {return [];}
    const cached = regionCache.get(scheme.id);
    if (cached) {return cached;}
    const members = new Map<string, CountryRecord[]>();
    for (const record of records) {
      const name = record.regions[scheme.id];
      if (!name) {continue;}
      const list = members.get(name);
      if (list) {list.push(record);}
      else {members.set(name, [record]);}
    }
    const out = [...members]
      .map(([name, list]) => ({
        id: name,
        scheme: scheme.id,
        countries: list.map((record) => record.id),
        // The records' own figures: only additive ones are summed, and a
        // region's density is worked out from its sums, not averaged.
        figures: sumFigures(list),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    regionCache.set(scheme.id, out);
    return out;
  };

  return {
    manifest,
    records,
    country: (id) => byId.get(id),
    view,
    regionScheme,
    geometry,
    index,
    regions,
    regionOf(countryId, schemeId) {
      const scheme = regionScheme(schemeId);
      const name = scheme && byId.get(countryId)?.regions[scheme.id];
      return name ? regions(scheme.id).find((region) => region.id === name) : undefined;
    },
  };
}
