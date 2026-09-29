/**
 * Drawing a route on a map this package does not own.
 *
 * WHY MAPLIBRE IS NOT IMPORTED
 * ----------------------------
 * Every other extension in this estate attaches to a map it was handed, and so
 * does this one — but it goes one step further and does not import maplibre-gl
 * at all, typing the four methods it uses structurally instead. That keeps
 * maplibre out of the dependency graph of a package whose main job (computing a
 * path) has nothing to do with rendering, and it means a consumer drawing the
 * route themselves — in deck.gl, in a canvas overlay, in a table of waypoints —
 * pays nothing for a renderer they are not using.
 *
 * IDS ARE NAMESPACED
 * ------------------
 * Several extensions attach to one map. Every id here is prefixed
 * `decho-path-`, and the prefix is an option, so two routes (planned vs actual,
 * two units) can coexist on the same map.
 */

import type { Waypoint } from "../core/simplify.js";

/** The slice of maplibregl.Map this module uses. */
export interface MapLike {
  /**
   * `boolean | void` rather than `boolean`, because that is what MapLibre
   * declares — it returns undefined before the style object exists at all. A
   * stricter signature here would make a real maplibregl.Map fail to satisfy
   * this interface, which is the one thing it must always do.
   */
  isStyleLoaded(): boolean | void;
  once(type: string, listener: () => void): unknown;
  getSource(id: string): unknown;
  addSource(id: string, source: unknown): void;
  removeSource(id: string): void;
  getLayer(id: string): unknown;
  addLayer(layer: unknown, before?: string): void;
  removeLayer(id: string): void;
}

interface GeoJsonSourceLike {
  setData(data: unknown): void;
}

export interface RouteLayerOptions {
  /** Prefix for the source and layer ids. */
  id?: string;
  lineColor?: string;
  casingColor?: string;
  lineWidth?: number;
  casingWidth?: number;
  /** Dash pattern, in line widths. Useful for "fallback" or "planned" routes. */
  dashArray?: number[];
  /** Insert below this layer id, to keep labels on top. */
  beforeId?: string;
}

export interface RouteLayerHandle {
  /** Replace the drawn route. `null` clears it. */
  setRoute(waypoints: readonly Waypoint[] | null): void;
  /** Remove the layers and source. Safe to call twice. */
  remove(): void;
}

const DEFAULTS = {
  id: "decho-path",
  lineColor: "#38bdf8",
  casingColor: "#0f172a",
  lineWidth: 3,
  casingWidth: 6,
};

function featureFor(waypoints: readonly Waypoint[] | null) {
  return {
    type: "FeatureCollection",
    features:
      waypoints && waypoints.length >= 2
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                // Waypoints are [lat, lon] to match OrderRoute; GeoJSON is
                // [lon, lat]. This transposition is the single most common bug
                // in map code, so it happens in exactly one place.
                coordinates: waypoints.map(([lat, lon]) => [lon, lat]),
              },
            },
          ]
        : [],
  };
}

/**
 * Add an empty route source and its two layers, and return a handle to feed.
 *
 * Idempotent: called twice with the same id, the second call adopts the
 * existing source rather than throwing, which is what React StrictMode's
 * double-mount does in development.
 */
export function attachRouteLayer(
  map: MapLike,
  options: RouteLayerOptions = {},
): RouteLayerHandle {
  const id = options.id ?? DEFAULTS.id;
  const sourceId = `${id}-source`;
  const casingId = `${id}-casing`;
  const lineId = `${id}-line`;

  let removed = false;
  let queued: readonly Waypoint[] | null = null;
  let attached = false;

  const attach = () => {
    if (removed || attached) {return;}
    attached = true;

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: featureFor(queued) });
    }

    if (!map.getLayer(casingId)) {
      map.addLayer(
        {
          id: casingId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": options.casingColor ?? DEFAULTS.casingColor,
            "line-width": options.casingWidth ?? DEFAULTS.casingWidth,
            "line-opacity": 0.7,
          },
        },
        options.beforeId,
      );
    }

    if (!map.getLayer(lineId)) {
      map.addLayer(
        {
          id: lineId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": options.lineColor ?? DEFAULTS.lineColor,
            "line-width": options.lineWidth ?? DEFAULTS.lineWidth,
            ...(options.dashArray ? { "line-dasharray": options.dashArray } : {}),
          },
        },
        options.beforeId,
      );
    }

    if (queued) {setData(queued);}
  };

  const setData = (waypoints: readonly Waypoint[] | null) => {
    const source = map.getSource(sourceId) as GeoJsonSourceLike | undefined;
    source?.setData(featureFor(waypoints));
  };

  // Adding a source before the style exists throws. A map handed over by
  // useBasemap is usually ready, but one constructed a moment ago is not, and
  // the difference is a race the caller should not have to think about.
  if (map.isStyleLoaded()) {
    attach();
  } else {
    map.once("load", attach);
  }

  return {
    setRoute(waypoints) {
      queued = waypoints;
      if (attached) {setData(waypoints);}
    },

    remove() {
      if (removed) {return;}
      removed = true;
      queued = null;
      // Order matters: a source with layers still referencing it cannot be
      // removed. Each guarded, because a style change may have taken them
      // already.
      try {
        if (map.getLayer(lineId)) {map.removeLayer(lineId);}
        if (map.getLayer(casingId)) {map.removeLayer(casingId);}
        if (map.getSource(sourceId)) {map.removeSource(sourceId);}
      } catch {
        /* style already torn down */
      }
    },
  };
}
