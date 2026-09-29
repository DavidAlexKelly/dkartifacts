/**
 * The event monitor's pure half: the mock data, the filter, and the style the
 * extension contributes. The map interaction needs a WebGL map and is checked
 * by using the page.
 */

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@acc/decho-basemap";
import {
  CLUSTER_MAX_ZOOM,
  EVENTS_SOURCE,
  EVENT_LAYERS,
  categoryColour,
  clusterBreakdown,
  eventsExtension,
  filterEvents,
  selectionFilter,
  toFeatureCollection,
} from "./eventsLayer";
import { SEVERITIES, generateEvents, severityRank } from "./mockEvents";
import { relativeTime } from "./format";
import { BUILTIN_REGISTRY, buildRegistry, parseCustomCategory } from "./categories";

const CATEGORY_ORDER = BUILTIN_REGISTRY.order;

const NOW = Date.UTC(2026, 8, 28, 12);
const DAY = 24 * 60 * 60 * 1000;
const events = generateEvents({ now: NOW });

describe("the mock events", () => {
  it("are deterministic for a seed and a now", () => {
    expect(generateEvents({ now: NOW })).toEqual(events);
    expect(generateEvents({ now: NOW, seed: 1 })).not.toEqual(events);
  });

  it("have unique ids and valid coordinates", () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    for (const event of events) {
      expect(event.lat, event.id).toBeGreaterThanOrEqual(-85);
      expect(event.lat, event.id).toBeLessThanOrEqual(85);
      expect(event.lon, event.id).toBeGreaterThanOrEqual(-180);
      expect(event.lon, event.id).toBeLessThanOrEqual(180);
    }
  });

  it("cover every category and severity", () => {
    // "other" is for real sources whose records match no category.
    expect(new Set(events.map((e) => e.category))).toEqual(
      new Set(CATEGORY_ORDER.filter((c) => c !== "other")),
    );
    expect(new Set(events.map((e) => e.severity))).toEqual(new Set(SEVERITIES));
  });

  it("sit in the 30 days before now, newest first", () => {
    for (const event of events) {
      expect(event.time).toBeLessThanOrEqual(NOW);
      expect(event.time).toBeGreaterThan(NOW - 30 * DAY);
    }
    const times = events.map((e) => e.time);
    expect(times).toEqual([...times].sort((a, b) => (b ?? 0) - (a ?? 0)));
  });

  it("carry something to show in the details panel", () => {
    for (const event of events) {
      expect(event.title.length, event.id).toBeGreaterThan(5);
      expect(event.summary.length, event.id).toBeGreaterThan(20);
      expect(event.metrics.length, event.id).toBeGreaterThan(0);
      expect(event.source, event.id).toContain("(mock)");
    }
  });
});

describe("filtering", () => {
  it("keeps everything with no restriction", () => {
    expect(
      filterEvents(events, { hidden: new Set(), minSeverity: "low", windowMs: null, now: NOW }),
    ).toHaveLength(events.length);
  });

  it("applies category, severity and window together", () => {
    const result = filterEvents(events, {
      hidden: new Set(CATEGORY_ORDER.filter((c) => c !== "conflict")),
      minSeverity: "high",
      windowMs: 7 * DAY,
      now: NOW,
    });
    expect(result.length).toBeGreaterThan(0);
    for (const event of result) {
      expect(event.category).toBe("conflict");
      expect(severityRank(event.severity)).toBeGreaterThanOrEqual(3);
      expect(event.time).toBeGreaterThanOrEqual(NOW - 7 * DAY);
    }
  });

  it("returns nothing when every category is off", () => {
    expect(
      filterEvents(events, { hidden: new Set(CATEGORY_ORDER), minSeverity: "low", windowMs: null, now: NOW }),
    ).toEqual([]);
  });
});

describe("the extension", () => {
  const ctx = {} as ExtensionContext;

  it("contributes one clustered source and its layers", async () => {
    const contribution = await eventsExtension(events).style!(ctx);
    const source = contribution.sources![EVENTS_SOURCE];
    expect(source.type).toBe("geojson");
    expect(source.cluster).toBe(true);
    expect(source.clusterMaxZoom).toBe(CLUSTER_MAX_ZOOM);
    expect(source.data.features).toHaveLength(events.length);

    const ids = contribution.layers!.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.values(EVENT_LAYERS).sort());
    for (const layer of contribution.layers!) {
      expect(layer.source, layer.id).toBe(EVENTS_SOURCE);
    }
  });

  it("aggregates only severity on clusters, so categories can change at runtime", async () => {
    const contribution = await eventsExtension(events).style!(ctx);
    const properties = contribution.sources![EVENTS_SOURCE].clusterProperties;
    expect(properties).toEqual({ maxSeverity: ["max", ["get", "severity"]] });
  });

  it("colours points by the registry it is given, custom categories included", async () => {
    const custom = parseCustomCategory("Border incidents|#ff8800");
    if (!custom.ok) {throw new Error(custom.error);}
    const registry = buildRegistry([custom.def]);
    const contribution = await eventsExtension(events, registry).style!(ctx);
    const point = contribution.layers!.find((layer) => layer.id === EVENT_LAYERS.point);
    expect(JSON.stringify(point.paint["circle-color"])).toContain('"custom:border-incidents","#ff8800"');
    expect(categoryColour(registry)).toEqual(point.paint["circle-color"]);
  });

  it("takes its cluster radius from the options", async () => {
    const contribution = await eventsExtension(events, undefined, { clusterRadius: 80 }).style!(ctx);
    expect(contribution.sources![EVENTS_SOURCE].clusterRadius).toBe(80);
  });

  it("draws every event on its own when clustering is off", async () => {
    const contribution = await eventsExtension(events, undefined, { cluster: false }).style!(ctx);
    const source = contribution.sources![EVENTS_SOURCE];
    expect(source.cluster).toBeUndefined();
    expect(source.clusterProperties).toBeUndefined();
    expect(source.data.features).toHaveLength(events.length);
  });

  it("draws on top rather than under the labels", async () => {
    const contribution = await eventsExtension(events).style!(ctx);
    expect(contribution.before).toBeUndefined();
  });
});

describe("features", () => {
  it("carry only what the layers read", () => {
    const [feature] = toFeatureCollection(events.slice(0, 1)).features;
    expect(Object.keys(feature.properties).sort()).toEqual(
      ["category", "id", "severity", "title"],
    );
    expect(feature.geometry.coordinates).toEqual([events[0].lon, events[0].lat]);
    expect(feature.properties.severity).toBe(severityRank(events[0].severity));
  });

  it("select by id, and nothing by default", () => {
    expect(JSON.stringify(selectionFilter(null))).toContain('""');
    expect(JSON.stringify(selectionFilter("evt-0001"))).toContain("evt-0001");
  });
});

describe("cluster hover", () => {
  it("counts a cluster's events by category, largest first", () => {
    const leaf = (category: string) => ({ properties: { category } });
    const breakdown = clusterBreakdown([
      leaf("conflict"), leaf("protest"), leaf("conflict"), leaf("custom:x"), leaf("conflict"),
      { properties: null },
    ]);
    expect(breakdown).toEqual([
      { category: "conflict", count: 3 },
      { category: "protest", count: 1 },
      { category: "custom:x", count: 1 },
    ]);
  });
});

describe("relative time", () => {
  it("reads in minutes, hours, then days", () => {
    expect(relativeTime(NOW - 5 * 60 * 1000, NOW)).toBe("5 min ago");
    expect(relativeTime(NOW - 3 * 60 * 60 * 1000, NOW)).toBe("3 h ago");
    expect(relativeTime(NOW - 4 * DAY, NOW)).toBe("4 d ago");
    expect(relativeTime(NOW + 1000, NOW)).toBe("1 min ago");
  });
});
