/**
 * Terrain analysis over a HeightSource: line of sight, viewshed, zonal
 * statistics, and per-tile slope/aspect.
 *
 * Earth curvature and refraction: a point d metres away sits
 *     drop(d) = d^2 * (1 - k) / (2 R)
 * below the observer's tangent plane, with k the refraction coefficient
 * (0.13 is the usual daytime value). Heights are reduced by drop(d) and the
 * sight line is then straight.
 *
 * Viewshed approach (polar raster + boundary tracing):
 *   1. Cast `rays` rays; on each, sample at ring centres (k + 0.5) * stepM out
 *      to radiusM. All samples are fetched with one `heightsAlong` call, so the
 *      tiles under the disc are loaded once, in parallel.
 *   2. Along each ray, a sample is visible when the angle from the eye to the
 *      target height above it is at least the steepest angle to any nearer
 *      ground (the classic running-max horizon test). This fills a polar grid
 *      vis[ray][ring], each cell an annular sector.
 *   3. The visible cells are traced into rings directly in polar-grid space
 *      (directed boundary edges with the visible side on the left, chained with
 *      a left-turn rule at saddles; the ray axis wraps), mapped to lon/lat, and
 *      sorted into outer rings and holes by signed area. No polygon unions are
 *      needed, so the cost is linear in the number of cells.
 *   Areas are summed exactly from the sectors, not from the traced polygons.
 */
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { area as turfArea } from "@turf/turf";
import type { HeightSource } from "./heightgrid";

export const EARTH_RADIUS_M = 6371008.8;
const RAD = Math.PI / 180;

export type LonLat = [number, number];

export function haversineM(a: readonly [number, number], b: readonly [number, number]): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point `distM` from `origin` on initial bearing `bearingDeg` (clockwise from north). */
export function destination(origin: readonly [number, number], bearingDeg: number, distM: number): LonLat {
  const d = distM / EARTH_RADIUS_M;
  const b = bearingDeg * RAD;
  const lat1 = origin[1] * RAD;
  const lon1 = origin[0] * RAD;
  const sinLat2 = Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b);
  const lat2 = Math.asin(sinLat2);
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * sinLat2);
  return [((((lon2 / RAD + 540) % 360) + 360) % 360) - 180, lat2 / RAD];
}

/** Point a fraction f of the way along the great circle a→b. */
export function interpolateGreatCircle(a: readonly [number, number], b: readonly [number, number], f: number): LonLat {
  const φ1 = a[1] * RAD, λ1 = a[0] * RAD, φ2 = b[1] * RAD, λ2 = b[0] * RAD;
  const δ = haversineM(a, b) / EARTH_RADIUS_M;
  if (δ < 1e-12) {return [a[0], a[1]];}
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const zc = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [Math.atan2(y, x) / RAD, Math.atan2(zc, Math.hypot(x, y)) / RAD];
}

/** Metres below the tangent plane at distance d (0 when curvature is off). */
export function curvatureDrop(d: number, earthCurvature: boolean, refraction: number): number {
  return earthCurvature ? (d * d * (1 - refraction)) / (2 * EARTH_RADIUS_M) : 0;
}

// ─── Line of sight ──────────────────────────────────────────────────────────

export interface LineOfSightOptions {
  observerHeightM?: number;
  targetHeightM?: number;
  samples?: number;
  earthCurvature?: boolean;
  refraction?: number;
}

export interface LineOfSightResult {
  visible: boolean;
  /** The first point where the ground rises above the sight line. */
  blockedAt?: { lon: number; lat: number; distanceM: number };
  /** ground: terrain height (m); sightLine: height of the eye→target line above the same datum, curvature included. */
  profile: Array<{ distanceM: number; ground: number; sightLine: number }>;
  /** Stretches of ground where a target `targetHeightM` tall would be seen from the observer. */
  visibleSegments: Array<[number, number]>;
}

export async function lineOfSight(src: HeightSource, from: LonLat, to: LonLat, opts: LineOfSightOptions = {}): Promise<LineOfSightResult> {
  const observerH = opts.observerHeightM ?? 2;
  const targetH = opts.targetHeightM ?? 0;
  const n = Math.max(2, Math.round(opts.samples ?? 256));
  const curve = opts.earthCurvature ?? true;
  const k = opts.refraction ?? 0.13;
  const total = haversineM(from, to);
  const pts: LonLat[] = [];
  for (let i = 0; i < n; i++) {pts.push(interpolateGreatCircle(from, to, i / (n - 1)));}
  const raw = await src.heightsAlong(pts);
  const ground = raw.map((h) => h ?? 0);
  const dist = pts.map((_, i) => (total * i) / (n - 1));
  const eff = ground.map((h, i) => h - curvatureDrop(dist[i], curve, k));
  const eye = ground[0] + observerH;
  const target = eff[n - 1] + targetH;

  const profile = dist.map((d, i) => ({
    distanceM: d,
    ground: ground[i],
    sightLine: total > 0 ? eye + ((target - eye) * d) / total + curvatureDrop(d, curve, k) : eye,
  }));
  let blocked = -1;
  for (let i = 1; i < n - 1; i++) {
    if (profile[i].ground > profile[i].sightLine + 1e-6) {
      blocked = i;
      break;
    }
  }

  // Running-max horizon: visibility of a target targetH tall at each sample.
  const visibleSegments: Array<[number, number]> = [];
  let maxSlope = -Infinity;
  let runStart = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    const d = dist[i];
    let vis: boolean;
    if (d <= 0) {
      vis = true;
    } else {
      vis = (eff[i] + targetH - eye) / d >= maxSlope - 1e-12;
      maxSlope = Math.max(maxSlope, (eff[i] - eye) / d);
    }
    if (vis && runStart < 0) {runStart = i;}
    if (vis) {last = i;}
    if (!vis && runStart >= 0) {
      visibleSegments.push([dist[runStart], dist[last]]);
      runStart = -1;
    }
  }
  if (runStart >= 0) {visibleSegments.push([dist[runStart], dist[last]]);}

  const result: LineOfSightResult = { visible: blocked < 0, profile, visibleSegments };
  if (blocked >= 0) {result.blockedAt = { lon: pts[blocked][0], lat: pts[blocked][1], distanceM: dist[blocked] };}
  return result;
}

// ─── Viewshed ───────────────────────────────────────────────────────────────

export interface ViewshedOptions {
  radiusM: number;
  observerHeightM?: number;
  targetHeightM?: number;
  rays?: number;
  /** Radial sample spacing. Default: one maxZoom pixel, but at least radiusM / 1000. */
  stepM?: number;
  earthCurvature?: boolean;
  refraction?: number;
}

export interface ViewshedResult extends FeatureCollection<MultiPolygon> {
  stats: {
    visibleAreaM2: number;
    totalAreaM2: number;
    rays: number;
    rings: number;
    stepM: number;
    observerGroundM: number;
  };
}

export async function viewshed(src: HeightSource, centre: LonLat, opts: ViewshedOptions): Promise<ViewshedResult> {
  const radius = opts.radiusM;
  if (!(radius > 0)) {throw new Error("viewshed radiusM must be positive");}
  const observerH = opts.observerHeightM ?? 2;
  const targetH = opts.targetHeightM ?? 0;
  const R = Math.max(8, Math.round(opts.rays ?? 360));
  const curve = opts.earthCurvature ?? true;
  const k = opts.refraction ?? 0.13;
  const step = opts.stepM ?? Math.max(src.pixelSizeM(centre[1]), radius / 1000);
  const K = Math.max(1, Math.ceil(radius / step));

  // All samples: centre first, then ray by ray, ring by ring.
  const pts: LonLat[] = [centre];
  const dists = new Float64Array(K);
  for (let r = 0; r < K; r++) {dists[r] = Math.min((r + 0.5) * step, radius);}
  for (let i = 0; i < R; i++) {
    const bearing = (360 * i) / R;
    for (let r = 0; r < K; r++) {pts.push(destination(centre, bearing, dists[r]));}
  }
  const hs = await src.heightsAlong(pts);
  const groundC = hs[0] ?? 0;
  const eye = groundC + observerH;
  const drop = new Float64Array(K);
  for (let r = 0; r < K; r++) {drop[r] = curvatureDrop(dists[r], curve, k);}

  const vis = new Uint8Array(R * K);
  let visibleArea = 0;
  const dθ = (2 * Math.PI) / R;
  const ringArea = new Float64Array(K);
  for (let r = 0; r < K; r++) {
    const r0 = Math.min(r * step, radius);
    const r1 = Math.min((r + 1) * step, radius);
    ringArea[r] = (dθ / 2) * (r1 * r1 - r0 * r0);
  }
  for (let i = 0; i < R; i++) {
    let maxSlope = -Infinity;
    const base = 1 + i * K;
    for (let r = 0; r < K; r++) {
      const d = dists[r];
      const h = (hs[base + r] ?? 0) - drop[r];
      if ((h + targetH - eye) / d >= maxSlope - 1e-12) {
        vis[i * K + r] = 1;
        visibleArea += ringArea[r];
      }
      const s = (h - eye) / d;
      if (s > maxSlope) {maxSlope = s;}
    }
  }

  const polygons = tracePolar(vis, R, K, (ring, ray) => {
    const rr = Math.min(ring * step, radius);
    return { r: rr, bearing: ((ray - 0.5) * 360) / R };
  }, centre);

  const features: Feature<MultiPolygon>[] = polygons.length
    ? [{ type: "Feature", properties: { kind: "visible" }, geometry: { type: "MultiPolygon", coordinates: polygons } }]
    : [];
  return {
    type: "FeatureCollection",
    features,
    stats: { visibleAreaM2: visibleArea, totalAreaM2: Math.PI * radius * radius, rays: R, rings: K, stepM: step, observerGroundM: groundC },
  };
}

/**
 * Trace visible cells of a polar grid into polygons. Grid cell (ray i, ring k)
 * is vis[i*K + k]; grid x = ring, y = ray (wrapping). Vertex (k, i) is mapped
 * with `at` to polar coordinates around `centre`.
 */
function tracePolar(
  vis: Uint8Array,
  R: number,
  K: number,
  at: (ring: number, ray: number) => { r: number; bearing: number },
  centre: LonLat,
): Position[][][] {
  const V = K + 1; // vertex columns 0..K
  const vid = (k: number, i: number) => (((i % R) + R) % R) * V + k;
  const cell = (k: number, i: number) => (k < 0 || k >= K ? 0 : vis[(((i % R) + R) % R) * K + k]);
  // Directed edges, visible on the left. Encoded as from-vertex → list of [to-vertex, dir].
  // dir: 0 = +x (ring out), 1 = +y (ray up), 2 = -x, 3 = -y.
  const out = new Map<number, Array<[number, number]>>();
  const add = (fk: number, fi: number, tk: number, ti: number, dir: number) => {
    const f = vid(fk, fi);
    let l = out.get(f);
    if (!l) {out.set(f, (l = []));}
    l.push([vid(tk, ti), dir]);
  };
  for (let i = 0; i < R; i++) {
    for (let k = 0; k < K; k++) {
      if (!vis[i * K + k]) {continue;}
      if (!cell(k, i - 1)) {add(k, i, k + 1, i, 0);}
      if (!cell(k + 1, i)) {add(k + 1, i, k + 1, i + 1, 1);}
      if (!cell(k, i + 1)) {add(k + 1, i + 1, k, i + 1, 2);}
      if (!cell(k - 1, i)) {add(k, i + 1, k, i, 3);}
    }
  }

  const planar = (v: number): [number, number] => {
    const k = v % V;
    const i = Math.floor(v / V);
    const { r, bearing } = at(k, i);
    return [r * Math.sin(bearing * RAD), r * Math.cos(bearing * RAD)];
  };

  type Ring = { xy: Array<[number, number]>; area: number };
  const rings: Ring[] = [];
  for (const [start, list] of out) {
    while (list.length) {
      const [first, firstDir] = list.pop()!;
      const verts: number[] = [start];
      const dirs: number[] = [firstDir];
      let cur = first;
      let dir = firstDir;
      let guard = 4 * R * V + 8;
      while (cur !== start && guard-- > 0) {
        const cand = out.get(cur);
        if (!cand || !cand.length) {break;}
        // Prefer a left turn, then straight, then right: keeps diagonal cells apart.
        let pick = 0;
        let best = 9;
        for (let j = 0; j < cand.length; j++) {
          const rank = [1, 0, 3, 2][(cand[j][1] - dir + 4) % 4];
          if (rank < best) {
            best = rank;
            pick = j;
          }
        }
        const [next, nd] = cand.splice(pick, 1)[0];
        verts.push(cur);
        dirs.push(nd);
        cur = next;
        dir = nd;
      }
      // Drop vertices in the middle of straight radial runs (angular runs are arcs: keep).
      const xy: Array<[number, number]> = [];
      for (let j = 0; j < verts.length; j++) {
        const inDir = dirs[(j - 1 + dirs.length) % dirs.length];
        const outDir = dirs[j];
        if (inDir === outDir && (outDir === 0 || outDir === 2)) {continue;}
        const p = planar(verts[j]);
        const prev = xy[xy.length - 1];
        if (prev && Math.abs(prev[0] - p[0]) < 1e-6 && Math.abs(prev[1] - p[1]) < 1e-6) {continue;}
        xy.push(p);
      }
      while (xy.length > 1 && Math.abs(xy[0][0] - xy[xy.length - 1][0]) < 1e-6 && Math.abs(xy[0][1] - xy[xy.length - 1][1]) < 1e-6) {xy.pop();}
      if (xy.length < 3) {continue;}
      let a = 0;
      for (let j = 0; j < xy.length; j++) {
        const p = xy[j];
        const q = xy[(j + 1) % xy.length];
        a += p[0] * q[1] - q[0] * p[1];
      }
      a /= 2;
      if (Math.abs(a) < 1e-3) {continue;}
      rings.push({ xy, area: a });
    }
  }

  // Bearing runs clockwise, so the polar map reverses orientation: outer rings
  // (visible on the left in grid space) come out clockwise (negative area).
  const outers = rings.filter((r) => r.area < 0).sort((a, b) => a.area - b.area);
  const holes = rings.filter((r) => r.area > 0);
  const polys: Array<{ outer: Ring; holes: Ring[] }> = outers.map((o) => ({ outer: o, holes: [] }));
  for (const h of holes) {
    const p = interiorPoint(h.xy);
    // The smallest outer that contains the hole.
    let host: { outer: Ring; holes: Ring[] } | null = null;
    for (const c of polys) {
      if (pointInRing(p, c.outer.xy) && (!host || c.outer.area > host.outer.area)) {host = c;}
    }
    if (host) {host.holes.push(h);}
  }

  const toLonLat = ([x, y]: [number, number]): Position => {
    const d = Math.hypot(x, y);
    if (d < 1e-6) {return [centre[0], centre[1]];}
    return destination(centre, Math.atan2(x, y) / RAD, d);
  };
  const close = (ring: Position[]) => [...ring, ring[0]];
  // GeoJSON: outer counter-clockwise, holes clockwise.
  return polys.map(({ outer, holes: hs }) => [
    close(outer.xy.slice().reverse().map(toLonLat)),
    ...hs.map((h) => close(h.xy.slice().reverse().map(toLonLat))),
  ]);
}

function pointInRing(p: [number, number], ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {inside = !inside;}
  }
  return inside;
}

/** A point just inside a ring: midpoint of its first edge, nudged towards the interior. */
function interiorPoint(ring: Array<[number, number]>): [number, number] {
  for (let j = 0; j < ring.length; j++) {
    const a = ring[j];
    const b = ring[(j + 1) % ring.length];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) {continue;}
    const eps = Math.min(0.01, len * 1e-3);
    // A ring with positive area has its interior on the left.
    const p: [number, number] = [mx - ((b[1] - a[1]) / len) * eps, my + ((b[0] - a[0]) / len) * eps];
    if (pointInRing(p, ring)) {return p;}
  }
  return ring[0];
}

// ─── Zonal statistics ───────────────────────────────────────────────────────

export interface ZonalStats {
  min: number;
  max: number;
  mean: number;
  stdev: number;
  count: number;
  areaM2: number;
  cellM: number;
}

type PolygonLike = Polygon | MultiPolygon | Feature<Polygon | MultiPolygon>;

/**
 * Height statistics inside a polygon, from a regular grid of samples (cell
 * centres, chosen by scanline so holes and multipolygons are exact). The cell
 * size defaults to whatever gives ~20k samples, but no finer than one maxZoom
 * pixel. A polygon smaller than one cell is sampled at its first vertex.
 */
export async function zonalStats(src: HeightSource, polygon: PolygonLike, opts: { cellM?: number } = {}): Promise<ZonalStats> {
  const geom = "geometry" in polygon ? polygon.geometry : polygon;
  const polys: Position[][][] = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const areaM2 = turfArea(geom);
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const p of polys) {
    for (const [lon, lat] of p[0]) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  const midLat = (minLat + maxLat) / 2;
  const cell = opts.cellM ?? Math.max(Math.sqrt(areaM2 / 20000), src.pixelSizeM(midLat));
  const mPerDegLat = (Math.PI * EARTH_RADIUS_M) / 180;
  const dLat = cell / mPerDegLat;
  const dLon = cell / (mPerDegLat * Math.max(1e-6, Math.cos(midLat * RAD)));

  const edges: Array<[number, number, number, number]> = [];
  for (const p of polys) {
    for (const ring of p) {
      for (let j = 0; j + 1 < ring.length; j++) {edges.push([ring[j][0], ring[j][1], ring[j + 1][0], ring[j + 1][1]]);}
    }
  }
  const pts: LonLat[] = [];
  for (let lat = minLat + dLat / 2; lat < maxLat; lat += dLat) {
    const xs: number[] = [];
    for (const [x1, y1, x2, y2] of edges) {
      if (y1 > lat !== y2 > lat) {xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));}
    }
    xs.sort((a, b) => a - b);
    for (let j = 0; j + 1 < xs.length; j += 2) {
      // Cell centres on a global column lattice so adjacent rows line up.
      const c0 = Math.ceil((xs[j] - minLon) / dLon - 0.5);
      for (let c = c0; ; c++) {
        const lon = minLon + (c + 0.5) * dLon;
        if (lon > xs[j + 1]) {break;}
        pts.push([lon, lat]);
      }
    }
  }
  if (!pts.length && polys[0]?.[0]?.[0]) {pts.push([polys[0][0][0][0], polys[0][0][0][1]]);}
  const hs = await src.heightsAlong(pts);
  let count = 0, mean = 0, m2 = 0, min = Infinity, max = -Infinity;
  for (const h of hs) {
    if (h === null) {continue;}
    count++;
    const d = h - mean;
    mean += d / count;
    m2 += d * (h - mean);
    if (h < min) {min = h;}
    if (h > max) {max = h;}
  }
  if (!count) {return { min: NaN, max: NaN, mean: NaN, stdev: NaN, count: 0, areaM2, cellM: cell };}
  return { min, max, mean, stdev: Math.sqrt(m2 / count), count, areaM2, cellM: cell };
}

// ─── Slope and aspect ───────────────────────────────────────────────────────

/**
 * Horn's slope and aspect for one tile, as terrain-gen's hillshade.py (minus
 * its low-zoom exaggeration). `heights` is (size+2)^2 with a one-pixel
 * border; the ground size of a pixel is the mercator pixel at the equator
 * times cos(latitude of the row).
 *
 * slopeDeg: 0 (flat) … 90. aspectDeg: compass direction the slope faces
 * (downhill), clockwise from north in [0, 360); -1 where the ground is flat.
 */
export function slopeAspect(heights: Float32Array, size: number, z: number, y: number): { slopeDeg: Float32Array; aspectDeg: Float32Array } {
  const W = size + 2;
  if (heights.length !== W * W) {throw new Error(`slopeAspect wants ${W}x${W} heights, got ${heights.length}`);}
  const slopeDeg = new Float32Array(size * size);
  const aspectDeg = new Float32Array(size * size);
  const n = 2 ** z;
  const px = 40075016.686 / (size * n);
  for (let r = 0; r < size; r++) {
    const ys = (y + (r + 0.5) / size) / n;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * ys)));
    const cs8 = 8 * px * Math.cos(lat);
    const top = r * W;
    const mid = top + W;
    const bot = mid + W;
    for (let c = 0; c < size; c++) {
      const a = heights[top + c], b = heights[top + c + 1], cc = heights[top + c + 2];
      const d = heights[mid + c], f = heights[mid + c + 2];
      const g = heights[bot + c], h = heights[bot + c + 1], i = heights[bot + c + 2];
      const dzdx = (cc + 2 * f + i - (a + 2 * d + g)) / cs8; // east
      const dzdy = (g + 2 * h + i - (a + 2 * b + cc)) / cs8; // south
      const grad = Math.hypot(dzdx, dzdy);
      const o = r * size + c;
      slopeDeg[o] = Math.atan(grad) / RAD;
      if (grad < 1e-9) {
        aspectDeg[o] = -1;
      } else {
        // Downhill = -gradient = (east: -dzdx, north: +dzdy).
        const az = Math.atan2(-dzdx, dzdy) / RAD;
        aspectDeg[o] = az < 0 ? az + 360 : az;
      }
    }
  }
  return { slopeDeg, aspectDeg };
}
