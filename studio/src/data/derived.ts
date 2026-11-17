/**
 * Derived raster tiles, computed in the browser from a terrain pyramid and
 * served to MapLibre as custom protocols:
 *
 *   decho-slope://{terrainId}/{z}/{x}/{y}    slope classes (PNG RGBA)
 *   decho-aspect://{terrainId}/{z}/{x}/{y}   aspect as a hue wheel; flat is transparent
 *
 * Use `slopeSource(terrainId, maxZoom)` / `aspectSource(...)` for the style's
 * raster source, and SLOPE_CLASSES / ASPECT_LEGEND for the legend. The pure
 * tile maths lives in src/analysis/derivedtiles.ts.
 *
 * Registered once; `getLibrary` is called per tile, so the Library behind the
 * protocols can be swapped. Height sources (and their decoded-tile LRUs) are
 * kept per Library and terrain id.
 */
import maplibregl from "maplibre-gl";
import { createHeightSource, type HeightSource } from "../analysis/heightgrid";
import { derivedTileRgba, parseDerivedUrl } from "../analysis/derivedtiles";
import type { Library } from "./library";

export {
  ASPECT_FLAT_LEGEND,
  ASPECT_LEGEND,
  SLOPE_CLASSES,
  aspectSource,
  derivedSource,
  derivedTileUrl,
  slopeSource,
  type AspectLegendEntry,
  type DerivedKind,
  type DerivedSourceOptions,
  type SlopeClass,
} from "../analysis/derivedtiles";

const TILE = 256;
let registered = false;
const sources = new WeakMap<Library, Map<string, Promise<HeightSource>>>();

function heightSource(lib: Library, terrainId: string): Promise<HeightSource> {
  let byId = sources.get(lib);
  if (!byId) {sources.set(lib, (byId = new Map()));}
  let p = byId.get(terrainId);
  if (!p) {
    p = createHeightSource(lib, terrainId, { cacheSize: 192 });
    byId.set(terrainId, p);
    p.catch(() => byId!.delete(terrainId));
  }
  return p;
}

async function encodePng(rgba: Uint8ClampedArray | null, size: number): Promise<ArrayBuffer> {
  const pixels = new ImageData(size, size);
  if (rgba) {pixels.data.set(rgba);}
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size, size);
    canvas.getContext("2d")?.putImageData(pixels, 0, 0);
    return (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")?.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? blob.arrayBuffer() : new ArrayBuffer(0);
}

let blank: Promise<ArrayBuffer> | null = null;

export function registerDerivedProtocols(getLibrary: () => Library | null): void {
  if (registered) {return;}
  registered = true;
  const handler = async (params: { url: string }) => {
    const t = parseDerivedUrl(params.url);
    const lib = getLibrary();
    if (!t || !lib) {throw new Error(`bad derived tile url ${params.url}`);}
    const src = await heightSource(lib, t.terrainId);
    const rgba = await derivedTileRgba(src, t.kind, t.z, t.x, t.y, TILE);
    if (!rgba) {return { data: await (blank ??= encodePng(null, TILE)) };}
    return { data: await encodePng(rgba, TILE) };
  };
  maplibregl.addProtocol("decho-slope", handler);
  maplibregl.addProtocol("decho-aspect", handler);
}
