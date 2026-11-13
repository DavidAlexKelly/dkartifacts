/**
 * The decho-layer/1 manifest (see terrain-gen/PLAN.md) and the resolver that
 * finds the archive holding a tile.
 *
 * The resolver is a port of decho-basemap's manifestResolver: same grid
 * origin, same north-west-corner rule, same zero-padding, so a tile is looked
 * for in exactly the archive terrain-gen put it in.
 */

export const SCHEMA = "decho-layer/1";

export type LayerKind = "raster-dem" | "raster" | "vector-tiles" | "dem-cells" | "assets" | "catalog";

export interface FileRef {
  bytes?: number;
  sha256?: string;
}

export interface PyramidCell extends FileRef {
  col: number;
  row: number;
}

export interface SingleLayer extends FileRef {
  id: string;
  type: "single";
  minZoom: number;
  maxZoom: number;
  path: string;
}

export interface GridLayer {
  id: string;
  type: "grid";
  minZoom: number;
  maxZoom: number;
  cellDeg: number;
  pathTemplate: string;
  cells?: Array<PyramidCell | [number, number]>;
}

export interface DemCell extends FileRef {
  col: number;
  row: number;
  min?: number;
  max?: number;
  bounds?: { west: number; south: number; east: number; north: number };
}

export interface LayerManifest {
  schema: string;
  id: string;
  kind: LayerKind;
  title: string;
  attribution?: string;
  bounds?: [number, number, number, number] | null;
  encoding?: Record<string, unknown>;
  provenance?: { source?: string; generator?: string; generatedAt?: string; parameters?: Record<string, unknown> };
  // pyramids
  gridOrigin?: { lon: number; lat: number };
  layers?: Array<SingleLayer | GridLayer>;
  // dem-cells
  cellDeg?: number;
  pathTemplate?: string;
  cells?: DemCell[];
  dem?: { source?: string; verticalDatum?: string; nodata?: number };
  // assets
  fontsPrefix?: string;
  sprites?: string[];
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export function parseManifest(raw: unknown, where: string): LayerManifest {
  if (typeof raw !== "object" || raw === null) {throw new ManifestError(`${where}: manifest is not a JSON object`);}
  const m = raw as LayerManifest;
  if (m.schema !== SCHEMA) {
    throw new ManifestError(`${where}: schema is ${String(m.schema)}, expected ${SCHEMA}. Rebuild it with terrain-gen.`);
  }
  if (!m.id || !m.kind) {throw new ManifestError(`${where}: manifest has no id or kind`);}
  if (["raster-dem", "raster", "vector-tiles"].includes(m.kind)) {
    if (!m.gridOrigin || !Array.isArray(m.layers) || m.layers.length === 0) {
      throw new ManifestError(`${where}: a ${m.kind} manifest needs gridOrigin and layers`);
    }
  }
  return m;
}

export function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** Web-mercator tile (z,x,y) north-west corner — operation order as in stores.ts. */
export function tileNorthWest(z: number, x: number, y: number): { lon: number; lat: number } {
  const n = 2 ** z;
  return {
    lon: (x / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  };
}

export interface ResolvedArchive extends FileRef {
  path: string;
}

export interface PyramidResolver {
  minZoom: number;
  maxZoom: number;
  pathForTile(z: number, x: number, y: number): ResolvedArchive | null;
}

export function pyramidResolver(m: LayerManifest): PyramidResolver {
  const layers = m.layers ?? [];
  const origin = m.gridOrigin ?? { lon: -180, lat: 85 };
  const byZoom = new Map<number, SingleLayer | GridLayer | null>();
  const cellIndex = new Map<GridLayer, Map<string, FileRef> | null>();

  const cellsOf = (layer: GridLayer) => {
    let index = cellIndex.get(layer);
    if (index === undefined) {
      index = layer.cells
        ? new Map(
            layer.cells.map((c) =>
              Array.isArray(c) ? [`${c[0]},${c[1]}`, {}] : [`${c.col},${c.row}`, { bytes: c.bytes, sha256: c.sha256 }],
            ),
          )
        : null;
      cellIndex.set(layer, index);
    }
    return index;
  };

  const layerFor = (z: number) => {
    let found = byZoom.get(z);
    if (found === undefined) {
      found = layers.find((l) => z >= l.minZoom && z <= l.maxZoom) ?? null;
      byZoom.set(z, found);
    }
    return found;
  };

  return {
    minZoom: Math.min(...layers.map((l) => l.minZoom)),
    maxZoom: Math.max(...layers.map((l) => l.maxZoom)),
    pathForTile(z, x, y) {
      const layer = layerFor(z);
      if (!layer) {return null;}
      if (layer.type === "single") {return { path: layer.path, bytes: layer.bytes, sha256: layer.sha256 };}
      const nw = tileNorthWest(z, x, y);
      const col = Math.floor((nw.lon - origin.lon) / layer.cellDeg);
      const row = Math.floor((origin.lat - nw.lat) / layer.cellDeg);
      const cells = cellsOf(layer);
      const ref = cells ? cells.get(`${col},${row}`) : {};
      if (!ref) {return null;}
      return {
        path: layer.pathTemplate.replace("{col}", pad3(col)).replace("{row}", pad3(row)),
        ...ref,
      };
    },
  };
}

/** Every file a manifest lists, for size totals and prefetch. */
export function manifestFiles(m: LayerManifest): ResolvedArchive[] {
  const out: ResolvedArchive[] = [];
  for (const l of m.layers ?? []) {
    if (l.type === "single") {
      out.push({ path: l.path, bytes: l.bytes, sha256: l.sha256 });
    } else {
      for (const c of l.cells ?? []) {
        if (Array.isArray(c)) {continue;}
        out.push({
          path: l.pathTemplate.replace("{col}", pad3(c.col)).replace("{row}", pad3(c.row)),
          bytes: c.bytes,
          sha256: c.sha256,
        });
      }
    }
  }
  for (const c of m.cells ?? []) {
    const key = `c${pad3(c.col)}_r${pad3(c.row)}`;
    out.push({ path: (m.pathTemplate ?? "{cell}.tif").replace("{cell}", key), bytes: c.bytes, sha256: c.sha256 });
  }
  return out;
}
