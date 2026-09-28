/**
 * What is actually in these tiles?
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * Every overlay in this package styles a source-layer of the archive — water,
 * roads, landuse, buildings — and whether an overlay is worth turning on comes
 * down to two questions no amount of reading answers: are the features there at
 * the zooms this archive serves, and do they carry the properties the style
 * filters on?
 *
 * The answer is per-archive and sometimes surprising. The Protomaps schema puts
 * `landcover` at z0–z7 ONLY, so a planet archive cut at z12 has none of it at
 * any zoom a planner uses, and a going-and-cover overlay built on it renders
 * absolutely nothing — which looks exactly like a broken style. `landuse`
 * carries the same information at all zooms and is the layer to use instead.
 * That is the sort of thing this reports in one call.
 *
 * It reads the tiles the map is already holding, so it costs nothing, and it is
 * exported because it is as useful in a console while deciding as it is in a
 * panel while demoing. `describeBuildingCoverage` in ./buildings is the same
 * idea specialised to heights, and predates this.
 */

import type { QueryableMap } from "./buildings";

export interface SourceLayerCensus {
  zoom: number;
  sourceLayer: string;
  /** Features loaded for this source-layer in the tiles currently held. */
  features: number;
  /** Counts by `kind`, descending. The field every Protomaps layer carries. */
  kinds: Record<string, number>;
  /** Counts by `kind_detail`, where present. */
  kindDetails: Record<string, number>;
  /**
   * Every property name seen, so a style can be written against what is there
   * rather than against the documentation. `is_bridge` missing from this list
   * means a choke-point overlay has nothing to filter on.
   */
  properties: string[];
}

export interface DescribeSourceLayerOptions {
  sourceId: string;
  sourceLayer: string;
  /**
   * Cap on features inspected. The census is a diagnostic, and a dense urban
   * z12 tile can hold tens of thousands of landuse polygons — counting all of
   * them to answer "is this layer populated" is a frame nobody asked for.
   */
  limit?: number;
}

const descending = (counts: Record<string, number>): Record<string, number> =>
  Object.fromEntries(
    Object.entries(counts).sort(([, a], [, b]) => b - a),
  );

export function describeSourceLayer(
  map: QueryableMap,
  options: DescribeSourceLayerOptions,
): SourceLayerCensus {
  const limit = options.limit ?? 5000;
  const features = map.querySourceFeatures(options.sourceId, {
    sourceLayer: options.sourceLayer,
  });

  const kinds: Record<string, number> = {};
  const kindDetails: Record<string, number> = {};
  const properties = new Set<string>();

  for (const feature of features.slice(0, limit)) {
    const props = feature.properties ?? {};
    for (const key of Object.keys(props)) {properties.add(key);}

    const kind = props.kind;
    if (typeof kind === "string") {kinds[kind] = (kinds[kind] ?? 0) + 1;}

    const detail = props.kind_detail;
    if (typeof detail === "string") {
      kindDetails[detail] = (kindDetails[detail] ?? 0) + 1;
    }
  }

  return {
    zoom: map.getZoom(),
    sourceLayer: options.sourceLayer,
    features: features.length,
    kinds: descending(kinds),
    kindDetails: descending(kindDetails),
    properties: [...properties].sort(),
  };
}

/** The source-layers this package's overlays read. */
export const OVERLAY_SOURCE_LAYERS = [
  "water",
  "roads",
  "landuse",
  "landcover",
  "buildings",
] as const;

/**
 * Census every layer an overlay might use, for deciding what an archive can
 * support before styling anything against it.
 */
export function describeOverlayLayers(
  map: QueryableMap,
  sourceId: string,
  options: { limit?: number } = {},
): Record<string, SourceLayerCensus> {
  return Object.fromEntries(
    OVERLAY_SOURCE_LAYERS.map((sourceLayer) => [
      sourceLayer,
      describeSourceLayer(map, { sourceId, sourceLayer, ...options }),
    ]),
  );
}
