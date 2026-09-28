/**
 * Tile renderers — a frame of heights in, RGBA out.
 *
 * ONE RESAMPLING PIPELINE, SEVERAL PICTURES
 * -----------------------------------------
 * Reprojecting a DEM cell onto a Mercator tile is the expensive part and it is
 * the same work whatever the tile is for. So it happens once (mercator.ts) and
 * what comes out is handed to a renderer:
 *
 *   terrariumTile   heights packed into RGB for a `raster-dem` source. MapLibre
 *                   builds 3D terrain and hillshade from this itself — those
 *                   two need no renderer of their own.
 *   hypsometricTile a colour ramp by elevation, as an ordinary `raster` layer.
 *   slopeTile       slope classified into go / restricted / no-go bands, which
 *                   is the same question the pathfinding graph asks of the same
 *                   data.
 *   contourTile     contour lines, at an interval chosen from the tile's own
 *                   zoom.
 *
 * WHY SLOPE IS COMPUTED HERE AND NOT FROM THE SOURCE GRID
 * -------------------------------------------------------
 * Because it must match what the user sees. Slope from the source lattice, then
 * resampled, is smoothed by the resampling and disagrees with the relief the
 * hillshade draws from the same tile. Computing it on the tile the pixel
 * belongs to keeps shading and classification consistent at every zoom, at the
 * cost of being zoom-dependent — which is the honest behaviour: a slope
 * measured over 30 m and one measured over 300 m are different numbers, and the
 * one worth showing is the one at the scale being looked at.
 */

import { writeTerrarium } from "./terrarium";

export interface TileFrame {
  /** size * size heights, row-major from the top-left. NaN where no data. */
  heights: Float32Array;
  size: number;
  z: number;
  x: number;
  y: number;
  /** Ground resolution at the tile's centre latitude. */
  metresPerPixel: number;
}

export type TileRenderer = (frame: TileFrame) => Uint8Array;

export type Rgb = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

// ── Terrain ─────────────────────────────────────────────────────────────────

export const terrariumTile: TileRenderer = ({ heights, size }) => {
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < heights.length; i++) {
    writeTerrarium(rgba, i * 4, heights[i]);
  }
  return rgba;
};

// ── Hypsometric tint ────────────────────────────────────────────────────────

export interface ColourStop {
  elevation: number;
  colour: Rgb;
}

/**
 * A restrained land ramp: green lowlands through tan and brown to grey rock and
 * white above the snow line.
 *
 * Deliberately not a rainbow. On an operational map the tint is background —
 * units, orders and control measures are the foreground, and a saturated ramp
 * competes with the very symbols it is supposed to sit behind. Sea level starts
 * at a pale green rather than blue because water in this DEM is a void, not a
 * depth: colouring 0 m blue would paint every river valley as a lake.
 */
export const HYPSOMETRIC_STOPS: readonly ColourStop[] = [
  { elevation: 0, colour: [176, 200, 160] },
  { elevation: 200, colour: [200, 208, 152] },
  { elevation: 500, colour: [214, 196, 140] },
  { elevation: 1000, colour: [198, 166, 118] },
  { elevation: 1800, colour: [166, 132, 100] },
  { elevation: 2600, colour: [150, 140, 138] },
  { elevation: 3500, colour: [196, 196, 200] },
  { elevation: 4500, colour: [246, 246, 248] },
];

/** Linear interpolation between stops; clamped at both ends. */
export function rampColour(
  stops: readonly ColourStop[],
  elevation: number,
): Rgb {
  if (stops.length === 0) {return [0, 0, 0];}
  if (elevation <= stops[0].elevation) {return stops[0].colour;}

  for (let i = 1; i < stops.length; i++) {
    const upper = stops[i];
    if (elevation > upper.elevation) {continue;}
    const lower = stops[i - 1];
    const span = upper.elevation - lower.elevation;
    const t = span > 0 ? (elevation - lower.elevation) / span : 0;
    return [
      Math.round(lower.colour[0] + (upper.colour[0] - lower.colour[0]) * t),
      Math.round(lower.colour[1] + (upper.colour[1] - lower.colour[1]) * t),
      Math.round(lower.colour[2] + (upper.colour[2] - lower.colour[2]) * t),
    ];
  }

  return stops[stops.length - 1].colour;
}

export interface HypsometricOptions {
  stops?: readonly ColourStop[];
  /** 0-1. Applied to every land pixel; voids stay fully transparent. */
  opacity?: number;
}

export function hypsometricTile(
  options: HypsometricOptions = {},
): TileRenderer {
  const stops = options.stops ?? HYPSOMETRIC_STOPS;
  const alpha = Math.round(255 * (options.opacity ?? 1));

  return ({ heights, size }) => {
    const rgba = new Uint8Array(size * size * 4);
    for (let i = 0; i < heights.length; i++) {
      const height = heights[i];
      // Transparent, not black: this is drawn over the vector basemap, and a
      // void is somewhere with no measurement — usually water, which the
      // basemap already draws perfectly well.
      if (!Number.isFinite(height)) {continue;}
      const [r, g, b] = rampColour(stops, height);
      const at = i * 4;
      rgba[at] = r;
      rgba[at + 1] = g;
      rgba[at + 2] = b;
      rgba[at + 3] = alpha;
    }
    return rgba;
  };
}

// ── Slope classes ───────────────────────────────────────────────────────────

export interface SlopeClass {
  /** Upper bound of the class, rise over run. Infinity for the last. */
  maxSlope: number;
  colour: Rgba;
  label: string;
}

/**
 * Mobility bands, keyed to the pathfinding graph's own threshold.
 *
 * The graphs in `Pathfinding` declare `max_slope: 0.4` and refuse to traverse
 * anything steeper, so 0.4 is where "no-go" begins here — the map and the
 * router then disagree about nothing. The two bands below it are the
 * conventional wheeled/tracked break points.
 *
 * Go is fully transparent on purpose: shading the 90% of terrain that is
 * trafficable tells the reader nothing and hides the basemap under a wash.
 */
export const MOBILITY_SLOPE_CLASSES: readonly SlopeClass[] = [
  { maxSlope: 0.1, colour: [0, 0, 0, 0], label: "go (<10%)" },
  { maxSlope: 0.3, colour: [246, 200, 88, 90], label: "slow (10-30%)" },
  { maxSlope: 0.4, colour: [232, 140, 56, 130], label: "restricted (30-40%)" },
  { maxSlope: Infinity, colour: [200, 60, 48, 165], label: "no-go (>40%)" },
];

export interface SlopeOptions {
  classes?: readonly SlopeClass[];
}

// ── Baked shaded relief ─────────────────────────────────────────────────────

/**
 * Relief that was shaded BEFORE it got here — `gdaldem hillshade` per DEM cell,
 * stored as its own 8-bit GeoTIFF — rather than computed by MapLibre from the
 * DEM at draw time.
 *
 * Both have their place. MapLibre's `hillshade` layer needs no second dataset
 * and its light can be moved without re-rendering a tile; a baked one is a
 * picture somebody chose, with whatever azimuth, altitude, z-factor and
 * multi-directional trickery GDAL was asked for, and it costs no gradient
 * arithmetic per frame.
 *
 * DRAWN AS SHADOW AND LIGHT, NOT AS GREY
 * --------------------------------------
 * The obvious rendering — grey pixel, value straight through — puts a sheet of
 * grey over the map and drains every colour under it. So the neutral value is
 * treated as fully transparent and only the DEPARTURE from it is painted:
 * darker than neutral shades towards black, lighter than neutral towards white,
 * both scaled by their own strength. The plate keeps its colours and gains
 * relief, which is what a shaded topographic sheet actually looks like.
 *
 * `neutral` defaults to 180 because that is what `gdaldem hillshade` gives flat
 * ground at its default 45° sun altitude: 255 × sin(45°) ≈ 180. Change the
 * altitude when baking and this has to move with it, or flat country will be
 * uniformly shaded or uniformly lit.
 */
export interface ShadedReliefOptions {
  /** The value flat ground carries. 255·sin(altitude) for a gdaldem bake. */
  neutral?: number;
  /** 0-1. How dark the shadowed slopes go. */
  shadow?: number;
  /** 0-1. How bright the lit slopes go. 0 for shadows only, which is subtler. */
  highlight?: number;
  shadowColour?: Rgb;
  highlightColour?: Rgb;
}

export const DEFAULT_NEUTRAL_SHADE = 180;

export function shadedReliefTile(
  options: ShadedReliefOptions = {},
): TileRenderer {
  const neutral = options.neutral ?? DEFAULT_NEUTRAL_SHADE;
  const shadow = options.shadow ?? 0.55;
  const highlight = options.highlight ?? 0.25;
  const [sr, sg, sb] = options.shadowColour ?? [40, 36, 32];
  const [hr, hg, hb] = options.highlightColour ?? [255, 255, 250];
  // A bake with the sun at the zenith would make this zero; do not divide by it.
  const litRange = Math.max(1, 255 - neutral);

  return ({ heights, size }) => {
    const rgba = new Uint8Array(size * size * 4);

    for (let i = 0; i < heights.length; i++) {
      const value = heights[i];
      // Transparent, not black: gdaldem writes 0 for no data and shifts real
      // shading into 1-255, so the store's nodata turns those into NaN here.
      if (!Number.isFinite(value)) {continue;}

      const at = i * 4;
      if (value < neutral) {
        const strength = ((neutral - value) / neutral) * shadow;
        rgba[at] = sr;
        rgba[at + 1] = sg;
        rgba[at + 2] = sb;
        rgba[at + 3] = Math.round(255 * Math.min(1, strength));
      } else if (highlight > 0 && value > neutral) {
        const strength = ((value - neutral) / litRange) * highlight;
        rgba[at] = hr;
        rgba[at + 1] = hg;
        rgba[at + 2] = hb;
        rgba[at + 3] = Math.round(255 * Math.min(1, strength));
      }
      // Exactly neutral: flat ground, left transparent.
    }

    return rgba;
  };
}

// ── Contours ────────────────────────────────────────────────────────────────

/**
 * HOW THESE ARE DRAWN, AND WHY NOT WITH MARCHING SQUARES
 * ------------------------------------------------------
 * The textbook way to get a contour is to trace the isoline: marching squares
 * over the lattice, stitch the segments into rings, smooth, simplify. That is
 * the right thing to do when you need contours as GEOMETRY — labelled with
 * their height, clickable, crisp at any zoom — and it is a much larger piece of
 * work: per-cell tracing, seam stitching between DEM cells, and a worker to
 * keep it off the main thread.
 *
 * This is the raster answer, and it is nearly free because the pixel already
 * knows everything needed:
 *
 *   the height h at this pixel, and the interval I, give the distance in
 *   METRES to the nearest contour:      dh = |h - round(h / I) * I|
 *   the gradient g = |∇h| (rise/run) converts that to a distance along the
 *   GROUND:                             ds = dh / g
 *   and metresPerPixel converts it to a distance in PIXELS:  ds / mpp
 *
 * Paint any pixel within half a line width of a contour and the lines come out
 * closed, connected and correctly spaced without a single segment being
 * traced. Feathering the last pixel of that distance antialiases them for
 * free, and because the width is expressed in PIXELS the lines stay the same
 * weight at every zoom instead of thinning out as the ground stretches.
 *
 * Two consequences worth knowing. Flat ground has g ≈ 0, so ds explodes and
 * nothing is drawn — correct, and it is why a plain is not a solid wash. And
 * these lines cannot be labelled: there is no way to write "300 m" along a
 * raster line. If the height has to be readable off the map, that is the
 * marching-squares job above, and this renderer stays the cheap zoomed-out
 * version of it.
 */

/** One rung of the interval ladder: at `minZoom` and above, use `interval`. */
export interface ContourStep {
  minZoom: number;
  /** Vertical interval in metres. */
  interval: number;
}

/**
 * The interval ladder, coarse to fine.
 *
 * A contour interval is fixed in METRES but read in PIXELS, so one interval
 * cannot serve every zoom: 10 m contours at z9 are a solid mat of ink, and
 * 100 m contours at z15 are two lines on the screen. The rungs are a step
 * function rather than something interpolated, deliberately — a contour that
 * fades in halfway through a zoom is worse than one that appears.
 */
export const CONTOUR_LADDER: readonly ContourStep[] = [
  { minZoom: 14, interval: 10 },
  { minZoom: 12, interval: 25 },
  { minZoom: 0, interval: 100 },
];

/** The interval for a zoom. Rungs are tried in order, so coarse first wins. */
export function intervalForZoom(
  zoom: number,
  ladder: readonly ContourStep[] = CONTOUR_LADDER,
): number {
  for (const step of ladder) {
    if (zoom >= step.minZoom) {return step.interval;}
  }
  return ladder[ladder.length - 1]?.interval ?? 100;
}

/** Bistre, the colour a topographic sheet prints contours in. */
export const CONTOUR_COLOUR: Rgb = [138, 106, 74];

export interface ContourOptions {
  /** Fixed interval in metres. Omit to take it from the zoom ladder. */
  interval?: number;
  ladder?: readonly ContourStep[];
  /**
   * Every Nth contour is an INDEX contour, drawn heavier — the ones a reader
   * counts from. 5 is the convention. 0 draws none.
   */
  indexEvery?: number;
  colour?: Rgb;
  /**
   * Line width of an ordinary contour, in TILE pixels. Hairline by default:
   * these are drawn at the tile's own resolution and there are a great many of
   * them, and anything above about a pixel reads as a fence rather than a
   * contour.
   */
  width?: number;
  /** Line width of an index contour, in tile pixels. */
  indexWidth?: number;
  /**
   * Pixels of fade beyond the line's edge. This is the whole of the
   * antialiasing, so it should stay well under a pixel: at 1 it doubles the
   * apparent weight of a hairline.
   */
  feather?: number;
  /** Peak opacity, 0-1. */
  opacity?: number;
}

export function contourTile(options: ContourOptions = {}): TileRenderer {
  const ladder = options.ladder ?? CONTOUR_LADDER;
  const indexEvery = options.indexEvery ?? 5;
  const [red, green, blue] = options.colour ?? CONTOUR_COLOUR;
  // Widths are FULL widths, so the half-width below is what the distance test
  // compares against. 0.8 is a hairline that still antialiases to something
  // continuous; 1.6 is enough for an index contour to be obviously heavier
  // without becoming a band.
  const width = options.width ?? 0.8;
  const indexWidth = options.indexWidth ?? 1.6;
  const feather = options.feather ?? 0.5;
  const peak = options.opacity ?? 0.8;

  return ({ heights, size, z, metresPerPixel }) => {
    const interval = options.interval ?? intervalForZoom(z, ladder);
    const rgba = new Uint8Array(size * size * 4);
    if (!(interval > 0)) {return rgba;}

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const index = row * size + col;
        const here = heights[index];
        if (!Number.isFinite(here)) {continue;}

        // Gradient exactly as slopeTile computes it, one-sided at the tile
        // edge for the same reason: a border is one pixel in 256.
        const west = heights[index - (col > 0 ? 1 : 0)];
        const east = heights[index + (col < size - 1 ? 1 : 0)];
        const north = heights[index - (row > 0 ? size : 0)];
        const south = heights[index + (row < size - 1 ? size : 0)];

        const runX = (col > 0 && col < size - 1 ? 2 : 1) * metresPerPixel;
        const runY = (row > 0 && row < size - 1 ? 2 : 1) * metresPerPixel;

        const dzdx =
          Number.isFinite(west) && Number.isFinite(east)
            ? (east - west) / runX
            : 0;
        const dzdy =
          Number.isFinite(north) && Number.isFinite(south)
            ? (south - north) / runY
            : 0;

        const gradient = Math.hypot(dzdx, dzdy);
        // Flat ground is not "every contour at once", it is no contour.
        if (!(gradient > 0)) {continue;}

        const nearest = Math.round(here / interval);
        const metresToLine = Math.abs(here - nearest * interval);
        const pixelsToLine = metresToLine / gradient / metresPerPixel;

        const isIndex = indexEvery > 0 && nearest % indexEvery === 0;
        const half = (isIndex ? indexWidth : width) / 2;

        // Solid within the half-width, fading over `feather` beyond it. That
        // fade is the whole of the antialiasing.
        const coverage = (half + feather - pixelsToLine) / feather;
        if (coverage <= 0) {continue;}

        const at = index * 4;
        rgba[at] = red;
        rgba[at + 1] = green;
        rgba[at + 2] = blue;
        rgba[at + 3] = Math.round(255 * peak * Math.min(1, coverage));
      }
    }

    return rgba;
  };
}

export function slopeTile(options: SlopeOptions = {}): TileRenderer {
  const classes = options.classes ?? MOBILITY_SLOPE_CLASSES;

  return ({ heights, size, metresPerPixel }) => {
    const rgba = new Uint8Array(size * size * 4);

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const index = row * size + col;
        const here = heights[index];
        if (!Number.isFinite(here)) {continue;}

        // One-sided at the tile edge. A tile border is one pixel in 256 and
        // fetching the neighbouring tile to do better would triple the work
        // for a difference nobody can see.
        const west = heights[index - (col > 0 ? 1 : 0)];
        const east = heights[index + (col < size - 1 ? 1 : 0)];
        const north = heights[index - (row > 0 ? size : 0)];
        const south = heights[index + (row < size - 1 ? size : 0)];

        const runX = (col > 0 && col < size - 1 ? 2 : 1) * metresPerPixel;
        const runY = (row > 0 && row < size - 1 ? 2 : 1) * metresPerPixel;

        const dzdx = Number.isFinite(west) && Number.isFinite(east)
          ? (east - west) / runX
          : 0;
        const dzdy = Number.isFinite(north) && Number.isFinite(south)
          ? (south - north) / runY
          : 0;

        const slope = Math.hypot(dzdx, dzdy);
        const band = classes.find((c) => slope < c.maxSlope) ?? classes[classes.length - 1];
        if (band.colour[3] === 0) {continue;}

        const at = index * 4;
        rgba[at] = band.colour[0];
        rgba[at + 1] = band.colour[1];
        rgba[at + 2] = band.colour[2];
        rgba[at + 3] = band.colour[3];
      }
    }

    return rgba;
  };
}
