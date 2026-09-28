// @acc/app6d/geojson — drawn parts as geography, so a symbol can be a MAP
// LAYER rather than an overlay.
//
// WHY: WHAT AN OVERLAY CANNOT DO
// ------------------------------
// TacticOverlay draws symbols as SVG over the canvas. Their positions are
// correct even with 3D terrain — MapLibre's `project` accounts for it — but an
// SVG is always parallel to the screen, so:
//
//   - a symbol cannot foreshorten. Pitch the camera and an axis of advance
//     that should lie along the valley floor stays face-on, pasted to the
//     glass;
//   - a symbol cannot be occluded. A boundary behind a ridge draws over the
//     mountain in front of it.
//
// Neither is a bug in the overlay and neither is fixable inside it. A shape
// that lies on the ground has to be given to the renderer as ground: GeoJSON in
// a `line` or `fill` layer, which MapLibre drapes over the terrain mesh,
// foreshortens with the camera and hides behind the hill.
//
// This module is the conversion. It is deliberately pure and knows nothing
// about MapLibre: given parts and a way to turn a point into a longitude and
// latitude, it produces features. That makes it testable without a map, and
// usable by anything that wants a symbol's geometry — an export to a shapefile,
// a geometry column in Foundry, a server-side render.
//
// SIZING IS ALREADY SETTLED, AND NOT THE WAY IT LOOKS
// ---------------------------------------------------
// It is natural to assume an overlay symbol is screen-sized — that it keeps its
// pixel size as you zoom — and that converting to geography would change that.
// It would not, because it is not true. `milxTransformFor` scales by
// 2^(zoom - baseZoom), so a symbol grows on screen as you zoom in and therefore
// covers CONSTANT GROUND. The overlay has always been ground-fixed; it just
// achieves it by rescaling every frame.
//
// So the geographic footprint this produces is zoom-invariant, and there is no
// sizing decision for a renderer above it to make. `order.test.ts` pins that
// across three zoom levels, because geometry that shifted with zoom would be a
// nasty bug: pan out and every control measure would quietly cover different
// terrain.

import type { SymbolCatalog } from "../engine/catalog";
import { getParts } from "../engine/render";
import type { Part } from "../engine/types";
import type { Pt } from "../engine/geometry";
import {
  milxToScreen,
  milxTransformFor,
  resolveCatalogNameForSidc,
} from "../core/tacticOrders";
import type { PlacedOrder, WorldCoord } from "../maplibre/types";
import { flattenPath, type FlattenOptions } from "./flatten";

export { flattenPath, type FlattenOptions } from "./flatten";

/**
 * Minimal GeoJSON, declared here rather than imported.
 *
 * Only three geometry types are ever produced, and a types-only dependency on
 * `geojson` would be the first dependency this package has had. These are
 * structurally what MapLibre's `setData` and every GeoJSON consumer expect.
 */
export type Position = [number, number];

export interface GeoFeature<G = GeoGeometry> {
  type: "Feature";
  geometry: G;
  properties: Record<string, unknown>;
}

export type GeoGeometry =
  | { type: "LineString"; coordinates: Position[] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "Point"; coordinates: Position };

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

/** Turns a point in the parts' own coordinate space into a lng/lat pair. */
export type ToLngLat = (pt: Pt) => Position;

export interface PartsToGeoJsonOptions extends FlattenOptions {
  /**
   * Merged onto every feature's properties — an order id, a colour, a label.
   *
   * Styling a layer is done with data-driven expressions over these rather
   * than with one layer per symbol: a hundred orders should be two layers, not
   * two hundred.
   */
  properties?: Record<string, unknown>;
}

/**
 * Convert drawn parts to features.
 *
 *   stroke -> LineString per subpath, `dashed` carried in properties
 *   fill   -> Polygon per closed subpath
 *   text   -> Point, with the string, size and rotation in properties
 *
 * A stroke's closed subpaths stay LineStrings: a stroked ring is an outline,
 * and turning it into a Polygon would have a `fill` layer paint its interior.
 */
export function partsToGeoJSON(
  parts: readonly Part[],
  toLngLat: ToLngLat,
  options: PartsToGeoJsonOptions = {},
): GeoFeatureCollection {
  const base = options.properties ?? {};
  const features: GeoFeature[] = [];

  for (const part of parts) {
    if (part.kind === "text") {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: toLngLat(part.pos) },
        properties: {
          ...base,
          kind: "text",
          text: part.text,
          size: part.size,
          rotate: part.rotate,
        },
      });
      continue;
    }

    for (const sub of flattenPath(part.d, options)) {
      // A single point cannot be a line or a ring. It happens: a degenerate
      // param set, a zero-length gap, a symbol scaled to nothing.
      if (sub.points.length < 2) {continue;}
      const coordinates = sub.points.map(toLngLat);

      if (part.kind === "fill") {
        // A GeoJSON ring must be explicitly closed even when the path was
        // closed implicitly by Z.
        const ring = [...coordinates];
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {ring.push(first);}
        if (ring.length < 4) {continue;}
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [ring] },
          properties: { ...base, kind: "fill" },
        });
        continue;
      }

      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { ...base, kind: "stroke", dashed: part.dashed },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

// ── A placed order, as geography ────────────────────────────────────────────

export interface OrderToGeoJsonContext {
  /** World coordinate to the space parts are generated in. `map.project`. */
  project: (world: WorldCoord) => Pt;
  /** The inverse. `map.unproject`. */
  unproject: (pt: Pt) => WorldCoord;
  /** Current zoom, which the placement transform scales by. */
  zoom: number;
}

/**
 * One placed order as features on the ground.
 *
 * WHY THIS USES THE PACKAGE'S OWN PLACEMENT TRANSFORM
 * --------------------------------------------------
 * `renderOnMap` places a symbol with an affine transform — anchor, zoom scale,
 * param origin — and this calls the same `milxTransformFor` / `milxToScreen`
 * rather than reimplementing it. Two renderers that derive the same placement
 * independently agree until someone retunes `pxPerUnit`, at which point one
 * moves and the other does not, and the symptom is a graphic that is subtly in
 * the wrong place in one view only. Sharing the transform makes that
 * impossible rather than unlikely.
 *
 * The geometry comes out in geographic coordinates, so it is FIXED TO THE
 * GROUND: it foreshortens as the camera pitches and hides behind terrain,
 * which is what the SVG overlay cannot do. It also means the symbol's size is
 * baked at the zoom it was converted at — see the sizing note in the README.
 */
export function orderToGeoJSON(
  catalog: SymbolCatalog,
  order: PlacedOrder,
  ctx: OrderToGeoJsonContext,
  options: PartsToGeoJsonOptions = {},
): GeoFeatureCollection {
  if (!order.tacticSidc) {return emptyFeatureCollection();}

  const name = resolveCatalogNameForSidc(catalog, order.tacticSidc);
  if (!name) {return emptyFeatureCollection();}

  const anchor = ctx.project(order.from);
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return emptyFeatureCollection();
  }

  const parts = getParts(
    catalog,
    name,
    order.milxParams as Parameters<typeof getParts>[2],
  );
  const transform = milxTransformFor(anchor, ctx.zoom, order.milxScale);

  const toLngLat = (pt: Pt): Position => {
    const world = ctx.unproject(milxToScreen(transform, pt));
    return [world[0], world[1]];
  };

  return partsToGeoJSON(parts, toLngLat, {
    ...options,
    properties: {
      orderId: order.id,
      colour: order.colour,
      label: order.tacticLabel,
      ...options.properties,
    },
  });
}

/**
 * Every order as one collection, for a single source.
 *
 * One source and a handful of layers styled by data-driven expressions over
 * `colour` and `dashed`, rather than a layer per order: a hundred orders should
 * not be three hundred layers.
 */
export function ordersToGeoJSON(
  catalog: SymbolCatalog,
  orders: readonly PlacedOrder[],
  ctx: OrderToGeoJsonContext,
  options: PartsToGeoJsonOptions = {},
): GeoFeatureCollection {
  return mergeFeatureCollections(
    ...orders.map((order) => orderToGeoJSON(catalog, order, ctx, options)),
  );
}

/** An empty collection, for clearing a source without a special case. */
export function emptyFeatureCollection(): GeoFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/** Merge collections into one source's data. */
export function mergeFeatureCollections(
  ...collections: readonly GeoFeatureCollection[]
): GeoFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((c) => c.features),
  };
}
