/**
 * Terrarium encoding — heights packed into RGB.
 *
 *   height = (R * 256 + G + B / 256) - 32768
 *
 * WHY THIS ENCODING
 * -----------------
 * MapLibre reads terrain from a `raster-dem` source, which means an image. It
 * understands three encodings out of the box: "mapbox", "terrarium", and
 * "custom" with explicit channel factors. Terrarium is the one worth using
 * here:
 *
 *   - one metre per G step and 1/256 m in B, so the quantisation is a
 *     hundredth of the horizontal posting of a 90 m DEM — lossless in every
 *     way that matters;
 *   - covers -32768 to +32767 m, so no clamping anywhere on Earth;
 *   - the arithmetic is exact in the channels, so an encode/decode round trip
 *     is not a source of drift.
 *
 * It is also what maplibre-contour and every terrain-RGB pipeline expects, so
 * if the chunks are ever pre-encoded into raster PMTiles server-side, the tiles
 * this package generates in the browser and the tiles the transform would emit
 * are the same bytes, and nothing downstream changes.
 *
 * VOIDS BECOME SEA LEVEL, NOT TRANSPARENT
 * ---------------------------------------
 * `raster-dem` has no notion of a missing pixel: alpha is not read, and a
 * transparent pixel decodes to whatever its RGB happens to be. So a void has
 * to be given a height, and 0 is the only defensible one — the voids in this
 * DEM are water. Leaving them at the -32768 sentinel would tear a hole through
 * the terrain mesh at every coastline.
 */

/** Height in metres for a terrarium RGB triple. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Write one terrarium pixel into `out` at `at` (RGBA, alpha 255).
 *
 * Clamped rather than wrapped: an out-of-range height is a bug somewhere
 * upstream, and wrapping it produces a plausible wrong answer 65 km away
 * instead of a visible flat spot.
 */
export function writeTerrarium(
  out: Uint8Array,
  at: number,
  height: number,
): void {
  const value = Math.min(
    65535.99,
    Math.max(0, (Number.isFinite(height) ? height : 0) + 32768),
  );
  const whole = Math.floor(value);
  out[at] = (whole >> 8) & 0xff;
  out[at + 1] = whole & 0xff;
  out[at + 2] = Math.min(255, Math.floor((value - whole) * 256));
  out[at + 3] = 255;
}
