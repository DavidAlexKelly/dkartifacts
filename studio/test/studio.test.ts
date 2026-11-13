import { describe, expect, it } from "vitest";
import expected from "./fixtures/expected-paths.json";
import contoursManifest from "./fixtures/contours.manifest.json";
import terrainManifest from "./fixtures/terrain.manifest.json";
import { manifestFiles, parseManifest, pyramidResolver, type LayerManifest } from "../src/data/manifest";
import { deleteVertex, insertVertex, lengthM, moveVertex, polygonAreaM2, vertices } from "../src/map/geometry";
import { buildStyle } from "../src/map/style";
import { historyReducer, type History } from "../src/project/reducer";
import { defaultVectorStyle, newProject, type VectorLayerNode } from "../src/project/types";
import { parseCsv, parseGpx, parseKml, parseWkt, toCsv, toKml, toWkt } from "../src/formats/vector";

describe("manifest resolver", () => {
  // Expectations come from terrain-gen's Python port of decho-basemap's
  // manifestResolver, run over the real tiles it chunked. Both languages must
  // put every tile in the same archive.
  for (const [name, manifest] of [["terrain", terrainManifest], ["contours", contoursManifest]] as const) {
    it(`agrees with terrain-gen for every sampled ${name} tile`, () => {
      const m = parseManifest(manifest, name);
      const r = pyramidResolver(m);
      const cases = (expected as unknown as Record<string, Array<[number, number, number, string | null]>>)[name];
      expect(cases.length).toBeGreaterThan(20);
      for (const [z, x, y, path] of cases) {
        expect(r.pathForTile(z, x, y)?.path ?? null, `${z}/${x}/${y}`).toBe(path);
      }
    });
  }

  it("carries each archive's hash so the cache can key on content", () => {
    const m = parseManifest(terrainManifest, "terrain");
    const files = manifestFiles(m);
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) {expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);}
    const hit = pyramidResolver(m).pathForTile(0, 0, 0);
    expect(hit?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects manifests that are not decho-layer/1", () => {
    expect(() => parseManifest({ version: 1, gridOrigin: {}, layers: [] }, "old")).toThrow(/schema/);
  });

  it("accepts the legacy tuple cell form", () => {
    const m: LayerManifest = {
      schema: "decho-layer/1", id: "x", kind: "vector-tiles", title: "x",
      gridOrigin: { lon: -180, lat: 85 },
      layers: [{ id: "g", type: "grid", minZoom: 5, maxZoom: 5, cellDeg: 2, pathTemplate: "c{col}_r{row}.pmtiles", cells: [[90, 18]] }],
    };
    // z5 tile 16/11 has its north-west corner at 0°E, 48.92°N: cell (90, 18).
    expect(pyramidResolver(m).pathForTile(5, 16, 11)?.path).toBe("c090_r018.pmtiles");
    // 15/11 starts at 11.25°W, cell (84, 18), which the allow-list does not have.
    expect(pyramidResolver(m).pathForTile(5, 15, 11)).toBeNull();
  });
});

describe("project history", () => {
  const start = (): History => ({ past: [], present: newProject(), future: [] });
  const layer: VectorLayerNode = {
    kind: "vector", id: "v1", title: "v", visible: true, opacity: 1, style: defaultVectorStyle(0),
    data: { type: "FeatureCollection", features: [] }, fields: ["name"],
  };

  it("undoes and redoes content but not the camera", () => {
    let h = start();
    h = historyReducer(h, { type: "addLayer", layer });
    h = historyReducer(h, { type: "addFeature", layerId: "v1", feature: { type: "Feature", id: "f1", geometry: { type: "Point", coordinates: [1, 2] }, properties: { name: "a" } } });
    h = historyReducer(h, { type: "setView", view: { center: [5, 5], zoom: 9, bearing: 0, pitch: 0 } });
    expect(h.past.length).toBe(2); // the view change is not an undo step
    h = historyReducer(h, { type: "undo" });
    expect((h.present.layers[0] as VectorLayerNode).data.features).toHaveLength(0);
    expect(h.present.view.zoom).toBe(9);
    h = historyReducer(h, { type: "redo" });
    expect((h.present.layers[0] as VectorLayerNode).data.features).toHaveLength(1);
  });

  it("edits a property and removes a field everywhere", () => {
    let h = start();
    h = historyReducer(h, { type: "addLayer", layer });
    h = historyReducer(h, { type: "addFeature", layerId: "v1", feature: { type: "Feature", id: "f1", geometry: { type: "Point", coordinates: [1, 2] }, properties: { name: "a", n: 1 } } });
    h = historyReducer(h, { type: "setProperty", layerId: "v1", featureId: "f1", field: "n", value: 2 });
    expect((h.present.layers[0] as VectorLayerNode).data.features[0].properties.n).toBe(2);
    h = historyReducer(h, { type: "removeField", layerId: "v1", field: "n" });
    expect((h.present.layers[0] as VectorLayerNode).data.features[0].properties).toEqual({ name: "a" });
  });

  it("moves layers within bounds", () => {
    let h = start();
    h = historyReducer(h, { type: "addLayer", layer });
    h = historyReducer(h, { type: "addLayer", layer: { ...layer, id: "v2" } });
    h = historyReducer(h, { type: "moveLayer", id: "v2", delta: -1 });
    expect(h.present.layers.map((l) => l.id)).toEqual(["v2", "v1"]);
    const same = historyReducer(h, { type: "moveLayer", id: "v2", delta: -1 });
    expect(same).toBe(h);
  });
});

describe("geometry editing", () => {
  const square = { type: "Polygon" as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };

  it("lists ring vertices without the closing duplicate", () => {
    expect(vertices(square)).toHaveLength(4);
  });

  it("moving the first vertex keeps the ring closed", () => {
    const g = moveVertex(square, [0, 0], [-1, -1]) as typeof square;
    expect(g.coordinates[0][0]).toEqual([-1, -1]);
    expect(g.coordinates[0][4]).toEqual([-1, -1]);
    expect(square.coordinates[0][0]).toEqual([0, 0]); // input untouched
  });

  it("inserts and deletes, refusing to break a ring", () => {
    const five = insertVertex(square, [0, 1], [0.5, -0.5]) as typeof square;
    expect(five.coordinates[0]).toHaveLength(6);
    const tri = deleteVertex(square, [0, 1]) as typeof square;
    expect(tri.coordinates[0]).toHaveLength(4);
    expect(deleteVertex(tri, [0, 1])).toBeNull();
  });

  it("measures roughly right", () => {
    expect(lengthM([[0, 0], [0, 1]])).toBeCloseTo(111195, -2);
    // 1° x 1° at the equator is about 12,364 km²
    expect(polygonAreaM2(square.coordinates) / 1e6).toBeCloseTo(12364, -2);
  });
});

describe("vector formats", () => {
  it("reads CSV with quoted fields, lat/lon detection and types", () => {
    const r = parseCsv('name,lat,lon,height,note\n"Galdhøpiggen, top",61.6364,8.3125,2469,"say ""hi"""\nnowhere,,,1,\n');
    expect(r.features).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.features[0].geometry).toEqual({ type: "Point", coordinates: [8.3125, 61.6364] });
    expect(r.features[0].properties).toMatchObject({ name: "Galdhøpiggen, top", height: 2469, note: 'say "hi"' });
    expect(r.fields).toEqual(["name", "height", "note"]);
  });

  it("round-trips WKT", () => {
    for (const wkt of ["POINT (1 2)", "LINESTRING (0 0, 1 1, 2 0)", "POLYGON ((0 0, 1 0, 1 1, 0 0), (0.2 0.2, 0.3 0.2, 0.3 0.3, 0.2 0.2))", "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))"]) {
      expect(toWkt(parseWkt(wkt)!)).toBe(wkt);
    }
  });

  it("writes CSV that reads back", () => {
    const r = parseCsv("name,wkt\nA,\"LINESTRING (0 0, 1 1)\"\n");
    const back = parseCsv(toCsv(r.features, r.fields));
    expect(back.features[0].geometry).toEqual(r.features[0].geometry);
    expect(back.features[0].properties.name).toBe("A");
  });

  it("reads KML it wrote", () => {
    const r = parseCsv("name,type,lat,lon\nLom,village,61.8381,8.5672\n");
    const kml = toKml("t", r.features, r.fields, "name");
    const back = parseKml(kml);
    expect(back.features[0].geometry).toEqual({ type: "Point", coordinates: [8.5672, 61.8381] });
    expect(back.features[0].properties).toMatchObject({ name: "Lom", type: "village" });
  });

  it("reads GPX tracks and waypoints", () => {
    const gpx = `<gpx><wpt lat="61" lon="8"><name>camp</name><ele>1200</ele></wpt><trk><name>t</name><trkseg><trkpt lat="61" lon="8"/><trkpt lat="61.1" lon="8.1"/></trkseg></trk></gpx>`;
    const r = parseGpx(gpx);
    expect(r.features.map((f) => f.geometry.type)).toEqual(["Point", "LineString"]);
    expect(r.features[0].properties).toMatchObject({ name: "camp", ele: 1200 });
  });
});

describe("style builder", () => {
  it("draws catalog layers from their manifests and vector layers from the project", () => {
    const p = newProject();
    p.layers = [
      { kind: "catalog", id: "t", catalogId: "terrain", title: "T", visible: true, opacity: 1, options: { hillshade: true, terrain3d: true, exaggeration: 2 } },
      { kind: "catalog", id: "c", catalogId: "contours", title: "C", visible: true, opacity: 1, options: {} },
      {
        kind: "vector", id: "v", title: "V", visible: true, opacity: 1, style: { ...defaultVectorStyle(0), categorize: { field: "type", colors: { peak: "#f00" } } },
        data: { type: "FeatureCollection", features: [{ type: "Feature", id: "f", geometry: { type: "Point", coordinates: [8, 61] }, properties: { type: "peak" } }] }, fields: ["type"],
      },
    ];
    const style = buildStyle(p, {
      entries: new Map(),
      manifests: new Map([["terrain", terrainManifest as unknown as LayerManifest], ["contours", contoursManifest as unknown as LayerManifest]]),
      glyphs: false,
      overlay: { type: "FeatureCollection", features: [] },
      selection: { layerId: "v", featureIds: ["f"] },
      background: "#eee",
    });
    expect(style.terrain).toEqual({ source: "t::dem", exaggeration: 2 });
    expect((style.sources["t::hs"] as { encoding: string }).encoding).toBe("terrarium");
    expect((style.sources["c::src"] as { tiles: string[] }).tiles[0]).toBe("decho://contours/{z}/{x}/{y}");
    const ids = style.layers.map((l) => l.id);
    expect(ids).toContain("t::hillshade");
    expect(ids).toContain("c::lines");
    expect(ids).not.toContain("c::labels"); // no glyphs, no labels
    expect(ids).toContain("v::sel-point");
    expect(ids.indexOf("v::point")).toBeGreaterThan(ids.indexOf("c::lines"));
    expect(ids[ids.length - 1].startsWith("__overlay")).toBe(true);
    expect(style.glyphs).toBeUndefined();
  });
});

describe("basemap layers", () => {
  const manifest = {
    schema: "decho-layer/1", id: "basemap", kind: "vector-tiles", title: "B",
    encoding: { schema: "protomaps" }, gridOrigin: { lon: -180, lat: 85 },
    layers: [{ id: "z0-z6", type: "single", minZoom: 0, maxZoom: 6, path: "z0-z6.pmtiles" }],
  } as LayerManifest;
  const project = () => {
    const p = newProject();
    p.layers = [{ kind: "catalog", id: "b", catalogId: "basemap", title: "B", visible: true, opacity: 1, options: { flavor: "dark", labels: true } }];
    return p;
  };
  const ctx = (glyphs: boolean) => ({
    entries: new Map(), manifests: new Map([["basemap", manifest]]), glyphs,
    overlay: { type: "FeatureCollection" as const, features: [] }, selection: null, background: "#000",
  });

  it("uses the Protomaps layers, with glyphs and the flavor's sprite when assets exist", () => {
    const style = buildStyle(project(), ctx(true));
    const ids = style.layers.map((l) => l.id);
    expect(ids.filter((id) => id.startsWith("b::")).length).toBeGreaterThan(30);
    expect(style.layers.some((l) => l.type === "symbol" && l.id.startsWith("b::"))).toBe(true);
    expect(style.glyphs).toBe("decho-glyphs://{fontstack}/{range}.pbf");
    expect(style.sprite).toBe("decho-sprite://dark");
    expect((style.sources["b::src"] as { tiles: string[] }).tiles[0]).toBe("decho://basemap/{z}/{x}/{y}");
  });

  it("drops label layers, not the map, when there are no glyphs", () => {
    const style = buildStyle(project(), ctx(false));
    expect(style.layers.some((l) => l.type === "symbol")).toBe(false);
    expect(style.layers.some((l) => l.type === "fill" && l.id.startsWith("b::"))).toBe(true);
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
  });
});
