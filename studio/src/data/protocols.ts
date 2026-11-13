/**
 * MapLibre custom protocols over the Library, so a style can name catalog
 * data with plain URLs and MapLibre never makes a network call of its own:
 *
 *   decho://{layerId}/{z}/{x}/{y}            a tile from a pyramid layer
 *   decho-glyphs://{fontstack}/{range}.pbf   glyphs from the assets layer
 *   decho-sprite://{name}.json|.png          sprites from the assets layer
 *
 * Registered once; the Library behind them is swapped when the connection
 * changes.
 */
import maplibregl from "maplibre-gl";
import type { Library } from "./library";

let library: Library | null = null;
let assetsId: string | null = null;
let registered = false;

export function setProtocolLibrary(lib: Library | null): void {
  library = lib;
  assetsId = lib?.catalog.layers.find((l) => l.kind === "assets")?.id ?? null;
}

export function hasAssets(): boolean {
  return assetsId !== null;
}

// A tile the pyramid does not have. Vector: an empty tile. Raster: a fully
// transparent PNG. raster-dem: sea level in Terrarium (R=128, G=0, B=0),
// because raster-dem has no notion of "missing" and a hole tears the mesh.
const blanks = new Map<string, Promise<ArrayBuffer>>();

function blankPng(kind: string, size: number): Promise<ArrayBuffer> {
  const key = `${kind}/${size}`;
  let p = blanks.get(key);
  if (!p) {
    p = (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx && kind === "raster-dem") {
        ctx.fillStyle = "rgb(128,0,0)";
        ctx.fillRect(0, 0, size, size);
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      return blob ? blob.arrayBuffer() : new ArrayBuffer(0);
    })();
    blanks.set(key, p);
  }
  return p;
}

const TILE_URL = /^decho:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/;

export function registerProtocols(): void {
  if (registered) {return;}
  registered = true;

  maplibregl.addProtocol("decho", async (params) => {
    const m = TILE_URL.exec(params.url);
    if (!m || !library) {throw new Error(`bad tile url ${params.url}`);}
    const [, id, z, x, y] = m;
    const entry = library.entry(decodeURIComponent(id));
    const data = await library.tile(decodeURIComponent(id), Number(z), Number(x), Number(y));
    if (data) {return { data };}
    if (entry?.kind === "raster" || entry?.kind === "raster-dem") {
      return { data: await blankPng(entry.kind, Number(entry.encoding?.tileSize ?? 256)) };
    }
    return { data: new ArrayBuffer(0) };
  });

  maplibregl.addProtocol("decho-glyphs", async (params) => {
    if (!library || !assetsId) {throw new Error("no assets layer in the catalog");}
    const rest = params.url.slice("decho-glyphs://".length);
    const slash = rest.lastIndexOf("/");
    const stack = decodeURIComponent(rest.slice(0, slash)).split(",")[0].trim();
    const range = rest.slice(slash + 1);
    const data = await library.readFile(assetsId, `fonts/${stack}/${range}`);
    return { data: data ?? new ArrayBuffer(0) };
  });

  maplibregl.addProtocol("decho-sprite", async (params) => {
    if (!library || !assetsId) {throw new Error("no assets layer in the catalog");}
    const name = decodeURIComponent(params.url.slice("decho-sprite://".length));
    const data = await library.readFile(assetsId, `sprites/${name}`);
    if (!data) {throw new Error(`sprite ${name} not found`);}
    if (params.type === "json") {return { data: JSON.parse(new TextDecoder().decode(data)) };}
    return { data };
  });
}
