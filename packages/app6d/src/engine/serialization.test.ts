import { describe, it, expect } from "vitest";
import { serializeOrder, migrateOrder, ORDER_SCHEMA_VERSION } from "./serialization";

describe("serializeOrder", () => {
  it("stamps the current schema version onto the given fields", () => {
    const stored = serializeOrder({
      sidc: "svg-seize",
      from: [18.8, 54.26],
      to: [18.9, 54.3],
      colour: "#4a90d9",
    });
    expect(stored).toEqual({
      schemaVersion: ORDER_SCHEMA_VERSION,
      sidc: "svg-seize",
      from: [18.8, 54.26],
      to: [18.9, 54.3],
      colour: "#4a90d9",
    });
  });
});

describe("migrateOrder", () => {
  it("passes through an already-current-version record unchanged", () => {
    const current = {
      schemaVersion: 1 as const,
      sidc: "svg-block",
      from: [1, 2] as [number, number],
      to: [3, 4] as [number, number],
      colour: "#fff",
    };
    expect(migrateOrder(current)).toEqual(current);
  });

  it("upgrades a legacy pre-versioning record with flat lat/lng fields", () => {
    const legacy = {
      tacticSidc: "SVGSEIZE",
      fromLat: 54.26, fromLng: 18.8,
      toLat: 54.3, toLng: 18.9,
      colour: "#4a90d9",
      milxScale: 1.5,
    };
    expect(migrateOrder(legacy)).toEqual({
      schemaVersion: 1,
      sidc: "SVGSEIZE",
      from: [18.8, 54.26],
      to: [18.9, 54.3],
      mid: undefined,
      colour: "#4a90d9",
      milxScale: 1.5,
      milxParams: undefined,
    });
  });

  it("upgrades a legacy record's mid point only when both midLat and midLng are present", () => {
    const withMid = migrateOrder({
      sidc: "svg-block", fromLat: 0, fromLng: 0, toLat: 1, toLng: 1,
      midLat: 0.5, midLng: 0.5, colour: "#000",
    });
    expect(withMid.mid).toEqual([0.5, 0.5]);

    const withoutMid = migrateOrder({
      sidc: "svg-block", fromLat: 0, fromLng: 0, toLat: 1, toLng: 1, colour: "#000",
    });
    expect(withoutMid.mid).toBeUndefined();
  });

  it("defaults missing fields on a legacy record rather than throwing", () => {
    const minimal = migrateOrder({});
    expect(minimal.schemaVersion).toBe(1);
    expect(minimal.sidc).toBe("");
    expect(minimal.from).toEqual([0, 0]);
    expect(minimal.colour).toBe("#4a7c59");
  });
});
