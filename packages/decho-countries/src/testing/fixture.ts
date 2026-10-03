/**
 * A small made-up dataset with known answers, for the tests.
 *
 *   A [0,0]–[10,10]     B [10,0]–[20,10]    D [20,0]–[25,10]   C [30,0]–[40,10]
 *                                                               with a hole at
 *                                                               [33,3]–[36,6]
 *
 * Two views: "default" draws all four, "claimed" counts D as part of B (one
 * merged outline). The default view has two detail levels. Region schemes:
 * "half" (North: A, B, D; South: C) and "pairs" (only A and C are in one).
 */

import type { CountryFeature, CountryFeatureCollection } from "../core/types.js";

export function square(id: string, west: number, south: number, east: number, north: number): CountryFeature {
  return {
    type: "Feature",
    properties: { id },
    geometry: {
      type: "Polygon",
      coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    },
  };
}

function withHole(feature: CountryFeature, west: number, south: number, east: number, north: number): CountryFeature {
  const geometry = feature.geometry as { coordinates: number[][][] };
  geometry.coordinates.push([[west, south], [west, north], [east, north], [east, south], [west, south]]);
  return feature;
}

const collection = (features: CountryFeature[]): CountryFeatureCollection => ({ type: "FeatureCollection", features });

export function fixtureFiles(): Record<string, unknown> {
  const c = withHole(square("C", 30, 0, 40, 10), 33, 3, 36, 6);
  return {
    "manifest.json": {
      schema: 1,
      countries: "countries.json",
      views: [
        {
          id: "default",
          label: "Default",
          files: [
            { path: "views/default/high.geojson", minZoom: 4 },
            { path: "views/default/low.geojson", minZoom: 0 },
          ],
        },
        { id: "claimed", label: "B's claim", files: [{ path: "views/claimed/low.geojson", minZoom: 0 }] },
      ],
      defaultView: "default",
      regionSchemes: [
        { id: "half", label: "Halves" },
        { id: "pairs", label: "Pairs" },
      ],
      defaultRegionScheme: "half",
      sources: [{ name: "Test", licence: "CC0" }],
    },
    "countries.json": {
      countries: [
        { id: "A", name: "Aland", iso2: "AA", regions: { half: "North", pairs: "One" }, figures: { population: { value: 100, year: 2020 }, landAreaKm2: { value: 50 } }, label: [5, 5] },
        { id: "B", name: "Beland", regions: { half: "North" }, figures: { population: { value: 200, year: 2022 }, landAreaKm2: { value: 100 }, gdpUsd: { value: 1000 } } },
        { id: "C", name: "Celand", regions: { half: "South", pairs: "One" }, figures: { population: { value: 50 } } },
        { id: "D", name: "Disputed area", kind: "Disputed", regions: { half: "North" }, figures: {} },
      ],
    },
    "views/default/low.geojson": collection([square("A", 0, 0, 10, 10), square("B", 10, 0, 20, 10), square("D", 20, 0, 25, 10), c]),
    "views/default/high.geojson": collection([square("A", 0, 0, 10, 10), square("B", 10, 0, 20, 10), square("D", 20, 0, 25, 10), c]),
    "views/claimed/low.geojson": collection([square("A", 0, 0, 10, 10), square("B", 10, 0, 25, 10), c]),
  };
}
