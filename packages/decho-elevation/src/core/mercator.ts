/**
 * Web-Mercator tile geometry, and resampling a geographic DEM onto it.
 *
 * WHY THERE IS RESAMPLING AT ALL
 * ------------------------------
 * The DEM chunks are on a geographic (lat/lon) lattice; MapLibre reads terrain
 * from Web-Mercator XYZ tiles. Something has to reproject, and the cheapest
 * honest place is here: for each tile pixel, work out its longitude and
 * latitude and ask the DEM what is there. That is a gather rather than a
 * scatter, so every output pixel is written exactly once and no seams or holes
 * can appear between adjacent source cells — which is the failure mode of
 * warping cell-by-cell into tiles.
 *
 * It also means a tile spanning two or four DEM cells is handled by the sampler
 * without this file knowing anything about it.
 *
 * The cost is 65,536 bilinear samples per 256-pixel tile. That is microseconds;
 * the download it follows is seconds.
 */

import type { CellBounds } from "./grid.js";

/**
 * WGS84's semi-major axis — NOT the mean radius grid.ts measures distances
 * with.
 *
 * Web Mercator is defined on a sphere of exactly this radius, and every
 * published tile-resolution table (156543.03 m/px at zoom 0) follows from it.
 * The two constants differ by 0.1%, which is nothing for a slope estimate and
 * everything for agreeing with the rest of the world about what a tile is.
 */
const WEB_MERCATOR_RADIUS_M = 6378137;

/** Longitude of a fractional tile x at zoom z. */
export function lonAtTileX(z: number, x: number): number {
  return (x / 2 ** z) * 360 - 180;
}

/** Latitude of a fractional tile y at zoom z. */
export function latAtTileY(z: number, y: number): number {
  const n = Math.PI * (1 - (2 * y) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

export function tileBounds(z: number, x: number, y: number): CellBounds {
  return {
    west: lonAtTileX(z, x),
    east: lonAtTileX(z, x + 1),
    north: latAtTileY(z, y),
    south: latAtTileY(z, y + 1),
  };
}

/**
 * Ground resolution at a latitude, in metres per pixel, for a given tile size.
 *
 * Mercator pixels are square in projected space and stretch with latitude on
 * the ground, so this varies across a tile. Slope shading uses the value at the
 * tile's centre: at zoom 10 and above a tile spans well under a degree, where
 * the variation across it is a fraction of a percent — far smaller than the
 * error already present in a 90 m DEM.
 */
export function metresPerPixel(
  z: number,
  lat: number,
  tileSize: number,
): number {
  const circumference = 2 * Math.PI * WEB_MERCATOR_RADIUS_M;
  return (
    (circumference * Math.cos((lat * Math.PI) / 180)) / (tileSize * 2 ** z)
  );
}

/**
 * Sample a tile's worth of heights.
 *
 * `sample` returns NaN where it has no data; that NaN is carried through to the
 * renderers, which each decide what to do with it (transparent for a relief
 * tint, sea level for terrain — see renderers.ts).
 */
export function resampleTile(
  z: number,
  x: number,
  y: number,
  size: number,
  sample: (lon: number, lat: number) => number,
): Float32Array {
  const heights = new Float32Array(size * size);

  for (let row = 0; row < size; row++) {
    // Pixel centres, not corners: a tile's first pixel covers the first 1/size
    // of the tile, and sampling its corner shifts the whole raster half a pixel
    // north-west. Half a pixel is invisible on one tile and shows up as a
    // hairline discontinuity where two zoom levels meet.
    const lat = latAtTileY(z, y + (row + 0.5) / size);
    for (let col = 0; col < size; col++) {
      const lon = lonAtTileX(z, x + (col + 0.5) / size);
      heights[row * size + col] = sample(lon, lat);
    }
  }

  return heights;
}
