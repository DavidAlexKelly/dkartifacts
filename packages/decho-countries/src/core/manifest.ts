/**
 * Reading a dataset's manifest and countries file defensively.
 *
 * Both arrive from a dataset someone else built, so they are checked rather
 * than trusted: a wrong path or a missing view should say which, at load
 * time, instead of surfacing later as an empty map.
 */

import {
  MANIFEST_SCHEMA,
  type CountriesFile,
  type CountriesManifest,
  type CountryRecord,
  type GeometryFile,
  type ViewInfo,
} from "./types.js";

export class CountriesDataError extends Error {
  constructor(message: string) {
    super(`decho-countries: ${message}`);
    this.name = "CountriesDataError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function readFiles(view: Record<string, unknown>, where: string): GeometryFile[] {
  if (!Array.isArray(view.files) || view.files.length === 0) {
    throw new CountriesDataError(`${where} lists no geometry files.`);
  }
  const files = view.files.map((file, index) => {
    if (!isObject(file) || !text(file.path)) {
      throw new CountriesDataError(`${where}.files[${index}] has no path.`);
    }
    const minZoom = typeof file.minZoom === "number" && Number.isFinite(file.minZoom) ? file.minZoom : 0;
    return { path: file.path, minZoom };
  });
  return files.sort((a, b) => a.minZoom - b.minZoom);
}

/** The manifest, checked, with view files sorted by zoom. Throws on anything unusable. */
export function parseManifest(raw: unknown): CountriesManifest {
  if (!isObject(raw)) {throw new CountriesDataError("manifest.json is not a JSON object.");}
  const schema = typeof raw.schema === "number" ? raw.schema : NaN;
  if (schema !== MANIFEST_SCHEMA) {
    throw new CountriesDataError(
      `manifest.json is schema ${String(raw.schema)}; this version reads schema ${MANIFEST_SCHEMA}.`,
    );
  }
  if (!text(raw.countries)) {throw new CountriesDataError("manifest.json does not say where countries.json is.");}
  if (!Array.isArray(raw.views) || raw.views.length === 0) {
    throw new CountriesDataError("manifest.json lists no views.");
  }
  const seen = new Set<string>();
  const views: ViewInfo[] = raw.views.map((view, index) => {
    const where = `views[${index}]`;
    if (!isObject(view) || !text(view.id)) {throw new CountriesDataError(`${where} has no id.`);}
    if (seen.has(view.id)) {throw new CountriesDataError(`view "${view.id}" is listed twice.`);}
    seen.add(view.id);
    return {
      id: view.id,
      label: text(view.label) ? view.label : view.id,
      ...(text(view.description) ? { description: view.description } : {}),
      files: readFiles(view, `view "${view.id}"`),
    };
  });
  const defaultView = text(raw.defaultView) ? raw.defaultView : views[0].id;
  if (!seen.has(defaultView)) {
    throw new CountriesDataError(`defaultView "${defaultView}" is not one of the views.`);
  }

  const schemes = Array.isArray(raw.regionSchemes) ? raw.regionSchemes : [];
  const regionSchemes = schemes
    .filter((scheme): scheme is Record<string, unknown> => isObject(scheme) && text(scheme.id))
    .map((scheme) => ({ id: scheme.id as string, label: text(scheme.label) ? scheme.label : (scheme.id as string) }));
  const defaultRegionScheme =
    text(raw.defaultRegionScheme) && regionSchemes.some((s) => s.id === raw.defaultRegionScheme)
      ? raw.defaultRegionScheme
      : regionSchemes[0]?.id;

  const sources = (Array.isArray(raw.sources) ? raw.sources : [])
    .filter((source): source is Record<string, unknown> => isObject(source) && text(source.name))
    .map((source) => {
      const out: CountriesManifest["sources"][number] = { name: source.name as string };
      for (const key of ["url", "licence", "provides", "version", "retrieved"] as const) {
        if (text(source[key])) {out[key] = source[key] as string;}
      }
      return out;
    });

  return {
    schema,
    ...(text(raw.generatedAt) ? { generatedAt: raw.generatedAt } : {}),
    countries: raw.countries,
    views,
    defaultView,
    regionSchemes,
    ...(defaultRegionScheme ? { defaultRegionScheme } : {}),
    sources,
  };
}

/** The records, checked: every one needs an id and a name, and ids are unique. */
export function parseCountries(raw: unknown): CountryRecord[] {
  const list = isObject(raw) && Array.isArray(raw.countries)
    ? (raw as unknown as CountriesFile).countries
    : null;
  if (!list) {throw new CountriesDataError("countries.json has no countries array.");}
  const seen = new Set<string>();
  return list.map((record, index) => {
    if (!isObject(record) || !text(record.id) || !text(record.name)) {
      throw new CountriesDataError(`countries[${index}] needs an id and a name.`);
    }
    if (seen.has(record.id)) {throw new CountriesDataError(`country "${record.id}" is listed twice.`);}
    seen.add(record.id);
    return {
      ...(record as unknown as CountryRecord),
      regions: isObject(record.regions) ? (record.regions as Record<string, string>) : {},
      figures: isObject(record.figures) ? (record.figures as CountryRecord["figures"]) : {},
    };
  });
}

/** The file of a view to show at a zoom: the most detailed one that has started. */
export function fileForZoom(view: ViewInfo, zoom: number): GeometryFile {
  let chosen = view.files[0];
  for (const file of view.files) {
    if (file.minZoom <= zoom) {chosen = file;}
  }
  return chosen;
}
