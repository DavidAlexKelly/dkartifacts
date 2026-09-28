/**
 * How big a unit symbol is at a given zoom.
 *
 * WHY UNITS SCALE AT ALL, WHEN A MARKER NATURALLY DOES NOT
 * --------------------------------------------------------
 * The tactical graphics are GeoJSON layers: an axis of advance is a real
 * distance on the ground, so it grows and shrinks with the map like the road it
 * follows. A unit symbol is a `maplibregl.Marker` — a DOM element positioned by
 * the map but sized in CSS pixels — so it stays exactly the same size at every
 * zoom.
 *
 * Which means the two drift apart. Zoom in and the order arrow grows while the
 * unit that owns it does not, until a battalion sits like a postage stamp at
 * the tail of a kilometre-long axis; zoom out and the unit swamps the graphic
 * it belongs to. Neither reads as one thing.
 *
 * So the symbol is sized from the zoom: doubling per level, which is exactly
 * what "fixed on the ground" means, since one zoom level is a factor of two in
 * scale.
 *
 * WHY IT IS CLAMPED, AND WHY THAT IS NOT A FUDGE
 * ----------------------------------------------
 * Ground-fixed is only the right answer over the range where the symbol is
 * legible. Taken literally, a 26 px symbol anchored at z12 is 0.4 px at z6 and
 * 1,664 px at z18 — invisible, then a screenful. A unit is not a piece of
 * ground; it is a thing standing ON the ground whose SIZE is a cartographic
 * convention, and every paper map draws it at a readable size.
 *
 * So it scales with the map between the two bounds and pins outside them. In
 * the range a planner works in — roughly z10 to z15 — that is pure ground-fixed
 * behaviour, and the clamps only bite where the alternative is unusable.
 */

export interface UnitScaleOptions {
  /** Size in pixels at `anchorZoom`. */
  base: number;
  /** The zoom at which the symbol is exactly `base` pixels. */
  anchorZoom: number;
  /** Never smaller than this, or the symbol cannot be identified. */
  min: number;
  /** Never larger than this, or one unit owns the screen. */
  max: number;
}

/**
 * Defaults tuned for a planning view.
 *
 * Anchored at z12 because that is where the basemap's finest tiles are and
 * where these maps are usually read.
 *
 * With a 26 px base that gives true ground-fixed scaling from about z11 to
 * z13 — and pins outside it: 13 px at z11 is already at the floor, and 6 px at
 * z10 would be a smudge rather than a symbol.
 *
 * THE CEILING IS THE FUSSY NUMBER. It was 96 px, which is what a symbol
 * reaches by z14 and is plainly too big — one battalion covering a village.
 * 64 px is about two and a half times the anchor size: still obviously
 * growing with the map, still readable at arm's length, and small enough that
 * a handful of units zoomed right in do not become the map. The floor is the
 * easy end, and 14 px has needed no argument.
 */
export const DEFAULT_UNIT_SCALE: Omit<UnitScaleOptions, "base"> = {
  anchorZoom: 12,
  min: 14,
  max: 64,
};

/**
 * Symbol size in pixels for a zoom, rounded.
 *
 * Rounded because the caller re-renders the symbol when this number changes,
 * and a continuous value would mean re-rendering every marker on every frame of
 * a pinch for sub-pixel differences nobody can see.
 */
export function unitSizeForZoom(
  zoom: number,
  options: UnitScaleOptions,
): number {
  const { base, anchorZoom, min, max } = options;
  if (!Number.isFinite(zoom)) {
    return Math.round(base);
  }
  // One zoom level is a factor of two in scale, so this — and nothing else — is
  // what keeps the symbol a constant size on the ground.
  const scaled = base * 2 ** (zoom - anchorZoom);
  return Math.round(Math.min(max, Math.max(min, scaled)));
}
