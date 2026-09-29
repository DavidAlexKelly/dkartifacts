/**
 * A decoded DEM cell, and the arithmetic for reading it.
 *
 * ONE REPRESENTATION FOR EVERY CONSUMER
 * -------------------------------------
 * Terrain tiles, hillshade, relief tints, point readouts, route profiles and
 * sight lines all want the same thing: heights on a regular lat/lon lattice
 * with a known extent. Decoders produce this; everything else consumes it, and
 * nothing above this file knows what a GeoTIFF is.
 *
 * WHY THE ARRAY TYPE IS NOT PINNED
 * --------------------------------
 * `values` keeps the source's own dtype. A 2° cell at GLO-90's 3-arcsecond
 * posting is 2400 x 2400 = 5.76M samples: 11.5 MB as Int16, 23 MB as Float32.
 * Converting an Int16 DEM up to Float32 would double residency to buy precision
 * the data does not have, and converting a Float32 DEM down would terrace
 * hillshade in flat country. So both are carried, `values[i]` reads either, and
 * the cache prices a cell by `byteLength` rather than by pixel count.
 *
 * PIXEL CONVENTION
 * ----------------
 * Pixel-is-area (GDAL's default): the grid covers `bounds` edge to edge, and
 * sample (0,0) sits at the centre of the top-left pixel, half a step in from
 * the north-west corner. Row 0 is the NORTHERNMOST row, which is TIFF's own
 * order and the opposite of the row index used by the cell grid — the two never
 * meet, but it is worth knowing which is which.
 */

import type { CellBounds } from "./grid.js";
import { metresPerDegreeLon, METRES_PER_DEGREE_LAT } from "./grid.js";

export type HeightArray = Int16Array | Float32Array;

export interface HeightGrid {
  width: number;
  height: number;
  /** Row-major from the north-west corner. Length is width * height. */
  values: HeightArray;
  /** Geographic extent, edge to edge. */
  bounds: CellBounds;
  /** The value that means "nothing measured here". NaN if the source has none. */
  nodata: number;
}

export interface GridStats {
  min: number;
  max: number;
  /** Samples that were nodata. */
  voids: number;
}

/** True when `value` is a real measurement in this grid. */
export function isData(grid: HeightGrid, value: number): boolean {
  return Number.isFinite(value) && value !== grid.nodata;
}

/** Longitude / latitude step between adjacent samples, in degrees. */
export function gridStepDeg(grid: HeightGrid): { dLon: number; dLat: number } {
  return {
    dLon: (grid.bounds.east - grid.bounds.west) / grid.width,
    dLat: (grid.bounds.north - grid.bounds.south) / grid.height,
  };
}

/** Sample spacing in metres at a given latitude. */
export function gridStepMetres(
  grid: HeightGrid,
  lat: number,
): { x: number; y: number } {
  const { dLon, dLat } = gridStepDeg(grid);
  return {
    x: dLon * metresPerDegreeLon(lat),
    y: dLat * METRES_PER_DEGREE_LAT,
  };
}

/** Nearest-sample read. NaN outside the grid or over a void. */
export function nearestHeight(
  grid: HeightGrid,
  lon: number,
  lat: number,
): number {
  const { dLon, dLat } = gridStepDeg(grid);
  const col = Math.floor((lon - grid.bounds.west) / dLon);
  const row = Math.floor((grid.bounds.north - lat) / dLat);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) {
    return NaN;
  }
  const value = grid.values[row * grid.width + col];
  return isData(grid, value) ? value : NaN;
}

/**
 * Bilinear read. NaN outside the grid, or where all four neighbours are voids.
 *
 * VOIDS ARE WEIGHTED OUT, NOT AVERAGED IN
 * ---------------------------------------
 * DEM voids are usually water — GLO's ocean is nodata, and its lakes often are
 * too. Interpolating a -32768 sentinel into a coastal sample produces a cliff
 * thousands of metres deep one pixel wide, which in hillshade looks like a
 * black gash along every shoreline and in a terrain mesh punches a hole through
 * the planet. So the valid corners are re-normalised and the voids drop out,
 * which leaves the coast reading the height of the land beside it.
 */
export function sampleHeight(
  grid: HeightGrid,
  lon: number,
  lat: number,
): number {
  const { dLon, dLat } = gridStepDeg(grid);

  // Pixel-is-area: sample centres sit half a step in from the edges.
  const fx = (lon - grid.bounds.west) / dLon - 0.5;
  const fy = (grid.bounds.north - lat) / dLat - 0.5;

  // Outside by more than half a pixel is off the grid; inside the half-pixel
  // border there is no second sample to interpolate towards, so it clamps.
  if (fx < -0.5 || fy < -0.5 || fx > grid.width - 0.5 || fy > grid.height - 0.5) {
    return NaN;
  }

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;

  const clampX = (x: number) => Math.min(grid.width - 1, Math.max(0, x));
  const clampY = (y: number) => Math.min(grid.height - 1, Math.max(0, y));

  const corners: Array<{ value: number; weight: number }> = [
    { value: at(grid, clampX(x0), clampY(y0)), weight: (1 - tx) * (1 - ty) },
    { value: at(grid, clampX(x0 + 1), clampY(y0)), weight: tx * (1 - ty) },
    { value: at(grid, clampX(x0), clampY(y0 + 1)), weight: (1 - tx) * ty },
    { value: at(grid, clampX(x0 + 1), clampY(y0 + 1)), weight: tx * ty },
  ];

  let sum = 0;
  let weight = 0;
  for (const corner of corners) {
    if (!isData(grid, corner.value) || corner.weight === 0) {continue;}
    sum += corner.value * corner.weight;
    weight += corner.weight;
  }

  return weight > 0 ? sum / weight : NaN;
}

function at(grid: HeightGrid, col: number, row: number): number {
  return grid.values[row * grid.width + col];
}

export interface SlopeAspect {
  /** Rise over run. 0.4 is the pathfinding graph's impassable threshold. */
  slope: number;
  /** Downhill direction, degrees clockwise from north. NaN on flat ground. */
  aspect: number;
}

/**
 * Slope and aspect by central differences over the four neighbours.
 *
 * Central differences rather than a 3x3 Horn kernel on purpose: at a 90 m
 * posting the extra smoothing of a Horn fit mostly hides the ridge lines that
 * make relief readable, and this is the same estimator the pathfinding graph's
 * own slopes were built with, so a slope shown on the map and a slope the
 * router refused to cross agree.
 */
export function slopeAt(
  grid: HeightGrid,
  lon: number,
  lat: number,
): SlopeAspect {
  const { dLon, dLat } = gridStepDeg(grid);
  const step = gridStepMetres(grid, lat);

  const west = sampleHeight(grid, lon - dLon, lat);
  const east = sampleHeight(grid, lon + dLon, lat);
  const north = sampleHeight(grid, lon, lat + dLat);
  const south = sampleHeight(grid, lon, lat - dLat);
  const here = sampleHeight(grid, lon, lat);

  // One-sided where a neighbour is off-grid or a void: better than refusing to
  // answer at the edge of every cell, which is one pixel in every 2400 but
  // lands on exactly the seams a user notices.
  const dzdx = difference(west, east, here, 2 * step.x, step.x);
  const dzdy = difference(south, north, here, 2 * step.y, step.y);

  if (!Number.isFinite(dzdx) || !Number.isFinite(dzdy)) {
    return { slope: NaN, aspect: NaN };
  }

  const slope = Math.hypot(dzdx, dzdy);
  if (slope === 0) {return { slope: 0, aspect: NaN }; }

  // Downhill: the negative gradient. Bearing clockwise from north.
  const aspect = (Math.atan2(-dzdx, -dzdy) * 180) / Math.PI;
  return { slope, aspect: (aspect + 360) % 360 };
}

function difference(
  low: number,
  high: number,
  centre: number,
  fullSpan: number,
  halfSpan: number,
): number {
  if (Number.isFinite(low) && Number.isFinite(high)) {
    return (high - low) / fullSpan;
  }
  if (!Number.isFinite(centre)) {return NaN;}
  if (Number.isFinite(high)) {return (high - centre) / halfSpan;}
  if (Number.isFinite(low)) {return (centre - low) / halfSpan;}
  return NaN;
}

export function gridStats(grid: HeightGrid): GridStats {
  let min = Infinity;
  let max = -Infinity;
  let voids = 0;

  for (let i = 0; i < grid.values.length; i++) {
    const value = grid.values[i];
    if (!isData(grid, value)) {
      voids += 1;
      continue;
    }
    if (value < min) {min = value;}
    if (value > max) {max = value;}
  }

  return voids === grid.values.length
    ? { min: NaN, max: NaN, voids }
    : { min, max, voids };
}
