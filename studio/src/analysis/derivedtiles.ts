/**
 * Slope and aspect tiles computed from the terrain pyramid: the pure part of
 * src/data/derived.ts (no MapLibre, no canvas), so it can be tested and run
 * in a worker.
 *
 * A tile at zoom z reads the pyramid at min(z, maxZoom): its own tile and the
 * eight neighbours for the one-pixel border. Above maxZoom the parent region
 * is resampled bilinearly (overzoom), so slopes stay continuous rather than
 * blocky. A missing neighbour repeats the centre tile's edge (as hillshade.py
 * does), so the edge of the data does not read as a cliff; a missing centre
 * tile is sea level, i.e. flat.
 */
import type { SourceSpecification } from "maplibre-gl";
import type { HeightSource } from "./heightgrid";
import { slopeAspect } from "./terrain";

export type DerivedKind = "slope" | "aspect";
export type Rgba = [number, number, number, number];

export interface SlopeClass {
  minDeg: number;
  maxDeg: number;
  color: Rgba;
  /** CSS colour for a legend swatch. */
  css: string;
  label: string;
}

const css = ([r, g, b, a]: Rgba) => `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(2)})`;

const slopeClass = (minDeg: number, maxDeg: number, color: Rgba, label: string): SlopeClass => ({ minDeg, maxDeg, color, css: css(color), label });

export const SLOPE_CLASSES: SlopeClass[] = [
  slopeClass(0, 5, [120, 190, 120, 24], "0–5°"),
  slopeClass(5, 15, [255, 221, 0, 150], "5–15°"),
  slopeClass(15, 30, [255, 140, 0, 170], "15–30°"),
  slopeClass(30, 45, [225, 30, 30, 190], "30–45°"),
  slopeClass(45, 90, [130, 40, 170, 210], "> 45°"),
];

/** Below this slope, aspect is left transparent (direction is noise on flat ground). */
export const ASPECT_FLAT_DEG = 2;
const ASPECT_ALPHA = 170;

/** HSV hue wheel: north red, east yellow-green, south cyan, west blue-violet. */
export function aspectColor(aspectDeg: number): Rgba {
  const h = (((aspectDeg % 360) + 360) % 360) / 60;
  const s = 0.85;
  const v = 0.95;
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), ASPECT_ALPHA];
}

export interface AspectLegendEntry {
  deg: number;
  label: string;
  color: Rgba;
  css: string;
}

export const ASPECT_LEGEND: AspectLegendEntry[] = (["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const).map((label, i) => {
  const color = aspectColor(i * 45);
  return { deg: i * 45, label, color, css: css(color) };
});

export const ASPECT_FLAT_LEGEND = { label: `Flat (< ${ASPECT_FLAT_DEG}°)`, css: "transparent" };

/** RGBA of a slope tile. */
export function slopeRgba(slopeDeg: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(slopeDeg.length * 4);
  for (let i = 0; i < slopeDeg.length; i++) {
    const s = slopeDeg[i];
    const c = s < 5 ? SLOPE_CLASSES[0] : s < 15 ? SLOPE_CLASSES[1] : s < 30 ? SLOPE_CLASSES[2] : s < 45 ? SLOPE_CLASSES[3] : SLOPE_CLASSES[4];
    out.set(c.color, i * 4);
  }
  return out;
}

const ASPECT_LUT = (() => {
  const lut = new Uint8ClampedArray(360 * 4);
  for (let d = 0; d < 360; d++) {lut.set(aspectColor(d), d * 4);}
  return lut;
})();

/** RGBA of an aspect tile. */
export function aspectRgba(aspectDeg: Float32Array, slopeDeg: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(aspectDeg.length * 4);
  for (let i = 0; i < aspectDeg.length; i++) {
    const a = aspectDeg[i];
    if (a < 0 || slopeDeg[i] < ASPECT_FLAT_DEG) {continue;}
    const j = (Math.round(a) % 360) * 4;
    out[i * 4] = ASPECT_LUT[j];
    out[i * 4 + 1] = ASPECT_LUT[j + 1];
    out[i * 4 + 2] = ASPECT_LUT[j + 2];
    out[i * 4 + 3] = ASPECT_LUT[j + 3];
  }
  return out;
}

/**
 * Heights for tile (z, x, y) at `size` px with a one-pixel border:
 * (size+2)^2, row-major. Null when the whole 3x3 block has no data.
 */
export async function borderedHeights(src: HeightSource, z: number, x: number, y: number, size = 256): Promise<Float32Array | null> {
  const sz = Math.min(z, src.maxZoom);
  const dz = z - sz;
  const n = 2 ** sz;
  const px = Math.floor(x / 2 ** dz);
  const py = Math.floor(y / 2 ** dz);
  const blocks = await Promise.all(
    [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => (py + dy < 0 || py + dy >= n ? Promise.resolve(null) : src.tileHeights(sz, px + dx, py + dy)))),
  );
  const centre = blocks[4];
  if (!centre) {
    return blocks.some(Boolean) ? new Float32Array((size + 2) ** 2) : null;
  }
  const S = Math.round(Math.sqrt(centre.length));
  const M = 3 * S;
  // Mosaic of the 3x3 block; missing neighbours repeat the centre's edge.
  const mosaic = new Float32Array(M * M);
  for (let by = 0; by < 3; by++) {
    for (let bx = 0; bx < 3; bx++) {
      const t = blocks[by * 3 + bx];
      for (let r = 0; r < S; r++) {
        const row = (by * S + r) * M + bx * S;
        if (t && t.length === S * S) {
          mosaic.set(t.subarray(r * S, r * S + S), row);
        } else {
          const cr = by === 0 ? 0 : by === 2 ? S - 1 : r;
          for (let c = 0; c < S; c++) {
            const cc = bx === 0 ? 0 : bx === 2 ? S - 1 : c;
            mosaic[row + c] = centre[cr * S + cc];
          }
        }
      }
    }
  }
  const W = size + 2;
  const out = new Float32Array(W * W);
  const scale = S / (size * 2 ** dz); // source px per output px
  // Output tile origin in mosaic pixels.
  const ox = (x - px * 2 ** dz) * size * scale + S;
  const oy = (y - py * 2 ** dz) * size * scale + S;
  if (scale === 1) {
    for (let r = 0; r < W; r++) {
      const sr = Math.max(0, Math.min(M - 1, oy + r - 1));
      for (let c = 0; c < W; c++) {out[r * W + c] = mosaic[sr * M + Math.max(0, Math.min(M - 1, ox + c - 1))];}
    }
    return out;
  }
  const clampM = (v: number) => Math.max(0, Math.min(M - 1, v));
  for (let r = 0; r < W; r++) {
    const gy = oy + (r - 1 + 0.5) * scale - 0.5;
    const y0 = Math.floor(gy);
    const ty = gy - y0;
    const ya = clampM(y0) * M;
    const yb = clampM(y0 + 1) * M;
    for (let c = 0; c < W; c++) {
      const gx = ox + (c - 1 + 0.5) * scale - 0.5;
      const x0 = Math.floor(gx);
      const tx = gx - x0;
      const xa = clampM(x0);
      const xb = clampM(x0 + 1);
      out[r * W + c] = (mosaic[ya + xa] * (1 - tx) + mosaic[ya + xb] * tx) * (1 - ty) + (mosaic[yb + xa] * (1 - tx) + mosaic[yb + xb] * tx) * ty;
    }
  }
  return out;
}

/** RGBA pixels of a derived tile, or null where it is fully transparent. */
export async function derivedTileRgba(src: HeightSource, kind: DerivedKind, z: number, x: number, y: number, size = 256): Promise<Uint8ClampedArray | null> {
  const heights = await borderedHeights(src, z, x, y, size);
  if (!heights) {return null;}
  const { slopeDeg, aspectDeg } = slopeAspect(heights, size, z, y);
  const rgba = kind === "slope" ? slopeRgba(slopeDeg) : aspectRgba(aspectDeg, slopeDeg);
  if (kind === "aspect") {
    let any = false;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i]) {
        any = true;
        break;
      }
    }
    if (!any) {return null;}
  }
  return rgba;
}

export interface DerivedSourceOptions {
  minzoom?: number;
  /** Zoom levels computed above the pyramid's maxZoom (bilinear overzoom). Default 2. */
  overzoom?: number;
  bounds?: [number, number, number, number];
  attribution?: string;
}

export function derivedTileUrl(kind: DerivedKind, terrainId: string): string {
  return `decho-${kind}://${encodeURIComponent(terrainId)}/{z}/{x}/{y}`;
}

export function derivedSource(kind: DerivedKind, terrainId: string, maxZoom: number, opts: DerivedSourceOptions = {}): SourceSpecification {
  return {
    type: "raster",
    tiles: [derivedTileUrl(kind, terrainId)],
    tileSize: 256,
    minzoom: opts.minzoom ?? 0,
    maxzoom: Math.min(22, maxZoom + (opts.overzoom ?? 2)),
    ...(opts.bounds ? { bounds: opts.bounds } : {}),
    ...(opts.attribution ? { attribution: opts.attribution } : {}),
  };
}

export const slopeSource = (terrainId: string, maxZoom: number, opts?: DerivedSourceOptions) => derivedSource("slope", terrainId, maxZoom, opts);
export const aspectSource = (terrainId: string, maxZoom: number, opts?: DerivedSourceOptions) => derivedSource("aspect", terrainId, maxZoom, opts);

const URL_RE = /^decho-(slope|aspect):\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/;

export function parseDerivedUrl(url: string): { kind: DerivedKind; terrainId: string; z: number; x: number; y: number } | null {
  const m = URL_RE.exec(url);
  if (!m) {return null;}
  return { kind: m[1] as DerivedKind, terrainId: decodeURIComponent(m[2]), z: Number(m[3]), x: Number(m[4]), y: Number(m[5]) };
}
