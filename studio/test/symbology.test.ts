import { describe, expect, it } from "vitest";
import { buildGraduated, decorate, legendFor } from "../src/map/symbology";
import { timeValue } from "../src/map/style";
import { invalidFeatures, validateFeature } from "../src/ui/FeatureForm";
import { historyReducer, type History } from "../src/project/reducer";
import { defaultVectorStyle, newProject, type StudioFeature, type VectorLayerNode } from "../src/project/types";

const f = (id: string, props: Record<string, unknown>): StudioFeature => ({ type: "Feature", id, geometry: { type: "Point", coordinates: [8, 61] }, properties: props });
const layer = (features: StudioFeature[], style = {}): VectorLayerNode => ({
  kind: "vector", id: "v", title: "v", visible: true, opacity: 1, style: { ...defaultVectorStyle(0), ...style },
  data: { type: "FeatureCollection", features }, fields: Object.keys(features[0]?.properties ?? {}),
});

describe("symbology", () => {
  const feats = [1, 5, 10, 50, 100].map((v, i) => f(`f${i}`, { v, kind: i % 2 ? "b" : "a" }));

  it("colours graduated classes from the data and labels them", () => {
    const g = buildGraduated(feats, "v", "quantile", 3, "viridis");
    const l = layer(feats, { mode: "graduated", graduated: g });
    const colours = decorate(l, feats).map((x) => x.properties.__c);
    expect(new Set(colours).size).toBe(3);
    expect(colours[0]).toBe(g.colors[0]);
    expect(colours[4]).toBe(g.colors[2]);
    expect(legendFor(l)).toHaveLength(3);
  });

  it("applies the first matching rule, and greys out the rest unless told not to", () => {
    const rules = [{ expr: `"v" >= 50`, color: "#ff0000", label: "big" }, { expr: `"kind" = 'b'`, color: "#00ff00", label: "b" }];
    const out = decorate(layer(feats, { mode: "rules", rules }), feats).map((x) => x.properties.__c);
    expect(out).toEqual(["#9e9e9e", "#00ff00", "#9e9e9e", "#ff0000", "#ff0000"]);
    const hidden = decorate(layer(feats, { mode: "rules", rules, rulesElse: false }), feats)[0].properties.__c;
    expect(hidden).toBe("rgba(0,0,0,0)");
  });

  it("scales proportional symbols by area, and names marker images", () => {
    const out = decorate(layer(feats, { size: { field: "v", min: 2, max: 20 }, marker: "triangle" }), feats);
    expect(out[0].properties.__r).toBe(2);
    expect(out[4].properties.__r).toBe(20);
    expect(out[1].properties.__r as number).toBeLessThan(out[3].properties.__r as number);
    expect(String(out[0].properties.__i)).toMatch(/^shape:triangle:/);
    const mil = decorate(layer([f("u", { sidc: "10031000001211000000" })], { marker: "milsymbol", sidcField: "sidc" }), [f("u", { sidc: "10031000001211000000" })]);
    expect(mil[0].properties.__i).toMatch(/^sidc:10031000001211000000:/);
  });
});

describe("time", () => {
  it("reads ISO strings, epoch seconds and epoch milliseconds", () => {
    expect(timeValue("2026-11-01T06:00:00Z")).toBe(Date.UTC(2026, 10, 1, 6));
    expect(timeValue(1_800_000_000)).toBe(1_800_000_000_000);
    expect(timeValue(1_800_000_000_000)).toBe(1_800_000_000_000);
    expect(timeValue("not a date")).toBeNull();
  });
});

describe("field rules", () => {
  it("flags required, typed and allowed-value fields", () => {
    const l = { ...layer([f("a", { name: "x", n: "7" }), f("b", { name: "alpha", n: 3 })]), schema: { name: { type: "string" as const, required: true, options: ["alpha", "bravo"] }, n: { type: "number" as const } } };
    expect(validateFeature(l, l.data.features[0])).toEqual({ name: "must be one of alpha, bravo", n: "must be a number" });
    expect(validateFeature(l, l.data.features[1])).toEqual({});
    expect(invalidFeatures(l)).toBe(1);
  });
});

describe("edits to a Foundry collection", () => {
  it("tracks a multi-feature change (split, merge, paste) as creates, modifies and deletes", () => {
    const feats = [f("a", {}), f("b", {}), f("c", {})];
    const backed = { ...layer(feats), backing: { kind: "ontology-features" as const, collection: "x" } };
    let h: History = { past: [], present: { ...newProject(), layers: [backed] }, future: [] };
    const moved = { ...feats[0], geometry: { type: "Point" as const, coordinates: [9, 62] } };
    h = historyReducer(h, { type: "replaceFeatures", layerId: "v", features: [moved, feats[1], f("d", {})] });
    expect((h.present.layers[0] as VectorLayerNode).pending).toEqual({ created: ["d"], modified: ["a"], deleted: ["c"] });
  });
});
