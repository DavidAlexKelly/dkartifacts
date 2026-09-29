/**
 * The events on the map: one clustered GeoJSON source and the layers over it,
 * contributed as a basemap extension so they compose with `elevation()` the
 * same way every other add-on does.
 *
 * Clustering is MapLibre's own (supercluster, in a worker). Nothing here
 * decides what groups with what: the source is given a radius and a max zoom,
 * and at each zoom it merges whatever lands within that many pixels. That is
 * what makes a theatre split apart smoothly as you zoom in, rather than at a
 * few hand-picked thresholds.
 *
 * A cluster's size and colour say how many events it holds, on one
 * sequential ramp. Clusters also carry the highest severity inside
 * (`clusterProperties`, aggregated in the worker), so a cluster hiding a
 * critical event gets a red outline. What is in a cluster by category is NOT
 * aggregated: categories can be added at runtime (custom ones from Workshop),
 * and cluster properties are fixed when the source is created — so the hover
 * card asks the source for the cluster's events instead (`getClusterLeaves`).
 *
 * Category colours come from a CategoryRegistry (categories.ts) and can be
 * re-applied to a live map with `setCategoryColours`, for the same reason.
 *
 * Severity is the outline rather than the fill because a fill by the maximum
 * turns the whole world red at low zoom — almost any cluster of twenty events
 * contains a critical one — and a fill by the average lands every cluster on
 * the same muddy middle colour.
 *
 * Filtering goes through `setEventData`, not layer filters. A layer filter
 * hides points after clustering, so a cluster would still say "40" with half
 * of them filtered out; replacing the data re-clusters what is left.
 */

import { FONT_MEDIUM, FONT_REGULAR, type BasemapExtension } from "@acc/decho-basemap";
import { BUILTIN_REGISTRY, categoryMeta, type CategoryRegistry } from "./categories";
import {
  SEVERITIES,
  severityRank,
  type EventCategory,
  type MonitorEvent,
  type Severity,
} from "./mockEvents";

export const SEVERITY_COLOURS: Record<Severity, string> = {
  low: "#6f9fc9",
  moderate: "#e0b64a",
  high: "#ef7d3c",
  critical: "#e5484d",
};

export const EVENTS_SOURCE = "events";

/** Every layer id this module owns, for hit-testing and teardown. */
export const EVENT_LAYERS = {
  clusterHalo: "events-cluster-halo",
  cluster: "events-cluster",
  clusterCount: "events-cluster-count",
  pointHalo: "events-point-halo",
  point: "events-point",
  selected: "events-selected",
  label: "events-label",
} as const;

/** Clusters stop forming above this zoom; every event is its own point. */
export const CLUSTER_MAX_ZOOM = 11;

export interface EventFilter {
  /**
   * Categories switched off. A set of what is hidden rather than what is
   * shown, so a category that appears later — a custom one from Workshop —
   * is visible until someone turns it off.
   */
  hidden: ReadonlySet<EventCategory>;
  minSeverity: Severity;
  /**
   * Only events newer than this many ms before `now`; null for all. Events
   * with no time pass every window — a source that does not say when cannot
   * be said to be old.
   */
  windowMs: number | null;
  now: number;
}

export function filterEvents(
  events: readonly MonitorEvent[],
  filter: EventFilter,
): MonitorEvent[] {
  const minRank = severityRank(filter.minSeverity);
  const since = filter.windowMs == null ? -Infinity : filter.now - filter.windowMs;
  return events.filter(
    (event) =>
      !filter.hidden.has(event.category) &&
      severityRank(event.severity) >= minRank &&
      (event.time == null || event.time >= since),
  );
}

export interface EventFeatureProperties {
  id: string;
  category: EventCategory;
  severity: number;
  title: string;
}

export interface EventFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: number;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: EventFeatureProperties;
  }>;
}

/** Only what the layers read travels to the worker; the rest stays in React. */
export function toFeatureCollection(
  events: readonly MonitorEvent[],
): EventFeatureCollection {
  return {
    type: "FeatureCollection",
    features: events.map((event, index) => ({
      type: "Feature",
      id: index,
      geometry: { type: "Point", coordinates: [event.lon, event.lat] },
      properties: {
        id: event.id,
        category: event.category,
        severity: severityRank(event.severity),
        title: event.title,
      },
    })),
  };
}

function clusterProperties(): Record<string, unknown> {
  return { maxSeverity: ["max", ["get", "severity"]] };
}

/** A `match` over a numeric severity property, returning its colour. */
function severityColour(property: string): unknown[] {
  return [
    "match",
    ["get", property],
    ...SEVERITIES.flatMap((severity) => [
      severityRank(severity),
      SEVERITY_COLOURS[severity],
    ]),
    SEVERITY_COLOURS.low,
  ];
}

/**
 * Cluster sizes, and the colour for each: the same thresholds as the radius,
 * so a bigger bubble is always a hotter one.
 */
export const CLUSTER_STEPS: ReadonlyArray<{ from: number; colour: string; radius: number }> = [
  { from: 0, colour: "#f2c14e", radius: 14 },
  { from: 10, colour: "#f08a3c", radius: 18 },
  { from: 50, colour: "#e0503f", radius: 23 },
  { from: 150, colour: "#a8233a", radius: 29 },
];

function byClusterSize(
  value: (step: (typeof CLUSTER_STEPS)[number]) => string | number,
): unknown[] {
  const [first, ...rest] = CLUSTER_STEPS;
  return [
    "step",
    ["get", "point_count"],
    value(first),
    ...rest.flatMap((step) => [step.from, value(step)]),
  ];
}

const HAS_CRITICAL = ["==", ["get", "maxSeverity"], severityRank("critical")];

/** A `match` from a feature's category to its colour. Shared with areasLayer.ts. */
export function categoryColour(registry: CategoryRegistry): unknown[] {
  return [
    "match",
    ["get", "category"],
    ...registry.order.flatMap((category) => [category, registry.byId[category].colour]),
    categoryMeta(registry, "other").colour,
  ];
}

const IS_CLUSTER = ["has", "point_count"];
const IS_POINT = ["!", ["has", "point_count"]];

/**
 * The selection ring's filter. Unclustered points only: a selected event inside
 * a cluster has no position of its own at that zoom, so the ring waits until it
 * is split out rather than circling the whole cluster.
 */
export function selectionFilter(id: string | null): unknown[] {
  return ["all", IS_POINT, ["==", ["get", "id"], id ?? ""]];
}

/* eslint-disable @typescript-eslint/no-explicit-any --
   Layer specifications are untyped for the reason the basemap's
   StyleContribution gives: MapLibre validates the assembled style. */
export function eventLayers(registry: CategoryRegistry = BUILTIN_REGISTRY): any[] {
  return [
    {
      id: EVENT_LAYERS.clusterHalo,
      type: "circle",
      source: EVENTS_SOURCE,
      filter: IS_CLUSTER,
      paint: {
        "circle-color": byClusterSize((step) => step.colour),
        "circle-opacity": 0.25,
        "circle-radius": byClusterSize((step) => step.radius + 8),
      },
    },
    {
      id: EVENT_LAYERS.cluster,
      type: "circle",
      source: EVENTS_SOURCE,
      filter: IS_CLUSTER,
      paint: {
        "circle-color": byClusterSize((step) => step.colour),
        "circle-opacity": 0.92,
        "circle-radius": byClusterSize((step) => step.radius),
        "circle-stroke-width": ["case", HAS_CRITICAL, 2.5, 1.5],
        "circle-stroke-color": [
          "case",
          HAS_CRITICAL,
          SEVERITY_COLOURS.critical,
          "rgba(255,255,255,0.85)",
        ],
      },
    },
    {
      id: EVENT_LAYERS.clusterCount,
      type: "symbol",
      source: EVENTS_SOURCE,
      filter: IS_CLUSTER,
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": FONT_MEDIUM,
        "text-size": 12,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.35)",
        "text-halo-width": 1,
      },
    },
    {
      // A soft ring under high and critical events, so the ones that matter
      // stand out in a dense scatter without a legend lookup.
      id: EVENT_LAYERS.pointHalo,
      type: "circle",
      source: EVENTS_SOURCE,
      filter: ["all", IS_POINT, [">=", ["get", "severity"], 3]],
      paint: {
        "circle-color": severityColour("severity"),
        "circle-opacity": 0.28,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 9, 10, 16],
      },
    },
    {
      id: EVENT_LAYERS.point,
      type: "circle",
      source: EVENTS_SOURCE,
      filter: IS_POINT,
      paint: {
        "circle-color": categoryColour(registry),
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          ["+", 3, ["get", "severity"]],
          10,
          ["+", 5, ["*", 1.5, ["get", "severity"]]],
        ],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(255,255,255,0.9)",
      },
    },
    {
      id: EVENT_LAYERS.selected,
      type: "circle",
      source: EVENTS_SOURCE,
      filter: selectionFilter(null),
      paint: {
        "circle-color": "rgba(0,0,0,0)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 12, 10, 20],
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
      },
    },
    {
      // Titles once there is room for them. Optional, so a crowded view drops
      // labels rather than points.
      id: EVENT_LAYERS.label,
      type: "symbol",
      source: EVENTS_SOURCE,
      filter: IS_POINT,
      minzoom: 7,
      layout: {
        "text-field": ["get", "title"],
        "text-font": FONT_REGULAR,
        "text-size": 11,
        "text-anchor": "left",
        "text-offset": [1.2, 0],
        "text-max-width": 14,
        "text-optional": true,
      },
      paint: {
        "text-color": "#1d2329",
        "text-halo-color": "rgba(255,255,255,0.9)",
        "text-halo-width": 1.4,
      },
    },
  ];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The extension. `initial` seeds the source; later changes go through
 * `setEventData` so the map is not rebuilt every time a filter moves.
 */
export function eventsExtension(
  initial: readonly MonitorEvent[],
  registry: CategoryRegistry = BUILTIN_REGISTRY,
): BasemapExtension {
  return {
    id: "events",
    style: () => ({
      sources: {
        [EVENTS_SOURCE]: {
          type: "geojson",
          data: toFeatureCollection(initial),
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterProperties: clusterProperties(),
        },
      },
      // No `before`: events draw over everything, labels included, because
      // they are the subject of this map and the basemap is the backdrop.
      layers: eventLayers(registry),
    }),
  };
}

/** The slice of a GeoJSON source this page uses. */
export interface EventsSource {
  setData(data: EventFeatureCollection): unknown;
  getClusterExpansionZoom(clusterId: number): Promise<number>;
  getClusterLeaves(
    clusterId: number,
    limit: number,
    offset: number,
  ): Promise<Array<{ properties?: Record<string, unknown> | null }>>;
}

/** Point colours for a registry that changed after the map was built. */
export function setCategoryColours(
  map: {
    getLayer(id: string): unknown;
    setPaintProperty(layer: string, name: string, value: unknown): unknown;
  },
  registry: CategoryRegistry,
): void {
  if (map.getLayer(EVENT_LAYERS.point)) {
    map.setPaintProperty(EVENT_LAYERS.point, "circle-color", categoryColour(registry));
  }
}

export function setEventData(
  map: { getSource(id: string): unknown },
  events: readonly MonitorEvent[],
): void {
  const source = map.getSource(EVENTS_SOURCE) as EventsSource | undefined;
  source?.setData(toFeatureCollection(events));
}

/** How many of a cluster's events are in each category, largest first. */
export function clusterBreakdown(
  leaves: ReadonlyArray<{ properties?: Record<string, unknown> | null }>,
): Array<{ category: EventCategory; count: number }> {
  const counts = new Map<string, number>();
  for (const leaf of leaves) {
    const category = leaf.properties?.category;
    if (typeof category === "string") {counts.set(category, (counts.get(category) ?? 0) + 1);}
  }
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
