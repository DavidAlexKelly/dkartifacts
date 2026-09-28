// layers/tacticLayers.ts — tactical graphics as MAP LAYERS, so they are in the
// world rather than on the glass.
//
// THE SYMPTOM THIS FIXES
// ---------------------
// "They move and resize when I rotate the camera." That is the SVG overlay
// working as designed: it fits every symbol in SCREEN pixels and redraws on
// every camera event, so a graphic is a picture over the map rather than a
// thing on the ground. Pitch or rotate and it slides, because it was never
// anywhere.
//
// A GeoJSON `line` or `fill` layer is somewhere. MapLibre's RenderToTexture
// pass draws vector layers into a texture and drapes it over the terrain mesh,
// so the geometry follows the ground along its whole length — over a ridge and
// down into the valley, sampling the DEM continuously rather than interpolating
// between two endpoint heights. It also foreshortens with pitch and is hidden
// by terrain in front of it, both for free, because it is being drawn as part
// of the world.
//
// WHY THERE IS NO Z COORDINATE
// ----------------------------
// Because MapLibre ignores one. 5.24 has no `line-z-offset`, no
// `elevationReference`, and nothing reads `coordinates[2]`; draping derives the
// height itself. Baking a height at each anchor would be worse than useless: an
// axis of advance three kilometres long crosses a valley, and two endpoint
// heights would float its middle above the valley floor. Height belongs to the
// terrain, not to the order.
//
// WHAT THIS DOES NOT DO
// ---------------------
// Draw text. A `symbol` layer needs a glyph stack, and which one exists is the
// host's business — @acc/decho-basemap serves Noto out of a Foundry dataset,
// another host may serve none. Pass `textFont` to turn labels on; without it a
// symbol's label is the one thing that stays on the overlay.

import { ordersToGeoJSON, type GeoFeatureCollection } from "../geojson";
import { emptyFeatureCollection } from "../geojson";
import type { SymbolCatalog } from "../engine/catalog";
import type { Pt } from "../engine/geometry";
import type { PlacedOrder, WorldCoord } from "../maplibre/types";

// Layer and source specifications below are `any` because naming them would
// mean importing maplibre-gl, and this module deliberately does not: it types
// the map structurally so a host hands it the real thing without this package
// depending on it. MapLibre validates the specs it is given at addLayer time.
// (No eslint-disable needed — the repo already scopes that rule off for this
// package's `any` substrate, and an unused directive is itself an error here.)

/** The slice of `maplibregl.Map` this needs. Structural on purpose. */
export interface LayerHostMap {
  addSource(id: string, source: any): unknown;
  removeSource(id: string): unknown;
  getSource(id: string): any;
  addLayer(layer: any, before?: string): unknown;
  removeLayer(id: string): unknown;
  getLayer(id: string): unknown;
  project(world: WorldCoord): { x: number; y: number };
  unproject(point: [number, number]): { lng: number; lat: number };
  getZoom(): number;
}

export interface TacticLayersOptions {
  /** Prefix for the source and layer ids. */
  id?: string;
  /** Insert the layers before this one — usually the first label layer. */
  before?: string;
  /** Flattening tolerance, in the symbol's own pixel-ish units. */
  tolerance?: number;
  /** Line width in pixels. Screen-space, like every MapLibre line. */
  lineWidth?: number;
  /** Dash pattern for the symbols that ask for one. */
  dashArray?: number[];
  fillOpacity?: number;
  /**
   * Glyph stack for label layers, e.g. ["Noto Sans Regular"]. Omit for no
   * labels — see the header.
   */
  textFont?: string[];
  textSize?: number;
  /** Fallback when a symbol carries no colour. */
  defaultColour?: string;
}

export interface TacticLayersHandle {
  /** Replace the drawn orders. */
  update(orders: readonly PlacedOrder[]): void;
  readonly sourceId: string;
  readonly layerIds: readonly string[];
  destroy(): void;
}

export function createTacticLayers(
  catalog: SymbolCatalog,
  map: LayerHostMap,
  options: TacticLayersOptions = {},
): TacticLayersHandle {
  const id = options.id ?? "tactic";
  const sourceId = `${id}-source`;
  const colour: any = [
    "coalesce",
    ["get", "colour"],
    options.defaultColour ?? "#4a7c59",
  ];

  const layers: any[] = [
    {
      id: `${id}-fill`,
      type: "fill",
      source: sourceId,
      filter: ["==", ["get", "kind"], "fill"],
      paint: {
        "fill-color": colour,
        "fill-opacity": options.fillOpacity ?? 0.25,
      },
    },
    {
      id: `${id}-line`,
      type: "line",
      source: sourceId,
      // Two line layers rather than one with a data-driven dash: MapLibre's
      // `line-dasharray` cannot be data-driven, so a dashed and a solid symbol
      // in the same layer would both take whichever the layer declares.
      filter: [
        "all",
        ["==", ["get", "kind"], "stroke"],
        ["!=", ["get", "dashed"], true],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": colour, "line-width": options.lineWidth ?? 2.2 },
    },
    {
      id: `${id}-line-dashed`,
      type: "line",
      source: sourceId,
      filter: [
        "all",
        ["==", ["get", "kind"], "stroke"],
        ["==", ["get", "dashed"], true],
      ],
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": colour,
        "line-width": options.lineWidth ?? 2.2,
        "line-dasharray": options.dashArray ?? [3, 2],
      },
    },
  ];

  if (options.textFont) {
    layers.push({
      id: `${id}-text`,
      type: "symbol",
      source: sourceId,
      filter: ["==", ["get", "kind"], "text"],
      layout: {
        "text-field": ["get", "text"],
        "text-font": options.textFont,
        "text-size": options.textSize ?? 12,
        "text-rotate": ["coalesce", ["get", "rotate"], 0],
        "text-allow-overlap": true,
      },
      paint: { "text-color": colour },
    });
  }

  map.addSource(sourceId, {
    type: "geojson",
    data: emptyFeatureCollection(),
  });
  for (const layer of layers) {
    map.addLayer(layer, options.before);
  }

  const setData = (data: GeoFeatureCollection) => {
    const source = map.getSource(sourceId);
    // The source is gone if the style was replaced under us, or if destroy()
    // has already run and an update is arriving late from a React effect.
    if (source?.setData) {source.setData(data);}
  };

  return {
    sourceId,
    layerIds: layers.map((layer) => layer.id as string),

    update(orders) {
      // Called only when the ORDERS change, never on a camera event — that is
      // the whole point. The geometry is geographic and zoom-invariant (see
      // geojson/order.test.ts), so once converted it is simply where it is.
      setData(
        ordersToGeoJSON(catalog, orders, {
          project: (world) => map.project(world),
          unproject: (pt: Pt) => {
            const ll = map.unproject([pt.x, pt.y]);
            return [ll.lng, ll.lat] as WorldCoord;
          },
          zoom: map.getZoom(),
        }, { tolerance: options.tolerance }),
      );
    },

    destroy() {
      for (const layer of layers) {
        if (map.getLayer(layer.id)) {map.removeLayer(layer.id);}
      }
      if (map.getSource(sourceId)) {map.removeSource(sourceId);}
    },
  };
}
