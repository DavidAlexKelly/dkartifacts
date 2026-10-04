/**
 * Which country is under a point, and how big a country's outline is.
 *
 * `countryAt` is what lets data with nothing but coordinates — an event, a
 * vehicle track — be grouped and filtered by country, so it has to be cheap
 * for thousands of calls: every outline's bounding box is worked out once, and
 * the exact test only runs for the few boxes a point falls in.
 */

import type { CountryFeatureCollection, CountryGeometry } from "./types.js";

export type Bounds = [west: number, south: number, east: number, north: number];

type Ring = number[][];

function polygonsOf(geometry: CountryGeometry): Ring[][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

export function boundsOf(geometry: CountryGeometry): Bounds {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygonsOf(geometry)) {
    for (const [lon, lat] of polygon[0] ?? []) {
      if (lon < west) {west = lon;}
      if (lon > east) {east = lon;}
      if (lat < south) {south = lat;}
      if (lat > north) {north = lat;}
    }
  }
  return [west, south, east, north];
}

/** Even-odd ray cast. Points exactly on an edge may fall either way. */
function insideRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside an outer ring and none of its holes, for any of the polygons. */
export function containsPoint(geometry: CountryGeometry, lon: number, lat: number): boolean {
  for (const [outer, ...holes] of polygonsOf(geometry)) {
    if (outer && insideRing(lon, lat, outer) && !holes.some((hole) => insideRing(lon, lat, hole))) {
      return true;
    }
  }
  return false;
}

export interface CountryIndex {
  /** The id of the country containing the point, or null over sea. */
  countryAt(lon: number, lat: number): string | null;
  /**
   * The bounding box of a country's outline, or null when this view has no
   * outline for it (it is part of another country in this view).
   */
  bounds(id: string): Bounds | null;
  /** The ids this view draws. */
  ids(): string[];
}

export function createCountryIndex(collection: CountryFeatureCollection): CountryIndex {
  const entries = collection.features
    .filter((feature) => feature.geometry && typeof feature.properties?.id === "string")
    .map((feature) => ({ id: feature.properties.id, geometry: feature.geometry, box: boundsOf(feature.geometry) }));
  // An id can be split over several features; its bounds are their union.
  const boxes = new Map<string, Bounds>();
  for (const { id, box } of entries) {
    const known = boxes.get(id);
    boxes.set(
      id,
      known
        ? [Math.min(known[0], box[0]), Math.min(known[1], box[1]), Math.max(known[2], box[2]), Math.max(known[3], box[3])]
        : box,
    );
  }
  return {
    countryAt(lon, lat) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {return null;}
      // Longitudes past ±180 (a map panned round the world) fold back.
      const x = ((((lon + 180) % 360) + 360) % 360) - 180;
      for (const { id, geometry, box } of entries) {
        if (x < box[0] || x > box[2] || lat < box[1] || lat > box[3]) {continue;}
        if (containsPoint(geometry, x, lat)) {return id;}
      }
      return null;
    },
    bounds: (id) => boxes.get(id) ?? null,
    ids: () => [...boxes.keys()],
  };
}

/** Mean Earth radius, km (IUGG). */
const EARTH_RADIUS_KM = 6371.0088;

/** Spherical area of a ring in km², by the same formula d3-geo and turf use. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    sum += ((lon2 - lon1) * Math.PI) / 180 * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

/** Area of an outline in km², holes subtracted. As accurate as the outline. */
export function areaKm2(geometry: CountryGeometry): number {
  let total = 0;
  for (const [outer, ...holes] of polygonsOf(geometry)) {
    if (!outer) {continue;}
    total += ringArea(outer);
    for (const hole of holes) {total -= ringArea(hole);}
  }
  return total;
}
