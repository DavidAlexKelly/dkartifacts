/**
 * Fast height access over a Terrarium raster-dem pyramid.
 *
 *   height = R * 256 + G + B / 256 - 32768
 *
 * Tiles come from `Library.tile(id, z, x, y)` as encoded PNG/WebP bytes, or
 * null where the pyramid has nothing, which reads as sea level (0 m). Decoded
 * tiles are kept in an LRU (default 128 tiles, ~32 MB at 256 px).
 *
 * Point queries are bilinear between pixel centres at the pyramid's deepest
 * zoom, across tile edges. `heightsAlong` is the bulk path: it works out every
 * tile its points touch, loads them all in parallel, then samples
 * synchronously, so a viewshed's ~100k samples cost one round of tile loads.
 *
 * The decoder is injectable so tests (and workers) need no image decoding.
 */

/** What this module needs of the Library; `Library` satisfies it. */
export interface TerrainLibrary {
  tile(id: string, z: number, x: number, y: number): Promise<ArrayBuffer | null>;
  manifest(id: string): Promise<unknown>;
  resolver(id: string): { minZoom?: number; maxZoom: number } | undefined;
}

/** Decoded image pixels, RGBA row-major. */
export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type ImageDecoder = (bytes: ArrayBuffer) => Promise<DecodedImage>;

export interface HeightSourceOptions {
  decode?: ImageDecoder;
  /** Decoded tiles to keep. Default 128. */
  cacheSize?: number;
  /** Override the pyramid's deepest zoom (e.g. to read coarser data faster). */
  maxZoom?: number;
}

export interface HeightSource {
  readonly terrainId: string;
  /** Deepest zoom of the pyramid; point queries read this level. */
  readonly maxZoom: number;
  /** Pixel width of the pyramid's tiles (learnt from the first decoded tile; 256 until then). */
  readonly tileSize: number;
  /** Heights of one tile, row-major (tileSize^2), or null where the pyramid has no tile. */
  tileHeights(z: number, x: number, y: number): Promise<Float32Array | null>;
  /** Bilinear height at maxZoom. Missing tiles read as 0; null only for non-finite input. */
  heightAt(lon: number, lat: number): Promise<number | null>;
  /** Heights at many points, loading each tile they touch once. */
  heightsAlong(points: ReadonlyArray<readonly [number, number]>): Promise<(number | null)[]>;
  /** Ground size of one maxZoom pixel at a latitude, in metres. */
  pixelSizeM(lat: number): number;
}

export const EARTH_CIRCUMFERENCE_M = 40075016.686;
const MAX_LAT = 85.0511287798;

/** Decode Terrarium RGBA to metres. */
export function terrariumToHeights(img: DecodedImage): Float32Array {
  const { data } = img;
  const out = new Float32Array(img.width * img.height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = data[p] * 256 + data[p + 1] + data[p + 2] / 256 - 32768;
  }
  return out;
}

/** Encode metres as Terrarium RGBA (for tests and synthetic tiles). */
export function heightsToTerrarium(heights: ArrayLike<number>, width: number, height: number): DecodedImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = Math.max(0, Math.min(65535.996, heights[i] + 32768));
    const r = Math.floor(v / 256);
    const g = Math.floor(v - r * 256);
    const b = Math.round((v - r * 256 - g) * 256);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = Math.min(255, b);
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** The browser decoder: no premultiplication or colour conversion, which would corrupt heights. */
export const browserDecode: ImageDecoder = async (bytes) => {
  const bitmap = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const { width, height } = bitmap;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== "undefined") {
    ctx = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!ctx) {throw new Error("no 2D canvas to decode terrain tiles");}
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
};

/** Fractional tile coordinates of a point at zoom z (y clamped to the mercator range). */
export function lonLatToTile(lon: number, lat: number, z: number): { fx: number; fy: number } {
  const n = 2 ** z;
  const r = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return { fx: ((lon + 180) / 360) * n, fy: ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n };
}

export async function createHeightSource(
  library: TerrainLibrary,
  terrainId: string,
  opts: HeightSourceOptions = {},
): Promise<HeightSource> {
  await library.manifest(terrainId);
  const resolver = library.resolver(terrainId);
  if (!resolver && opts.maxZoom === undefined) {throw new Error(`${terrainId} is not a tile pyramid`);}
  const maxZoom = opts.maxZoom ?? resolver!.maxZoom;
  const decode = opts.decode ?? browserDecode;
  const cacheSize = Math.max(16, opts.cacheSize ?? 128);
  const lru = new Map<string, Promise<Float32Array | null>>();
  let tileSize = 0;

  function tileHeights(z: number, x: number, y: number): Promise<Float32Array | null> {
    const n = 2 ** z;
    if (y < 0 || y >= n) {return Promise.resolve(null);}
    x = ((x % n) + n) % n;
    const key = `${z}/${x}/${y}`;
    let p = lru.get(key);
    if (p) {
      lru.delete(key);
      lru.set(key, p);
      return p;
    }
    p = (async () => {
      const bytes = await library.tile(terrainId, z, x, y);
      if (!bytes || bytes.byteLength === 0) {return null;}
      const img = await decode(bytes);
      if (!tileSize) {tileSize = img.width;}
      return terrariumToHeights(img);
    })().catch(() => null);
    lru.set(key, p);
    while (lru.size > cacheSize) {lru.delete(lru.keys().next().value as string);}
    return p;
  }

  async function heightsAlong(points: ReadonlyArray<readonly [number, number]>): Promise<(number | null)[]> {
    const z = maxZoom;
    const n = 2 ** z;
    const fxs = new Float64Array(points.length);
    const fys = new Float64Array(points.length);
    const ok = new Uint8Array(points.length);
    const tiles = new Map<number, Float32Array | null>();
    const wanted = new Set<number>();
    const tkey = (tx: number, ty: number) => (((tx % n) + n) % n) * n + Math.max(0, Math.min(n - 1, ty));

    for (let i = 0; i < points.length; i++) {
      const [lon, lat] = points[i];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {continue;}
      ok[i] = 1;
      const { fx, fy } = lonLatToTile(lon, lat, z);
      fxs[i] = fx;
      fys[i] = fy;
      wanted.add(tkey(Math.floor(fx), Math.floor(fy)));
    }
    const load = async (keys: Iterable<number>) => {
      const todo = [...keys].filter((k) => !tiles.has(k));
      const got = await Promise.all(todo.map((k) => tileHeights(z, Math.floor(k / n), k % n)));
      todo.forEach((k, i) => tiles.set(k, got[i]));
    };
    await load(wanted);
    const S = tileSize || 256;
    const W = n * S;

    // Second pass: the bilinear neighbours of points near a tile edge.
    const extra = new Set<number>();
    for (let i = 0; i < points.length; i++) {
      if (!ok[i]) {continue;}
      const gx = fxs[i] * S - 0.5;
      const gy = fys[i] * S - 0.5;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      for (const px of [x0, x0 + 1]) {
        for (const py of [y0, y0 + 1]) {
          const k = tkey(Math.floor(px / S), Math.floor(Math.max(0, Math.min(W - 1, py)) / S));
          if (!tiles.has(k)) {extra.add(k);}
        }
      }
    }
    if (extra.size) {await load(extra);}

    const pixel = (px: number, py: number): number => {
      py = Math.max(0, Math.min(W - 1, py));
      px = ((px % W) + W) % W;
      const tx = Math.floor(px / S);
      const ty = Math.floor(py / S);
      const t = tiles.get(tx * n + ty);
      if (!t) {return 0;}
      return t[(py - ty * S) * S + (px - tx * S)];
    };
    const out: (number | null)[] = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      if (!ok[i]) {
        out[i] = null;
        continue;
      }
      const gx = fxs[i] * S - 0.5;
      const gy = fys[i] * S - 0.5;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      const h00 = pixel(x0, y0);
      const h10 = pixel(x0 + 1, y0);
      const h01 = pixel(x0, y0 + 1);
      const h11 = pixel(x0 + 1, y0 + 1);
      out[i] = (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
    }
    return out;
  }

  return {
    terrainId,
    maxZoom,
    get tileSize() {
      return tileSize || 256;
    },
    tileHeights,
    heightsAlong,
    async heightAt(lon, lat) {
      return (await heightsAlong([[lon, lat]]))[0];
    },
    pixelSizeM(lat) {
      return (EARTH_CIRCUMFERENCE_M / ((tileSize || 256) * 2 ** maxZoom)) * Math.cos((Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180);
    },
  };
}
