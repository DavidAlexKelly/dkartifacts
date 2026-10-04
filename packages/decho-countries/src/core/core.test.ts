import { describe, expect, it } from "vitest";

import { fixtureFiles } from "../testing/fixture.js";
import { figuresOf, flagEmoji, formatFigure, orderedFigureKeys, sumFigures } from "./figures.js";
import { areaKm2, containsPoint, createCountryIndex } from "./geometry.js";
import { loadCountries } from "./load.js";
import { CountriesDataError, fileForZoom, parseCountries, parseManifest } from "./manifest.js";
import type { CountryGeometry } from "./types.js";

const files = () => ({ kind: "files" as const, files: fixtureFiles() });

describe("the manifest", () => {
  const manifest = () => structuredClone(fixtureFiles()["manifest.json"]) as Record<string, unknown>;

  it("is read with each view's files in zoom order", () => {
    const parsed = parseManifest(manifest());
    expect(parsed.views[0].files.map((f) => f.minZoom)).toEqual([0, 4]);
    expect(parsed.defaultRegionScheme).toBe("half");
  });

  it("refuses what it cannot use, and says what", () => {
    expect(() => parseManifest({ ...manifest(), schema: 2 })).toThrow(/schema 2/);
    expect(() => parseManifest({ ...manifest(), views: [] })).toThrow(/no views/);
    expect(() => parseManifest({ ...manifest(), defaultView: "nope" })).toThrow(/"nope" is not one of the views/);
    const twice = manifest();
    (twice.views as unknown[]).push((twice.views as unknown[])[0]);
    expect(() => parseManifest(twice)).toThrow(/listed twice/);
    expect(() => parseManifest("nonsense")).toThrow(CountriesDataError);
  });

  it("falls back to the first scheme when the default names none of them", () => {
    expect(parseManifest({ ...manifest(), defaultRegionScheme: "missing" }).defaultRegionScheme).toBe("half");
    expect(parseManifest({ ...manifest(), regionSchemes: [] }).defaultRegionScheme).toBeUndefined();
  });

  it("picks the most detailed file that has started at a zoom", () => {
    const view = parseManifest(manifest()).views[0];
    expect(fileForZoom(view, 0).path).toBe("views/default/low.geojson");
    expect(fileForZoom(view, 3.9).path).toBe("views/default/low.geojson");
    expect(fileForZoom(view, 4).path).toBe("views/default/high.geojson");
  });

  it("needs every record to have a unique id and a name", () => {
    expect(() => parseCountries({ countries: [{ id: "A" }] })).toThrow(/needs an id and a name/);
    expect(() => parseCountries({ countries: [{ id: "A", name: "x" }, { id: "A", name: "y" }] })).toThrow(/twice/);
    expect(parseCountries({ countries: [{ id: "A", name: "x" }] })[0]).toMatchObject({ regions: {}, figures: {} });
  });
});

describe("geometry", () => {
  const holed: CountryGeometry = {
    type: "Polygon",
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[3, 3], [3, 6], [6, 6], [6, 3], [3, 3]],
    ],
  };

  it("counts a point in a hole as outside", () => {
    expect(containsPoint(holed, 1, 1)).toBe(true);
    expect(containsPoint(holed, 4, 4)).toBe(false);
    expect(containsPoint(holed, 11, 1)).toBe(false);
  });

  it("measures a one-degree square at the equator as about 12,364 km²", () => {
    const square: CountryGeometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    expect(areaKm2(square)).toBeGreaterThan(12300);
    expect(areaKm2(square)).toBeLessThan(12400);
    expect(areaKm2(holed)).toBeLessThan(areaKm2({ type: "Polygon", coordinates: [holed.coordinates[0]] }));
  });

  it("finds countries by point, folding longitudes past ±180", async () => {
    const data = await loadCountries(files());
    const index = createCountryIndex(await data.geometry());
    expect(index.countryAt(5, 5)).toBe("A");
    expect(index.countryAt(22, 5)).toBe("D");
    expect(index.countryAt(34, 4)).toBeNull(); // C's hole
    expect(index.countryAt(50, 5)).toBeNull();
    expect(index.countryAt(5 + 360, 5)).toBe("A");
    expect(index.countryAt(Number.NaN, 5)).toBeNull();
    expect(index.bounds("B")).toEqual([10, 0, 20, 10]);
    expect(index.bounds("nowhere")).toBeNull();
  });
});

describe("loadCountries", () => {
  it("reads records sorted by name, and views and schemes from the manifest", async () => {
    const data = await loadCountries(files());
    expect(data.records.map((r) => r.id)).toEqual(["A", "B", "C", "D"]);
    expect(data.view().id).toBe("default");
    expect(data.view("claimed").label).toBe("B's claim");
    expect(() => data.view("other")).toThrow(/This dataset has: default, claimed/);
    expect(data.regionScheme()?.id).toBe("half");
    expect(data.regionScheme("pairs")?.label).toBe("Pairs");
    expect(data.regionScheme("nope")).toBeUndefined();
  });

  it("reads each view's outlines at the detail for the zoom, once", async () => {
    let reads = 0;
    const raw = fixtureFiles();
    const counting = new Proxy(raw, {
      get(target, key: string) {
        if (key.startsWith("views/")) {reads++;}
        return target[key];
      },
    });
    const data = await loadCountries({ kind: "files", files: counting });
    const low = await data.geometry("default", 1);
    expect(await data.geometry("default", 2)).toBe(low);
    expect(await data.geometry("default", 5)).not.toBe(low);
    expect(reads).toBe(2);
    const claimed = await data.index("claimed");
    expect(claimed.countryAt(22, 5)).toBe("B");
    expect(claimed.bounds("D")).toBeNull();
  });

  it("groups regions and sums only what adds up", async () => {
    const data = await loadCountries(files());
    const north = data.regionOf("A")!;
    expect(north.id).toBe("North");
    expect(north.countries).toEqual(["A", "B", "D"]);
    expect(north.figures.population).toMatchObject({ value: 300, members: 2, year: 2022 });
    expect(north.figures.landAreaKm2.value).toBe(150);
    expect(north.figures.densityPerKm2.value).toBe(2);
    expect(data.regions("pairs").map((r) => [r.id, r.countries])).toEqual([["One", ["A", "C"]]]);
    expect(data.regionOf("B", "pairs")).toBeUndefined();
    expect(data.regions("nope")).toEqual([]);
  });

  it("resolves file paths next to a manifest in a folder", async () => {
    const raw = fixtureFiles();
    const nested = Object.fromEntries(Object.entries(raw).map(([path, value]) => [`world/${path}`, value]));
    const data = await loadCountries({ kind: "files", files: nested, manifestPath: "world/manifest.json" });
    expect((await data.geometry()).features).toHaveLength(4);
  });

  it("names a missing file", async () => {
    const raw = fixtureFiles();
    delete raw["views/claimed/low.geojson"];
    const data = await loadCountries({ kind: "files", files: raw });
    await expect(data.geometry("claimed")).rejects.toThrow(/no file "views\/claimed\/low.geojson"/);
  });
});

describe("figures", () => {
  it("derives density and GDP per person where the data has neither", () => {
    const figures = figuresOf({ figures: { population: { value: 1000, year: 2020 }, landAreaKm2: { value: 10 }, gdpUsd: { value: 5000 } } });
    expect(figures.densityPerKm2).toMatchObject({ value: 100, year: 2020 });
    expect(figures.gdpPerCapitaUsd.value).toBe(5);
    expect(figuresOf({ figures: { population: { value: 1 }, gdpPerCapitaUsd: { value: 9 } } }).gdpPerCapitaUsd.value).toBe(9);
  });

  it("orders the named figures first and keeps the dataset's own", () => {
    expect(orderedFigureKeys({ zeta: { value: 1 }, gdpUsd: { value: 1 }, population: { value: 1 } })).toEqual(["population", "gdpUsd", "zeta"]);
  });

  it("does not sum figures that do not add up", () => {
    expect(sumFigures([{ figures: { gdpPerCapitaUsd: { value: 5 } } }, { figures: { gdpPerCapitaUsd: { value: 7 } } }])).toEqual({});
  });

  it("formats compactly", () => {
    // Compact notation's suffix depends on the runtime's ICU data: Node says
    // "67.1m" and "$2.72tn" in en-GB, Chrome "67.1M" and "$2.72T".
    expect(formatFigure("population", { value: 67_059_887 })).toMatch(/^67\.1m$/i);
    expect(formatFigure("gdpUsd", { value: 2.715e12 })).toMatch(/^\$2\.72(tn|t)$/i);
    expect(formatFigure("landAreaKm2", { value: 547_557 })).toBe("547,557 km²");
  });

  it("builds a flag from a two-letter code", () => {
    expect(flagEmoji("fr")).toBe("🇫🇷");
    expect(flagEmoji("FRA")).toBe("");
    expect(flagEmoji(undefined)).toBe("");
  });
});
