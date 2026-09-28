/**
 * The pure half of loading real sources: CSV, locations, column detection,
 * records → events/areas, and the source list. The Foundry reads themselves
 * need a Foundry and are exercised by using the page.
 */

import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { decodeGeohash, parsePoint, parseShape, shapeAnchor, shapeBounds } from "./geo";
import {
  categoryFrom,
  detectFields,
  featuresToRecords,
  flattenRecord,
  interpretRecords,
  parseTime,
  recordsFromJson,
  severityFromText,
  severityScaleOf,
  withTitle,
} from "./interpret";
import { parseSourceInput, sourceKey, sourcesFromSearch } from "./config";

const NOW = Date.UTC(2026, 8, 28, 12);
const ctx = { sourceKey: "dataset:test", sourceLabel: "Test data", now: NOW };

const DATASET = "ri.foundry.main.dataset.0f0e6b1a-3c7a-4a52-9d49-0a1b2c3d4e5f";
const MEDIA_SET = "ri.mio.main.media-set.0f0e6b1a-3c7a-4a52-9d49-0a1b2c3d4e5f";
const MEDIA_ITEM = "ri.mio.main.media-item.1a2b3c4d-3c7a-4a52-9d49-0a1b2c3d4e5f";

describe("CSV", () => {
  it("keeps quoted commas, quotes and line breaks inside one field", () => {
    const rows = parseCsv('id,notes,geo\r\n1,"Shelling, then ""quiet""\nafter dark","{""lat"": 48.1, ""lng"": 37.9}"\r\n2,plain,\n');
    expect(rows).toEqual([
      { id: "1", notes: 'Shelling, then "quiet"\nafter dark', geo: '{"lat": 48.1, "lng": 37.9}' },
      { id: "2", notes: "plain", geo: "" },
    ]);
  });

  it("ignores a byte-order mark", () => {
    expect(Object.keys(parseCsv("﻿name,value\na,1\n")[0])).toEqual(["name", "value"]);
  });
});

describe("locations", () => {
  it("reads every point spelling", () => {
    const expected = { lat: 51.5, lng: -0.12 };
    expect(parsePoint('{"type":"Point","coordinates":[-0.12,51.5]}')).toEqual(expected);
    expect(parsePoint({ latitude: 51.5, longitude: -0.12 })).toEqual(expected);
    expect(parsePoint({ lat: "51.5", lon: "-0.12" })).toEqual(expected);
    expect(parsePoint("51.5, -0.12")).toEqual(expected);
    expect(parsePoint("POINT (-0.12 51.5)")).toEqual(expected);
  });

  it("only reads geohashes when told the column is geo", () => {
    expect(parsePoint("gcpvj0")).toBeNull();
    const point = parsePoint("gcpvj0", { geohash: true })!;
    expect(point.lat).toBeCloseTo(51.5, 1);
    expect(point.lng).toBeCloseTo(-0.12, 1);
    expect(decodeGeohash("u4pruydqqvj")!.lat).toBeCloseTo(57.649, 2);
  });

  it("rejects what is not a location", () => {
    for (const value of [null, "", "hello", "{}", "999, 999", { lat: 1 }, 42]) {
      expect(parsePoint(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("reads WKT points strictly", () => {
    expect(parsePoint("point z (-0.12 51.5 30)")).toEqual({ lat: 51.5, lng: -0.12 });
    expect(parsePoint("POINT(-0.12 51.5)")).toEqual({ lat: 51.5, lng: -0.12 });
    expect(parsePoint("POINTLESS (1 2)")).toBeNull();
    expect(parsePoint("POINT (0x10 1)")).toBeNull();
    expect(parsePoint("POINT (1)")).toBeNull();
    expect(parsePoint("1, 2, 3")).toBeNull();
    expect(parsePoint("1., 2")).toBeNull();
    expect(parseShape("LINESTRING Z (30 10 1, 10 30 1)")?.type).toBe("LineString");
  });

  it("stays linear on hostile input", () => {
    // The shape of string a backtracking pattern chokes on: long runs of
    // whitespace and digits that almost, but never quite, match.
    const hostile = [
      `POINT (${" ".repeat(200_000)}1`,
      `POINT (${"1".repeat(200_000)} `,
      `${"1".repeat(200_000)},`,
      `POLYGON ((${"0 0,".repeat(50_000)}`,
    ];
    const started = performance.now();
    for (const value of hostile) {
      expect(parsePoint(value)).toBeNull();
      expect(parseShape(value)).toBeNull();
    }
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("reads WKT and GeoJSON shapes", () => {
    const polygon = parseShape("POLYGON ((30 10, 40 40, 20 40, 10 20, 30 10))");
    expect(polygon?.type).toBe("Polygon");
    const multi = parseShape("MULTIPOLYGON (((30 20, 45 40, 10 40, 30 20)), ((15 5, 40 10, 10 20, 5 10, 15 5)))");
    expect(multi?.type).toBe("MultiPolygon");
    expect(parseShape("LINESTRING (30 10, 10 30, 40 40)")?.type).toBe("LineString");
    expect(parseShape({ type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } })?.type).toBe("LineString");
    expect(parseShape('{"type":"Point","coordinates":[0,0]}')).toBeNull();
    expect(parseShape("POLYGON ((broken")).toBeNull();
  });

  it("finds a shape's anchor and bounds", () => {
    const square = parseShape("POLYGON ((0 0, 2 0, 2 2, 0 2, 0 0))")!;
    expect(shapeBounds(square)).toEqual([[0, 0], [2, 2]]);
    expect(shapeAnchor(square)!.lat).toBeCloseTo(0.8, 5);
  });
});

describe("values", () => {
  it("reads times as ISO, epoch seconds and epoch milliseconds", () => {
    const iso = Date.UTC(2026, 8, 20, 6, 30);
    expect(parseTime("2026-09-20T06:30:00Z", NOW)).toBe(iso);
    expect(parseTime(iso / 1000, NOW)).toBe(iso);
    expect(parseTime(String(iso), NOW)).toBe(iso);
    expect(parseTime("not a date", NOW)).toBeNull();
    expect(parseTime("2024", NOW)).toBe(Date.UTC(2024, 0, 1));
    expect(parseTime(42, NOW)).toBeNull();
    expect(parseTime(NOW + 5 * 365 * 24 * 3600 * 1000, NOW)).toBeNull();
  });

  it("maps source vocabularies onto the categories", () => {
    expect(categoryFrom(["Battles"])).toBe("conflict");
    expect(categoryFrom(["Explosions/Remote violence"])).toBe("conflict");
    expect(categoryFrom(["Protests"])).toBe("protest");
    expect(categoryFrom(["Riots"])).toBe("protest");
    expect(categoryFrom(["Strategic developments"])).toBe("military");
    expect(categoryFrom(["earthquake"])).toBe("earthquake");
    expect(categoryFrom(["Flash flood"])).toBe("weather");
    expect(categoryFrom(["Airstrike"])).toBe("conflict");
    expect(categoryFrom(["Labour strike"])).toBe("protest");
    expect(categoryFrom(["Ransomware"])).toBe("cyber");
    expect(categoryFrom(["Disease outbreaks"])).toBe("outbreak");
    expect(categoryFrom(["something else"])).toBeNull();
    expect(categoryFrom(["", "Wildfire near Attica"])).toBe("wildfire");
  });

  it("maps severity words", () => {
    expect(severityFromText("Severe")).toBe("critical");
    expect(severityFromText("HIGH")).toBe("high");
    expect(severityFromText("amber")).toBe("moderate");
    expect(severityFromText("minor")).toBe("low");
    expect(severityFromText("unknown")).toBeNull();
  });
});

describe("an ACLED-style table", () => {
  const rows = parseCsv(
    [
      "event_id_cnty,event_date,event_type,sub_event_type,country,location,latitude,longitude,notes,fatalities,source",
      'UKR123,2026-09-27,Battles,Armed clash,Ukraine,Pokrovsk,48.2833,37.1833,"Clashes reported, heavy losses.",12,Local media',
      "UKR124,2026-09-26,Protests,Peaceful protest,Ukraine,Kyiv,50.45,30.52,Rally in centre,0,Local media",
      "UKR125,2026-09-26,Strategic developments,Looting,Ukraine,Unknown,,,No coordinates,0,Local media",
    ].join("\n"),
  );
  const map = detectFields(Object.keys(rows[0]), rows);
  const result = interpretRecords(rows, map, ctx);

  it("finds the columns", () => {
    expect(map.geo).toEqual({ kind: "latlng", lat: "latitude", lng: "longitude" });
    expect(map.id).toBe("event_id_cnty");
    expect(map.time).toBe("event_date");
    expect(map.category).toBe("event_type");
    expect(map.casualties).toBe("fatalities");
    expect(map.summary).toBe("notes");
    expect(map.place).toBe("location");
    expect(map.country).toBe("country");
    expect(map.source).toBe("source");
  });

  it("turns located rows into events and counts the rest", () => {
    expect(result.events).toHaveLength(2);
    expect(result.skipped).toBe(1);
    const [battle, protest] = result.events;
    expect(battle).toMatchObject({
      id: "dataset:test:UKR123",
      category: "conflict",
      severity: "high",
      place: "Pokrovsk",
      country: "Ukraine",
      lat: 48.2833,
      lon: 37.1833,
      time: Date.UTC(2026, 8, 27),
      source: "Local media",
      summary: "Clashes reported, heavy losses.",
    });
    expect(battle.metrics[0]).toEqual({ label: "Fatalities", value: "12" });
    expect(protest.category).toBe("protest");
    expect(protest.severity).toBe("low");
  });

  it("titles an event by what and where when there is no title column", () => {
    expect(result.events[0].title).toBe("Battles — Pokrovsk");
  });
});

describe("a USGS-style feed", () => {
  const records = [
    { id: "us7000abcd", mag: 6.8, place: "120 km E of Miyako, Japan", time: Date.UTC(2026, 8, 27, 3), type: "earthquake", geometry: '{"type":"Point","coordinates":[143.3,39.6,10]}' },
    { id: "us7000abce", mag: 4.1, place: "Central Chile", time: Date.UTC(2026, 8, 26, 9), type: "earthquake", geometry: '{"type":"Point","coordinates":[-70.9,-33.4,80]}' },
  ];
  const map = detectFields(Object.keys(records[0]), records);
  const { events } = interpretRecords(records, map, ctx);

  it("reads GeoJSON points, epoch times and magnitude", () => {
    expect(map.geo).toEqual({ kind: "point", field: "geometry" });
    expect(map.magnitude).toBe("mag");
    expect(events.map((e) => e.severity)).toEqual(["critical", "low"]);
    expect(events[0]).toMatchObject({ category: "earthquake", lat: 39.6, lon: 143.3, time: Date.UTC(2026, 8, 27, 3) });
    expect(events[0].metrics[0]).toEqual({ label: "Mag", value: "6.8" });
  });
});

describe("GeoJSON with points and zones", () => {
  const collection = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", id: "a", geometry: { type: "Point", coordinates: [34.4, 31.45] }, properties: { name: "Strike reported", category: "conflict", severity: 4 } },
      { type: "Feature", geometry: { type: "MultiPoint", coordinates: [[35, 33], [35.2, 33.1]] }, properties: { name: "Patrols", category: "military", severity: 1 } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[34, 31], [35, 31], [35, 32], [34, 32], [34, 31]]] }, properties: { name: "Exclusion zone", type: "military zone" } },
    ],
  };
  const records = featuresToRecords(collection);
  const map = detectFields(Object.keys(Object.assign({}, ...records)), records);
  const result = interpretRecords(records, map, { ...ctx, sourceKey: "mediaset:x" });

  it("makes events of points and areas of shapes", () => {
    expect(result.events).toHaveLength(3);
    expect(result.areas).toHaveLength(1);
    expect(result.areas[0]).toMatchObject({ name: "Exclusion zone", category: "military" });
    expect(result.areas[0].geometry.type).toBe("Polygon");
  });

  it("reads a 1–4 severity column on its own scale", () => {
    const strike = result.events.find((e) => e.title === "Strike reported")!;
    expect(strike.severity).toBe("critical");
    expect(strike.id).toBe("mediaset:x:a");
    expect(result.events.filter((e) => e.title === "Patrols")).toHaveLength(2);
  });

  it("accepts a bare array of records too", () => {
    expect(recordsFromJson([{ lat: 1, lng: 2 }])).toEqual([{ lat: 1, lng: 2 }]);
    expect(recordsFromJson({ incidents: [{ lat: 1, lng: 2 }] })).toEqual([{ lat: 1, lng: 2 }]);
    expect(recordsFromJson(collection)).toHaveLength(4);
  });
});

describe("stream records", () => {
  it("lifts a JSON value column to the top level, leaving locations alone", () => {
    const flat = flattenRecord({
      timestamp: "2026-09-28T10:00:00Z",
      value: '{"callsign":"RCH123","lat":50.1,"lng":8.6,"alert":"High"}',
      position: { type: "Point", coordinates: [8.6, 50.1] },
    });
    expect(flat).toEqual({
      timestamp: "2026-09-28T10:00:00Z",
      callsign: "RCH123",
      lat: 50.1,
      lng: 8.6,
      alert: "High",
      position: { type: "Point", coordinates: [8.6, 50.1] },
    });
  });

  it("gives records without an id a stable one across batches", () => {
    const records = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
    const map = detectFields(["lat", "lng"], records);
    const first = interpretRecords(records, map, { ...ctx, firstIndex: 0 });
    const second = interpretRecords(records, map, { ...ctx, firstIndex: 2 });
    expect([...first.events, ...second.events].map((e) => e.id)).toEqual([
      "dataset:test:0",
      "dataset:test:1",
      "dataset:test:2",
      "dataset:test:3",
    ]);
  });

  it("falls back to the source's default category, then 'other'", () => {
    const records = [{ lat: 1, lng: 1, title: "Something happened" }];
    const map = detectFields(["lat", "lng", "title"], records);
    expect(interpretRecords(records, map, { ...ctx, defaultCategory: "cyber" }).events[0].category).toBe("cyber");
    expect(interpretRecords(records, map, ctx).events[0].category).toBe("other");
  });

  it("skips everything when nothing locates", () => {
    const records = [{ name: "a" }, { name: "b" }];
    const map = detectFields(["name"], records);
    expect(map.geo).toBeNull();
    expect(interpretRecords(records, map, ctx)).toEqual({ events: [], areas: [], skipped: 2 });
  });
});

describe("source configuration", () => {
  it("accepts the widget's formats", () => {
    expect(parseSourceInput("dataset", ` ${DATASET} `)).toEqual({ ok: true, config: { kind: "dataset", rid: DATASET, category: undefined } });
    expect(parseSourceInput("mediaset", `${MEDIA_SET}::zones/incidents.geojson`)).toMatchObject({ ok: true, config: { rid: MEDIA_SET, item: "zones/incidents.geojson" } });
    expect(parseSourceInput("mediaset", `${MEDIA_SET}::${MEDIA_ITEM}`)).toMatchObject({ ok: true, config: { item: MEDIA_ITEM } });
  });

  it("explains what is wrong with a bad entry", () => {
    const noItem = parseSourceInput("mediaset", MEDIA_SET);
    expect(noItem.ok).toBe(false);
    expect(!noItem.ok && noItem.error).toContain("::");
    expect(parseSourceInput("dataset", "ri.foundry.main.dataset.nope").ok).toBe(false);
    expect(parseSourceInput("stream", MEDIA_SET).ok).toBe(false);
  });

  it("reads sources from the URL, dropping duplicates and junk", () => {
    const configs = sourcesFromSearch(
      `?dataset=${DATASET}&dataset=${DATASET}&stream=${DATASET}&mediaset=${encodeURIComponent(`${MEDIA_SET}::a.geojson`)}&dataset=junk`,
    );
    expect(configs.map(sourceKey)).toEqual([
      `dataset:${DATASET}`,
      `mediaset:${MEDIA_SET}::a.geojson`,
      `stream:${DATASET}`,
    ]);
  });
});

describe("a chosen title column", () => {
  const records = [
    { callsign: "RCH101", mission: "Tanker orbit", fuel_kg: 12000, lat: 54.5, lng: 18.5 },
    { callsign: "RCH102", mission: "", fuel_kg: 8000, lat: 54.6, lng: 18.7 },
  ];
  const detected = detectFields(Object.keys(records[0]), records);

  it("titles events from that column instead of the detected one", () => {
    expect(detected.title).toBeUndefined();
    const auto = interpretRecords(records, detected, ctx).events.map((e) => e.title);
    expect(auto).toEqual(["Other — RCH101", "Other — RCH102"]);
    const chosen = interpretRecords(records, withTitle(detected, "mission"), ctx).events;
    expect(chosen[0].title).toBe("Tanker orbit");
  });

  it("falls back as usual where the chosen column is empty", () => {
    const [, second] = interpretRecords(records, withTitle(detected, "mission"), ctx).events;
    expect(second.title).toBe("Other — RCH102");
  });

  it("stops treating a numeric column as a metric once it is the title", () => {
    const withMetric = interpretRecords(records, detected, ctx).events[0].metrics;
    expect(withMetric.map((m) => m.label)).toContain("Fuel kg");
    const titled = interpretRecords(records, withTitle(detected, "fuel_kg"), ctx).events[0];
    expect(titled.title).toBe("12000");
    expect(titled.metrics.map((m) => m.label)).not.toContain("Fuel kg");
  });

  it("leaves the mapping alone when nothing is chosen", () => {
    expect(withTitle(detected, undefined)).toBe(detected);
  });
});

describe("severity across batches", () => {
  it("reads a number on a scale fixed by the caller, not the batch", () => {
    const records = [{ lat: 1, lng: 1, severity: 3 }];
    const map = detectFields(["lat", "lng", "severity"], records);
    // Alone, a batch whose largest value is 3 is read on the 1–4 scale: high.
    expect(interpretRecords(records, map, ctx).events[0].severity).toBe("high");
    // On a 1–5 scale seen across the whole stream, 3 is moderate.
    expect(interpretRecords(records, map, { ...ctx, severityMax: 5 }).events[0].severity).toBe("moderate");
    expect(severityScaleOf([...records, { severity: "5" }], map)).toBe(5);
  });
});
