// The build script's rules, against hand-made Natural Earth-shaped features.
import { describe, expect, it } from "vitest";

// @ts-expect-error — a plain .mjs module without types.
import * as lib from "./lib.mjs";

/** A Natural Earth-like feature: a square with the given properties. */
function ne(props: Record<string, unknown>, west: number, south: number, east: number, north: number) {
  return {
    type: "Feature",
    properties: { NAME: props.ADM0_A3, ISO_A3_EH: props.ADM0_A3, ADM0_A3_US: -99, ADM0_A3_MA: -99, ADM0_A3_UN: -99, ...props },
    geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
  };
}

const world = () => [
  ne({ ADM0_A3: "MAR", NAME: "Morocco" }, 0, 0, 10, 10),
  ne({ ADM0_A3: "SAH", NAME: "W. Sahara", ISO_A3_EH: "ESH", ADM0_A3_MA: "MAR" }, 0, -10, 10, 0),
  ne({ ADM0_A3: "FRA", NAME: "France", ISO_A3_EH: "FRA", ISO_A3: -99 }, 20, 0, 30, 10),
  ne({ ADM0_A3: "KOS", NAME: "Kosovo", ISO_A3_EH: -99, ADM0_A3_US: "B45" }, 40, 0, 45, 5),
];

describe("ids", () => {
  it("use the ISO code where there is one, Natural Earth's own code where not", () => {
    const ids = lib.assignIds(world());
    expect(Object.fromEntries(ids)).toEqual({ MAR: "MAR", SAH: "ESH", FRA: "FRA", KOS: "KOS" });
  });

  it("fall back to ADM0_A3 for a second feature claiming the same ISO code", () => {
    const ids = lib.assignIds([ne({ ADM0_A3: "AUS" }, 0, 0, 1, 1), ne({ ADM0_A3: "ATC", ISO_A3_EH: "AUS" }, 2, 2, 3, 3)]);
    expect(ids.get("ATC")).toBe("ATC");
  });
});

describe("views", () => {
  it("keep only points of view that draw differently, and share files between identical ones", () => {
    const features = world();
    const views = lib.planViews(features, lib.assignIds(features), "all");
    // UN is all -99: identical to the default, so dropped.
    expect(views.map((v: { id: string; fileKey: string }) => [v.id, v.fileKey])).toEqual([
      ["default", "default"],
      ["us", "us"],
      ["ma", "ma"],
    ]);
    const twins = [...features.map((f) => ({ ...f, properties: { ...f.properties, ADM0_A3_US: f.properties.ADM0_A3_MA } }))];
    const shared = lib.planViews(twins, lib.assignIds(twins), "all");
    const key = (id: string) => shared.find((v: { id: string }) => v.id === id).fileKey;
    expect(key("us")).toBe(key("ma"));
  });

  it("merge what a view counts as one country into a single outline", () => {
    const features = world();
    const ids = lib.assignIds(features);
    const morocco = lib.viewCollection(features, lib.assignmentFor(features, ids, "MA"), 3);
    expect(morocco.features.map((f: { properties: { id: string } }) => f.properties.id)).toEqual(["FRA", "KOS", "MAR"]);
    const merged = morocco.features.find((f: { properties: { id: string } }) => f.properties.id === "MAR");
    expect(merged.geometry.type).toBe("Polygon");
    expect(lib.areaKm2(merged.geometry)).toBeGreaterThan(2_400_000);
  });

  it("give a code no country owns an outline of its own", () => {
    const features = world();
    const assignment = lib.assignmentFor(features, lib.assignIds(features), "US");
    expect(assignment).toEqual(["MAR", "ESH", "FRA", "B45"]);
  });

  it("are labelled by whose point of view they are", () => {
    expect(lib.viewLabel("MA", [ne({ ADM0_A3: "MAR", NAME: "Morocco", ISO_A2_EH: "MA" }, 0, 0, 1, 1)])).toBe("As seen by Morocco");
    expect(lib.viewLabel("KO", [])).toBe("As seen by South Korea");
  });
});

describe("geometry", () => {
  it("rounds, drops points rounding makes duplicate, and drops rings with no area left", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [1.0001, 0], [1.0002, 0], [1, 1], [0, 1], [0, 0]]],
        [[[5, 5], [5.0001, 5], [5, 5.0001], [5, 5]]],
      ],
    };
    expect(lib.roundGeometry(geometry, 2)).toEqual({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });
  });
});

describe("cleaning", () => {
  it("turns a ring that rounding made cross itself into a valid outline", () => {
    // A bow tie: the edges cross at (1, 1).
    const bowTie = { type: "Polygon", coordinates: [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]] };
    const cleaned = lib.clean(bowTie);
    expect(cleaned.type).toBe("MultiPolygon");
    expect(cleaned.coordinates).toHaveLength(2);
    expect(lib.areaKm2(cleaned)).toBeGreaterThan(0);
  });
});

describe("records", () => {
  it("take names, codes, regions and Natural Earth's figures", () => {
    const record = lib.recordFrom(
      {
        NAME: "France", FORMAL_EN: "French Republic", NAME_DE: "Frankreich", NAME_EN: "France",
        ISO_A2_EH: "FR", ISO_A3_EH: "FRA", ISO_N3_EH: "250", TYPE: "Country",
        REGION_UN: "Europe", SUBREGION: "Western Europe", REGION_WB: "Europe & Central Asia", CONTINENT: "Europe",
        INCOME_GRP: "1. High income: OECD", POP_EST: 67059887, POP_YEAR: 2019, GDP_MD: 2715518, GDP_YEAR: 2019,
        LABEL_X: 2.06, LABEL_Y: 46.9, WIKIDATAID: "Q142",
      },
      "FRA",
      { capital: { name: "Paris", lon: 2.33, lat: 48.87 } },
    );
    expect(record).toMatchObject({
      id: "FRA", name: "France", longName: "French Republic", names: { de: "Frankreich" },
      iso2: "FR", iso3: "FRA", isoNumeric: "250", kind: "Country", capital: { name: "Paris" },
      regions: { "un-region": "Europe", income: "High income: OECD" },
      figures: { population: { value: 67059887, year: 2019 }, gdpUsd: { value: 2715518e6, year: 2019 } },
      wikidata: "Q142",
    });
    expect(record.names.en).toBeUndefined();
  });

  it("find capitals by feature class as well as the flag, national before alternate", () => {
    const place = (props: Record<string, unknown>) => ({ properties: { capalt: 0, adm0cap: 0, longitude: 1, latitude: 2, ...props } });
    const capitals = lib.capitalsFrom(
      [
        place({ name: "Juba", adm0_a3: "SDS", featurecla: "Admin-0 capital" }),
        place({ name: "La Paz", adm0_a3: "BOL", featurecla: "Admin-0 capital alt", capalt: 1 }),
        place({ name: "Sucre", adm0_a3: "BOL", featurecla: "Admin-0 capital", adm0cap: 1 }),
        place({ name: "Nuuk", adm0_a3: "GRL", featurecla: "Admin-0 region capital" }),
        place({ name: "Washington,  D.C.", adm0_a3: "USA", adm0cap: 1 }),
        place({ name: "Manchester", adm0_a3: "GBR", featurecla: "Populated place" }),
      ],
      new Map([["SDS", "SSD"]]),
    );
    expect(Object.fromEntries([...capitals].map(([id, c]) => [id, c.name]))).toEqual({
      SSD: "Juba", BOL: "Sucre", GRL: "Nuuk", USA: "Washington, D.C.",
    });
  });
});

describe("the World Bank join", () => {
  it("replaces figures, fills capital and income group, and reports sovereign countries it could not match", () => {
    const records = [
      { id: "FRA", iso3: "FRA", name: "France", kind: "Country", regions: { income: "High income: OECD" }, figures: { population: { value: 1, source: "Natural Earth" } } },
      { id: "KOS", name: "Kosovo", kind: "Disputed", regions: {}, figures: {} },
      { id: "TWN", iso3: "TWN", name: "Taiwan", kind: "Sovereign country", regions: {}, figures: {} },
    ];
    const unmatched = lib.joinWorldBank(records, {
      indicators: {
        "SP.POP.TOTL": [{ countryiso3code: "FRA", date: "2024", value: 68_000_000 }, { countryiso3code: "XKX", date: "2024", value: 1_700_000 }],
        "AG.LND.TOTL.K2": [{ countryiso3code: "FRA", date: "2022", value: 547_557 }, { countryiso3code: "WLD", date: "2022", value: 1 }],
        "NY.GDP.MKTP.CD": [{ countryiso3code: "FRA", date: "2024", value: null }],
      },
      countries: [{ id: "XKX", capitalCity: "Pristina", longitude: "21.1", latitude: "42.6", incomeLevel: { value: "Upper middle income" } }],
    });
    expect(records[0].figures).toEqual({
      population: { value: 68_000_000, year: 2024, source: "World Bank" },
      landAreaKm2: { value: 547_557, year: 2022, source: "World Bank" },
    });
    expect(records[1]).toMatchObject({ capital: { name: "Pristina" }, regions: { income: "Upper middle income" }, figures: { population: { value: 1_700_000 } } });
    expect(unmatched).toEqual(["TWN"]);
  });
});

describe("the manifest", () => {
  it("lists each view's files by scale, the first from zoom 0", () => {
    const manifest = lib.buildManifest({
      views: [{ id: "default", label: "D", fileKey: "default" }, { id: "in", label: "I", fileKey: "ma" }],
      scales: [{ name: "50m", minZoom: 2.5 }, { name: "10m", minZoom: 5 }],
      sources: [],
      generatedAt: "now",
    });
    expect(manifest.views[1].files).toEqual([
      { path: "views/ma/50m.geojson", minZoom: 0 },
      { path: "views/ma/10m.geojson", minZoom: 5 },
    ]);
    expect(manifest.schema).toBe(1);
    expect(manifest.regionSchemes.map((s: { id: string }) => s.id)).toContain("un-region");
  });
});
