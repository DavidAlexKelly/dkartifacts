/**
 * Heights from the terrain pyramid: the cursor readout, identify, and
 * elevation profiles. Tiles are read at the pyramid's deepest zoom and decoded
 * from Terrarium:  height = R * 256 + G + B / 256 - 32768.
 */
import type { Library } from "./library";

const decoded = new Map<string, Promise<Float32Array | null>>();
const MAX_TILES = 96;

async function decodeTile(lib: Library, id: string, z: number, x: number, y: number): Promise<Float32Array | null> {
  const buf = await lib.tile(id, z, x, y);
  if (!buf) {return null;}
  const bitmap = await createImageBitmap(new Blob([buf]));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {return null;}
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const out = new Float32Array(bitmap.width * bitmap.height);
  for (let i = 0; i < out.length; i++) {
    out[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768;
  }
  return out;
}

function tileFor(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const fy = ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n;
  return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
}

/** Height in metres at a point, or null where the terrain layer has nothing. */
export async function elevationAt(lib: Library, terrainId: string, lon: number, lat: number): Promise<number | null> {
  await lib.manifest(terrainId);
  const resolver = lib.resolver(terrainId);
  if (!resolver) {return null;}
  const z = resolver.maxZoom;
  const { x, y, fx, fy } = tileFor(lon, lat, z);
  const key = `${terrainId}/${z}/${x}/${y}`;
  let tile = decoded.get(key);
  if (!tile) {
    tile = decodeTile(lib, terrainId, z, x, y).catch(() => null);
    decoded.set(key, tile);
    if (decoded.size > MAX_TILES) {decoded.delete(decoded.keys().next().value as string);}
  }
  const heights = await tile;
  if (!heights) {return null;}
  const size = Math.round(Math.sqrt(heights.length));
  const px = Math.min(size - 1, Math.floor((fx - x) * size));
  const py = Math.min(size - 1, Math.floor((fy - y) * size));
  return heights[py * size + px];
}

export interface ProfilePoint {
  distance: number; // metres from the start
  lon: number;
  lat: number;
  elevation: number | null;
}

export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Sample a line at `samples` evenly spaced points. */
export async function profile(
  lib: Library,
  terrainId: string,
  line: Array<[number, number]>,
  samples = 200,
): Promise<ProfilePoint[]> {
  const legs = line.slice(1).map((p, i) => haversine(line[i], p));
  const total = legs.reduce((a, b) => a + b, 0);
  const points: ProfilePoint[] = [];
  for (let i = 0; i < samples; i++) {
    let d = (total * i) / (samples - 1);
    let leg = 0;
    while (leg < legs.length - 1 && d > legs[leg]) {
      d -= legs[leg];
      leg++;
    }
    const t = legs[leg] === 0 ? 0 : Math.min(1, d / legs[leg]);
    const lon = line[leg][0] + (line[leg + 1][0] - line[leg][0]) * t;
    const lat = line[leg][1] + (line[leg + 1][1] - line[leg][1]) * t;
    points.push({ distance: (total * i) / (samples - 1), lon, lat, elevation: await elevationAt(lib, terrainId, lon, lat) });
  }
  return points;
}
