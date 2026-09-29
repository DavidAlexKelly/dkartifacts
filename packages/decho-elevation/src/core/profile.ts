/**
 * Terrain profiles — the section under a line.
 *
 * WHY IT TAKES A SAMPLER AND NOT A DEM SOURCE
 * -------------------------------------------
 * Everything here is arithmetic over "what is the height at this point", so it
 * asks for exactly that: `HeightSampler`, two methods. A DEM source satisfies
 * it, and so does a stub that returns a cone — which is how these functions are
 * tested without a network, a dataset or a browser.
 *
 * WHY THE CELLS ARE WARMED FIRST
 * ------------------------------
 * `heightAtLoaded` is synchronous and answers NaN for a cell that is not
 * resident. That is deliberate: a profile of 200 points across two cells would
 * otherwise be 200 awaits, each capable of triggering a 20 MB download, in a
 * loop. So the whole line's cells are loaded once, up front, and the sampling
 * loop is then pure arithmetic.
 */

import { distanceMetres, metresPerDegreeLon, METRES_PER_DEGREE_LAT } from "./grid.js";
import type { HeightSampler } from "./demSource.js";

export interface GeoPoint {
  lon: number;
  lat: number;
}

export interface ProfileSample extends GeoPoint {
  /** Distance from the first waypoint, metres. */
  distance: number;
  /** Metres above the vertical datum, or NaN where the DEM has nothing. */
  elevation: number;
}

export interface ElevationProfile {
  samples: ProfileSample[];
  /** Ground-plan length of the whole line, metres. */
  length: number;
  /** Over the samples that have data. NaN if none do. */
  min: number;
  max: number;
  /** Cumulative climb and descent, metres. */
  gain: number;
  loss: number;
  /** Samples with no data. A profile crossing a lake is not broken. */
  voids: number;
}

export interface ProfileOptions {
  /**
   * Points along the line, ends included. 200 is about one per screen pixel of
   * a chart that width, which is where more stops being visible.
   */
  samples?: number;
}

/**
 * Positions evenly spaced by distance along a polyline.
 *
 * Spacing is by great-circle distance so that a leg running east at 60°N is not
 * silently sampled twice as densely as one running north; the interpolation
 * WITHIN a leg is linear in degrees, which over a single leg of an order is a
 * sub-metre difference and keeps this free of a geodesy dependency.
 */
export function sampleAlong(
  waypoints: readonly GeoPoint[],
  count: number,
): ProfileSample[] {
  if (waypoints.length === 0 || count <= 0) {return [];}
  if (waypoints.length === 1 || count === 1) {
    return [{ ...waypoints[0], distance: 0, elevation: NaN }];
  }

  const cumulative = [0];
  for (let i = 1; i < waypoints.length; i++) {
    cumulative.push(
      cumulative[i - 1] + distanceMetres(waypoints[i - 1], waypoints[i]),
    );
  }
  const total = cumulative[cumulative.length - 1];

  const out: ProfileSample[] = [];
  for (let i = 0; i < count; i++) {
    const distance = (i / (count - 1)) * total;

    let leg = 0;
    while (leg < cumulative.length - 2 && cumulative[leg + 1] < distance) {
      leg += 1;
    }
    const span = cumulative[leg + 1] - cumulative[leg];
    // A zero-length leg (duplicated waypoints, or a total of 0 because every
    // point is identical) would divide to NaN and poison every sample after it.
    const t = span > 0 ? (distance - cumulative[leg]) / span : 0;

    out.push({
      lon: waypoints[leg].lon + t * (waypoints[leg + 1].lon - waypoints[leg].lon),
      lat: waypoints[leg].lat + t * (waypoints[leg + 1].lat - waypoints[leg].lat),
      distance,
      elevation: NaN,
    });
  }

  return out;
}

export async function elevationProfile(
  sampler: HeightSampler,
  waypoints: readonly GeoPoint[],
  options: ProfileOptions = {},
): Promise<ElevationProfile> {
  const samples = sampleAlong(waypoints, options.samples ?? 200);

  // The waypoints as well as the samples: a leg can cross a cell that no
  // sample happens to land in, and warming from the samples alone would leave
  // a hole in the middle of a long leg.
  await sampler.warm([...waypoints, ...samples]);

  let min = Infinity;
  let max = -Infinity;
  let gain = 0;
  let loss = 0;
  let voids = 0;
  let previous = NaN;

  for (const sample of samples) {
    sample.elevation = sampler.heightAtLoaded(sample.lon, sample.lat);
    if (!Number.isFinite(sample.elevation)) {
      voids += 1;
      continue;
    }
    if (sample.elevation < min) {min = sample.elevation;}
    if (sample.elevation > max) {max = sample.elevation;}
    if (Number.isFinite(previous)) {
      const delta = sample.elevation - previous;
      if (delta > 0) {
        gain += delta;
      } else {
        loss -= delta;
      }
    }
    previous = sample.elevation;
  }

  return {
    samples,
    length: samples.length > 0 ? samples[samples.length - 1].distance : 0,
    min: voids === samples.length ? NaN : min,
    max: voids === samples.length ? NaN : max,
    gain,
    loss,
    voids,
  };
}

/**
 * Metres per degree at a latitude, both axes — exported because a caller
 * converting a radius in metres into a bounding box needs it and should not
 * have to rediscover the cosine.
 */
export function degreesForMetres(
  lat: number,
  metres: number,
): { dLon: number; dLat: number } {
  const perLon = metresPerDegreeLon(lat);
  return {
    dLon: perLon > 1 ? metres / perLon : 0,
    dLat: metres / METRES_PER_DEGREE_LAT,
  };
}
