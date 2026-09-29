/**
 * Line of sight, and the viewshed built from it.
 *
 * This is the question a military map is actually asked of a DEM: can that
 * position see this one, and what can it see at all. Both are the same
 * arithmetic — an angle from the observer's eye, compared with the largest
 * angle anything in between subtends.
 *
 * CURVATURE AND REFRACTION
 * ------------------------
 * The ground between two points BULGES ABOVE the straight line joining them:
 * 1.7 m at the middle of a 10 km line, 27 m at the middle of 40 km. That is the
 * difference between a ridge blocking a line and not, so it is not optional at
 * the ranges this gets used at.
 *
 * The sign is the whole of it, and it is easy to get backwards — treating the
 * surface as falling away from the chord makes every long shot MORE visible
 * instead of less, which looks plausible and is wrong. Two observers standing
 * on a dead-flat plain 60 km apart cannot see each other; that case is a test.
 *
 * Atmospheric refraction bends light back down by roughly a seventh of the
 * bulge, and the conventional treatment is to inflate the Earth's radius by
 * 1/(1-k) with k = 0.13 and then work in straight lines. That is what happens
 * here, and it is the same approximation used by every artillery table and
 * radio horizon calculation.
 *
 * WHAT THIS DOES NOT MODEL
 * ------------------------
 * Vegetation and buildings. A bare-earth DEM is bare earth: a sight line
 * through a forest or a town will be reported clear. The pathfinding graphs
 * carry a landcover class per node and could qualify this later; saying so is
 * better than quietly implying a canopy has been accounted for.
 */

import type { HeightSampler } from "./demSource.js";
import { distanceMetres, EARTH_RADIUS_M } from "./grid.js";
import { degreesForMetres, sampleAlong, type GeoPoint } from "./profile.js";

/** Coefficient of refraction. 0.13 is the standard temperate-atmosphere value. */
export const REFRACTION_K = 0.13;

/** Earth radius inflated for refraction, so sight lines can stay straight. */
export const EFFECTIVE_EARTH_RADIUS_M = EARTH_RADIUS_M / (1 - REFRACTION_K);

/**
 * How far the ground bulges ABOVE the chord between two points, at a distance
 * `along` into a total distance `total`. Zero at both ends, greatest in the
 * middle.
 *
 * Named for what it is rather than "curvature correction", because the sign of
 * a correction is exactly the thing nobody remembers.
 */
export function earthBulge(along: number, total: number): number {
  const beyond = total - along;
  if (along <= 0 || beyond <= 0) {return 0;}
  return (along * beyond) / (2 * EFFECTIVE_EARTH_RADIUS_M);
}

export interface SightRequest {
  from: GeoPoint;
  to: GeoPoint;
  /** Eye height above ground, metres. Default 1.7 — a standing observer. */
  observerHeight?: number;
  /** Target height above ground, metres. Default 1.7. */
  targetHeight?: number;
  /** Samples between the ends. Default one per 30 m, capped at 512. */
  samples?: number;
  /** Include curvature and refraction. Default true. */
  curvature?: boolean;
}

export interface SightObstruction extends GeoPoint {
  distance: number;
  elevation: number;
  /**
   * How far ABOVE the sight line this point rises, metres. The largest
   * obstruction is the one reported.
   */
  rise: number;
}

export interface SightResult {
  visible: boolean;
  /** Ground-plan distance between the ends, metres. */
  distance: number;
  /** Ground elevation at each end, metres. NaN off-coverage. */
  fromElevation: number;
  toElevation: number;
  /**
   * Smallest clearance between the sight line and the ground, metres.
   * Negative when blocked, and its magnitude is how much higher the observer
   * would have to be.
   */
  clearance: number;
  /** The worst obstruction, when blocked. */
  obstruction?: SightObstruction;
  /** Every intermediate sample, for charting the section with the sight line. */
  samples: Array<{
    distance: number;
    elevation: number;
    /**
     * Height of the sight line at this distance, with the Earth's bulge already
     * taken out of it.
     *
     * Expressed this way so that `elevation` and `sightLine` are directly
     * comparable — the line is blocked exactly where the ground is above it, on
     * the chart as well as in the arithmetic. Carrying the raw chord and the
     * bulge separately would leave every consumer to combine them, and half of
     * them would combine them the wrong way round.
     */
    sightLine: number;
  }>;
}

/**
 * Is there an unobstructed line between two points?
 *
 * The cells under the line are warmed first, so this is one round of loads
 * followed by pure arithmetic — see profile.ts.
 */
export async function lineOfSight(
  sampler: HeightSampler,
  request: SightRequest,
): Promise<SightResult> {
  const { from, to } = request;
  const observerHeight = request.observerHeight ?? 1.7;
  const targetHeight = request.targetHeight ?? 1.7;
  const useCurvature = request.curvature ?? true;

  const distance = distanceMetres(from, to);
  const count =
    request.samples ??
    Math.min(512, Math.max(2, Math.ceil(distance / 30)));

  const points = sampleAlong([from, to], count);
  await sampler.warm([from, to, ...points]);

  const read = (point: GeoPoint) => sampler.heightAtLoaded(point.lon, point.lat);
  const fromElevation = read(from);
  const toElevation = read(to);

  const eye = fromElevation + observerHeight;
  const aim = toElevation + targetHeight;

  const samples = points.map((point) => {
    const elevation = read(point);
    const chord =
      distance > 0 ? eye + ((aim - eye) * point.distance) / distance : eye;
    const bulge = useCurvature ? earthBulge(point.distance, distance) : 0;
    return { distance: point.distance, elevation, sightLine: chord - bulge };
  });

  // Unknown ground at either end makes the answer meaningless. Reporting "not
  // visible" would be a guess dressed as a result.
  if (!Number.isFinite(fromElevation) || !Number.isFinite(toElevation)) {
    return {
      visible: false,
      distance,
      fromElevation,
      toElevation,
      clearance: NaN,
      samples,
    };
  }

  let clearance = Infinity;
  let obstruction: SightObstruction | undefined;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    // The ends are the ends; a target is not an obstruction to itself.
    if (point.distance <= 0 || point.distance >= distance) {continue;}
    const elevation = samples[i].elevation;
    if (!Number.isFinite(elevation)) {continue;}

    // `sightLine` already has the bulge taken out of it, so this is a plain
    // comparison of two heights above the datum.
    const gap = samples[i].sightLine - elevation;

    if (gap < clearance) {
      clearance = gap;
      if (gap < 0) {
        obstruction = {
          lon: point.lon,
          lat: point.lat,
          distance: point.distance,
          elevation,
          rise: -gap,
        };
      }
    }
  }

  return {
    visible: clearance >= 0,
    distance,
    fromElevation,
    toElevation,
    clearance: Number.isFinite(clearance) ? clearance : NaN,
    obstruction,
    samples,
  };
}

export interface ViewshedOptions {
  centre: GeoPoint;
  radiusMetres: number;
  observerHeight?: number;
  targetHeight?: number;
  /**
   * Output grid edge, in pixels. Odd numbers put the observer exactly in the
   * centre pixel, which is what you want when the result is drawn over a map.
   */
  size?: number;
  curvature?: boolean;
}

export const VIEWSHED_OUTSIDE = 255;
export const VIEWSHED_NO_DATA = 128;
export const VIEWSHED_HIDDEN = 0;
export const VIEWSHED_VISIBLE = 1;

export interface Viewshed {
  size: number;
  bounds: { west: number; south: number; east: number; north: number };
  centre: GeoPoint;
  radiusMetres: number;
  /**
   * size * size, row-major from the north-west. One of VIEWSHED_VISIBLE,
   * VIEWSHED_HIDDEN, VIEWSHED_NO_DATA or VIEWSHED_OUTSIDE.
   */
  cells: Uint8Array;
  /** Ground elevation at the observer, metres. */
  observerElevation: number;
}

/**
 * What can be seen from a point, within a radius.
 *
 * PER-PIXEL, NOT A RADIAL SWEEP
 * -----------------------------
 * The classic implementation fires N rays outward and marks the pixels each ray
 * crosses. It is O(N · steps) rather than O(pixels · steps), and it produces
 * visible speckle at the far edge, where adjacent rays are further apart than a
 * pixel — which on a map reads as noise and invites someone to "fix" it with a
 * blur that also erases real detail.
 *
 * This walks the line to each pixel instead. For a 129-pixel grid that is about
 * a million bilinear samples: tens of milliseconds, entirely arithmetic.
 *
 * IT STILL BLOCKS THE THREAD
 * --------------------------
 * Tens of milliseconds is a dropped frame. A caller doing this on every mouse
 * move, or at 513 pixels, should run it in a Worker — everything it needs is
 * `HeightSampler`, which is two methods and no DOM. The `onProgress` callback
 * is there so a UI can show something either way.
 */
export async function viewshed(
  sampler: HeightSampler,
  options: ViewshedOptions,
  onProgress?: (fraction: number) => void,
): Promise<Viewshed> {
  const { centre, radiusMetres } = options;
  const size = options.size ?? 129;
  const observerHeight = options.observerHeight ?? 1.7;
  const targetHeight = options.targetHeight ?? 0;
  const useCurvature = options.curvature ?? true;

  const { dLon, dLat } = degreesForMetres(centre.lat, radiusMetres);
  const bounds = {
    west: centre.lon - dLon,
    east: centre.lon + dLon,
    south: centre.lat - dLat,
    north: centre.lat + dLat,
  };

  // Corners and centre are enough to name every cell a 2° grid can have under a
  // radius of any sane size.
  await sampler.warm([
    centre,
    { lon: bounds.west, lat: bounds.north },
    { lon: bounds.east, lat: bounds.north },
    { lon: bounds.west, lat: bounds.south },
    { lon: bounds.east, lat: bounds.south },
  ]);

  const observerElevation = sampler.heightAtLoaded(centre.lon, centre.lat);
  const cells = new Uint8Array(size * size).fill(VIEWSHED_OUTSIDE);

  if (!Number.isFinite(observerElevation)) {
    return {
      size,
      bounds,
      centre,
      radiusMetres,
      cells: cells.fill(VIEWSHED_NO_DATA),
      observerElevation,
    };
  }

  const eye = observerElevation + observerHeight;
  const stepMetres = (2 * radiusMetres) / (size - 1);

  for (let row = 0; row < size; row++) {
    const lat = bounds.north - (row / (size - 1)) * (bounds.north - bounds.south);
    for (let col = 0; col < size; col++) {
      const lon = bounds.west + (col / (size - 1)) * (bounds.east - bounds.west);
      const index = row * size + col;

      const target = { lon, lat };
      const distance = distanceMetres(centre, target);
      if (distance > radiusMetres) {continue;}
      if (distance < stepMetres) {
        cells[index] = VIEWSHED_VISIBLE;
        continue;
      }

      const elevation = sampler.heightAtLoaded(lon, lat);
      if (!Number.isFinite(elevation)) {
        cells[index] = VIEWSHED_NO_DATA;
        continue;
      }

      // The angle the target subtends at the eye, and the largest angle
      // anything in between subtends. Visible when nothing in between is
      // steeper.
      const steps = Math.max(2, Math.ceil(distance / stepMetres));
      // No bulge term on the target: the bulge is measured against the chord
      // between the observer and the target, so it is zero at both ends by
      // construction. Only the ground in between rises towards the line.
      const targetAngle = (elevation + targetHeight - eye) / distance;

      let blocked = false;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const alongDistance = distance * t;
        const height = sampler.heightAtLoaded(
          centre.lon + (lon - centre.lon) * t,
          centre.lat + (lat - centre.lat) * t,
        );
        if (!Number.isFinite(height)) {continue;}
        // The ground bulges ABOVE the chord, so the bulge is ADDED to it. The
        // other sign makes every long line of sight clearer than it is.
        const bulge = useCurvature ? earthBulge(alongDistance, distance) : 0;
        const angle = (height + bulge - eye) / alongDistance;
        if (angle > targetAngle) {
          blocked = true;
          break;
        }
      }

      cells[index] = blocked ? VIEWSHED_HIDDEN : VIEWSHED_VISIBLE;
    }

    onProgress?.((row + 1) / size);
    // Yield once per row so a caller on the main thread can at least paint a
    // progress bar. In a Worker this costs a microtask and nothing else.
    if (onProgress) {await Promise.resolve();}
  }

  return { size, bounds, centre, radiusMetres, cells, observerElevation };
}
