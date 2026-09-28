/**
 * Areas: the shapes a source carries alongside its events — zones,
 * boundaries, affected regions, routes. Drawn under the basemap's labels
 * (`before: "labels"`) so place names stay legible over a filled zone, and
 * under the events, which the page's other extension draws on top of
 * everything.
 */

import type { BasemapExtension } from "@acc/decho-basemap";
import { BUILTIN_REGISTRY, type CategoryRegistry } from "./categories";
import { categoryColour } from "./eventsLayer";
import type { MonitorArea } from "./sources/interpret";

export const AREAS_SOURCE = "event-areas";

export const AREA_LAYERS = {
  fill: "event-areas-fill",
  outline: "event-areas-outline",
  line: "event-areas-line",
  selected: "event-areas-selected",
} as const;

export function areasToFeatureCollection(areas: readonly MonitorArea[]) {
  return {
    type: "FeatureCollection" as const,
    features: areas.map((area, index) => ({
      type: "Feature" as const,
      id: index,
      geometry: area.geometry,
      properties: { id: area.id, category: area.category, name: area.name },
    })),
  };
}

const IS_POLYGON = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const IS_LINE = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];

export function areaSelectionFilter(id: string | null): unknown[] {
  return ["==", ["get", "id"], id ?? ""];
}

/* eslint-disable @typescript-eslint/no-explicit-any --
   Layer specifications, validated by MapLibre; see eventsLayer.ts. */
export function areaLayers(registry: CategoryRegistry = BUILTIN_REGISTRY): any[] {
  return [
    {
      id: AREA_LAYERS.fill,
      type: "fill",
      source: AREAS_SOURCE,
      filter: IS_POLYGON,
      paint: { "fill-color": categoryColour(registry), "fill-opacity": 0.16 },
    },
    {
      id: AREA_LAYERS.outline,
      type: "line",
      source: AREAS_SOURCE,
      filter: IS_POLYGON,
      paint: {
        "line-color": categoryColour(registry),
        "line-width": 1.5,
        "line-opacity": 0.85,
        "line-dasharray": [3, 2],
      },
    },
    {
      id: AREA_LAYERS.line,
      type: "line",
      source: AREAS_SOURCE,
      filter: IS_LINE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": categoryColour(registry), "line-width": 3, "line-opacity": 0.85 },
    },
    {
      id: AREA_LAYERS.selected,
      type: "line",
      source: AREAS_SOURCE,
      filter: areaSelectionFilter(null),
      paint: { "line-color": "#ffffff", "line-width": 3.5 },
    },
  ];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function areasExtension(
  initial: readonly MonitorArea[],
  registry: CategoryRegistry = BUILTIN_REGISTRY,
): BasemapExtension {
  return {
    id: "event-areas",
    style: () => ({
      sources: {
        [AREAS_SOURCE]: { type: "geojson", data: areasToFeatureCollection(initial) },
      },
      layers: areaLayers(registry),
      before: "labels",
    }),
  };
}

export function setAreaData(
  map: { getSource(id: string): unknown },
  areas: readonly MonitorArea[],
): void {
  const source = map.getSource(AREAS_SOURCE) as
    | { setData(data: ReturnType<typeof areasToFeatureCollection>): unknown }
    | undefined;
  source?.setData(areasToFeatureCollection(areas));
}

/** Area colours for a registry that changed after the map was built. */
export function setAreaCategoryColours(
  map: {
    getLayer(id: string): unknown;
    setPaintProperty(layer: string, name: string, value: unknown): unknown;
  },
  registry: CategoryRegistry,
): void {
  const colour = categoryColour(registry);
  const paint: Array<[string, string]> = [
    [AREA_LAYERS.fill, "fill-color"],
    [AREA_LAYERS.outline, "line-color"],
    [AREA_LAYERS.line, "line-color"],
  ];
  for (const [layer, property] of paint) {
    if (map.getLayer(layer)) {map.setPaintProperty(layer, property, colour);}
  }
}
