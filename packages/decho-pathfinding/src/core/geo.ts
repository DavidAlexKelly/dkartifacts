/**
 * The two pieces of geodesy this package needs, and nothing else.
 *
 * Distances matter here in a way they do not in a map component: they are the
 * A* heuristic, and an OVERESTIMATE breaks admissibility, which silently
 * returns a route that is not the cheapest. So this uses real great-circle
 * distance rather than the degrees-as-metres shortcut used for symbol
 * placement in @acc/decho-mil-map — that one is fine for screen work and
 * would be wrong here.
 */

/** IUGG mean Earth radius, the same figure the graph generator's distances assume. */
export const EARTH_RADIUS_M = 6371008.8;

const DEG = Math.PI / 180;

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than the law of cosines: at 1500 m node spacing the cosine
 * form loses precision to floating point exactly where every edge in this
 * dataset lives.
 */
export function haversineM(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Metres per degree of longitude at a given latitude.
 *
 * Used to turn a metre radius into a lon/lat search box. At 85° — the top row
 * of this grid — a degree of longitude is under 10 km, so treating lon and lat
 * degrees alike would search a box eleven times too narrow and miss the
 * neighbour it was looking for.
 */
export function metresPerLonDegree(lat: number): number {
  return Math.max(1, Math.cos(lat * DEG) * EARTH_RADIUS_M * DEG);
}

/** Metres per degree of latitude. Constant enough for a spherical Earth. */
export function metresPerLatDegree(): number {
  return EARTH_RADIUS_M * DEG;
}

/**
 * Local planar projection about an anchor, in metres.
 *
 * Only ever used over distances of a few cells, where equirectangular error is
 * well under the 1500 m node spacing, and only for line simplification — never
 * for costs.
 */
export function toLocalMetres(
  lon: number,
  lat: number,
  anchorLon: number,
  anchorLat: number,
): { x: number; y: number } {
  return {
    x: (lon - anchorLon) * metresPerLonDegree(anchorLat),
    y: (lat - anchorLat) * metresPerLatDegree(),
  };
}
