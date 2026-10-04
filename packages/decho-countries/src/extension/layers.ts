/**
 * The layers the extension draws, and the per-feature properties they read.
 *
 * Colours are worked out here, in JavaScript, and written onto each feature
 * as `colour`, rather than as a MapLibre expression: a fill can depend on a
 * region scheme, a palette or a caller's function of the whole record, and a
 * data-driven `["get", "colour"]` covers every one of them with one layer.
 */

import type { CountriesData } from "../core/load.js";
import type { CountryFeatureCollection, CountryRecord, Region } from "../core/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- MapLibre layer specs; see decho-basemap's extensions.ts. */

/** Eight muted colours that read under labels on a light or dark basemap. */
export const DEFAULT_PALETTE = [
  "#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#edc948", "#b07aa1", "#9c755f",
];

export type FillMode =
  | "region"
  | "country"
  | "uniform"
  | "none"
  | ((country: CountryRecord, region: Region | undefined) => string | null | undefined);

export interface Appearance {
  fill: FillMode;
  palette: string[];
  uniformColour: string;
  fillOpacity: number;
  hoverOpacity: number;
  borderColour: string;
  borderWidth: number;
  highlightColour: string;
}

export const DEFAULT_APPEARANCE: Appearance = {
  fill: "region",
  palette: DEFAULT_PALETTE,
  uniformColour: "#4e79a7",
  fillOpacity: 0.18,
  hoverOpacity: 0.35,
  borderColour: "#5b6b7a",
  borderWidth: 0.8,
  highlightColour: "#ffb000",
};

export function layerIds(prefix: string) {
  return {
    source: `${prefix}-outlines`,
    fill: `${prefix}-fill`,
    hover: `${prefix}-hover`,
    border: `${prefix}-border`,
    selected: `${prefix}-selected`,
  };
}

/** A small stable hash, so "country" colouring does not change between loads. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The outlines with what the layers read added: the region each is in under
 * the current scheme (for region hover and selection) and its fill colour.
 */
export function annotate(
  collection: CountryFeatureCollection,
  data: CountriesData,
  schemeId: string | undefined,
  appearance: Appearance,
): CountryFeatureCollection {
  const regions = schemeId ? data.regions(schemeId) : [];
  const regionIndex = new Map(regions.map((region, index) => [region.id, index]));
  const { fill, palette } = appearance;
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      const id = feature.properties.id;
      const record = data.country(id);
      const regionId = (schemeId && record?.regions[schemeId]) || "";
      let colour: string | null | undefined;
      if (typeof fill === "function") {
        colour = record ? fill(record, regionId ? data.regionOf(id, schemeId) : undefined) : null;
      } else if (fill === "region") {
        const index = regionIndex.get(regionId);
        colour = index === undefined ? null : palette[index % palette.length];
      } else if (fill === "country") {
        colour = palette[hash(id) % palette.length];
      } else if (fill === "uniform") {
        colour = appearance.uniformColour;
      }
      return {
        ...feature,
        properties: { ...feature.properties, region: regionId, colour: colour ?? "rgba(0,0,0,0)" },
      };
    }),
  };
}

/** A filter that matches nothing, for hover and selection while there is none. */
export const MATCH_NOTHING = ["==", ["get", "id"], "\u0000"];

export function matchFilter(kind: "country" | "region", id: string | null): any[] {
  if (id === null) {return MATCH_NOTHING;}
  return ["==", ["get", kind === "country" ? "id" : "region"], id];
}

export function layersFor(prefix: string, appearance: Appearance): any[] {
  const ids = layerIds(prefix);
  const showFill = appearance.fill !== "none";
  return [
    {
      id: ids.fill,
      type: "fill",
      source: ids.source,
      paint: {
        "fill-color": ["get", "colour"],
        "fill-opacity": showFill ? appearance.fillOpacity : 0,
      },
    },
    {
      id: ids.hover,
      type: "fill",
      source: ids.source,
      filter: MATCH_NOTHING,
      paint: { "fill-color": appearance.highlightColour, "fill-opacity": appearance.hoverOpacity },
    },
    {
      id: ids.border,
      type: "line",
      source: ids.source,
      paint: {
        "line-color": appearance.borderColour,
        // Thinner zoomed out, where every border is close to every other.
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, appearance.borderWidth * 0.6, 6, appearance.borderWidth * 1.4],
      },
    },
    {
      id: ids.selected,
      type: "line",
      source: ids.source,
      filter: MATCH_NOTHING,
      layout: { "line-join": "round" },
      paint: { "line-color": appearance.highlightColour, "line-width": 2.5 },
    },
  ];
}
