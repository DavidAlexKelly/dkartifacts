/**
 * @acc/decho-countries — country outlines and facts, from Foundry.
 *
 * This entry is headless: no map, no React. Load a dataset (or the built-in
 * low-detail world), then ask which country a point is in, read a country's
 * figures, or group countries into regions. The map add-on is
 * "@acc/decho-countries/extension"; a React card and hook are
 * "@acc/decho-countries/react".
 */

export {
  loadCountries,
  type CountriesData,
  type CountriesStore,
} from "./core/load.js";
export {
  CountriesDataError,
  fileForZoom,
  parseCountries,
  parseManifest,
} from "./core/manifest.js";
export {
  areaKm2,
  boundsOf,
  containsPoint,
  createCountryIndex,
  type Bounds,
  type CountryIndex,
} from "./core/geometry.js";
export {
  FIGURE_LABELS,
  figuresOf,
  flagEmoji,
  formatFigure,
  orderedFigureKeys,
  sumFigures,
} from "./core/figures.js";
export {
  MANIFEST_SCHEMA,
  type CountriesFile,
  type CountriesManifest,
  type CountryFeature,
  type CountryFeatureCollection,
  type CountryGeometry,
  type CountryRecord,
  type Figure,
  type GeometryFile,
  type Region,
  type RegionSchemeInfo,
  type SourceInfo,
  type ViewInfo,
} from "./core/types.js";
