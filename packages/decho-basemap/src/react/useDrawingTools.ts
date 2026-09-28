/**
 * Drawing tools, implemented directly on MapLibre.
 *
 * WHY NOT terra-draw / mapbox-gl-draw
 * -----------------------------------
 * Both are good libraries and either would be a reasonable dependency. Neither
 * could be installed: their tarballs are not mirrored in this enrollment's npm
 * repositories, and the fallback to npmjs.com is unreachable from a Foundry
 * container (it surfaces as a confusing `E401 Incorrect or missing password`).
 *
 * A basemap package whose drawing feature cannot be installed offline would be
 * a poor trade for a package whose entire premise is working without external
 * network access, so this is written against MapLibre's own primitives: one
 * GeoJSON source, a handful of layers, and pointer handlers.
 *
 * SCOPE — READ THIS BEFORE CALLING IT "PARITY"
 * --------------------------------------------
 * Implemented: point, line, polygon, rectangle; select; delete selected;
 * delete all; undo of the in-progress shape; GeoJSON in and out.
 *
 * NOT implemented, and each is a real gap against Workshop's map widget:
 *   - dragging existing vertices to reshape a finished feature;
 *   - circle / freehand modes;
 *   - per-feature styling, labels, or icon symbols for points (points render
 *     as circles; icon placement needs a sprite-backed symbol layer and a
 *     picker, which is a feature in its own right);
 *   - persistence — nothing is written to the Ontology. Features live in
 *     component state and are handed to `onChange`; storing them is the host
 *     application's decision.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  Position,
} from "geojson";

export type DrawMode =
  | "select"
  | "point"
  | "line"
  | "polygon"
  | "rectangle";

export interface DrawingToolsState {
  mode: DrawMode;
  setMode: (mode: DrawMode) => void;
  /** Everything drawn so far. */
  features: FeatureCollection;
  /** Replace the drawing, e.g. when loading a saved one. */
  setFeatures: (features: FeatureCollection) => void;
  selectedId: string | null;
  deleteSelected: () => void;
  deleteAll: () => void;
  /** Discard the shape currently being drawn. */
  cancel: () => void;
  /** True while a multi-vertex shape is in progress. */
  drawing: boolean;
}

const SOURCE = "decho-basemap-draw";
const FILL_LAYER = `${SOURCE}-fill`;
const LINE_LAYER = `${SOURCE}-line`;
const POINT_LAYER = `${SOURCE}-point`;

const ACCENT = "#c1440e";
const SELECTED = "#0b6bcb";

let nextId = 0;
const makeId = () => `draw-${Date.now().toString(36)}-${nextId++}`;

const empty = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

/** Rectangle from two opposite corners, as a closed ring. */
function rectangle(a: Position, b: Position): Position[][] {
  return [
    [
      [a[0], a[1]],
      [b[0], a[1]],
      [b[0], b[1]],
      [a[0], b[1]],
      [a[0], a[1]],
    ],
  ];
}

export function useDrawingTools(
  map: maplibregl.Map | null,
  enabled: boolean,
  onChange?: (features: FeatureCollection) => void,
): DrawingToolsState {
  const [mode, setModeState] = useState<DrawMode>("select");
  const [features, setFeaturesState] = useState<FeatureCollection>(empty);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Position[]>([]);

  // Handlers are attached once and read live values through refs, so the
  // listeners never need re-binding (which would drop clicks mid-draw).
  const modeRef = useRef(mode);
  const pendingRef = useRef(pending);
  const featuresRef = useRef(features);
  modeRef.current = mode;
  pendingRef.current = pending;
  featuresRef.current = features;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const commit = useCallback((next: FeatureCollection) => {
    setFeaturesState(next);
    featuresRef.current = next;
    onChangeRef.current?.(next);
  }, []);

  const addFeature = useCallback(
    (geometry: Geometry) => {
      const feature: Feature = {
        type: "Feature",
        id: makeId(),
        properties: { createdAt: new Date().toISOString() },
        geometry,
      };
      commit({
        type: "FeatureCollection",
        features: [...featuresRef.current.features, feature],
      });
    },
    [commit],
  );

  // ── Layers ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!map || !enabled) {return;}

    const install = () => {
      if (map.getSource(SOURCE)) {return;}
      map.addSource(SOURCE, { type: "geojson", data: empty() });

      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": ACCENT, "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: SOURCE,
        filter: ["!=", ["geometry-type"], "Point"],
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED,
            ACCENT,
          ],
          "line-width": 2,
        },
      });
      map.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED,
            ACCENT,
          ],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
    };

    // A style reload (setStyle, flavor change) drops custom sources; re-adding
    // on styledata keeps the drawing alive across one.
    install();
    map.on("styledata", install);
    return () => {
      map.off("styledata", install);
    };
  }, [map, enabled]);

  // ── Render features + the in-progress shape ───────────────────────────────

  useEffect(() => {
    if (!map || !enabled) {return;}
    const source = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) {return;}

    const preview: Feature[] = [];
    if (pending.length > 0) {
      const m = modeRef.current;
      if (m === "polygon" && pending.length >= 3) {
        preview.push({
          type: "Feature",
          properties: { preview: true },
          geometry: { type: "Polygon", coordinates: [[...pending, pending[0]]] },
        });
      } else if (pending.length >= 2) {
        preview.push({
          type: "Feature",
          properties: { preview: true },
          geometry: { type: "LineString", coordinates: pending },
        });
      }
      preview.push({
        type: "Feature",
        properties: { preview: true },
        geometry: { type: "MultiPoint", coordinates: pending },
      });
    }

    source.setData({
      type: "FeatureCollection",
      features: [...features.features, ...preview],
    });
  }, [map, enabled, features, pending]);

  // ── Selection highlight ───────────────────────────────────────────────────

  useEffect(() => {
    if (!map || !enabled) {return;}
    for (const f of features.features) {
      if (f.id === undefined) {continue;}
      map.setFeatureState(
        { source: SOURCE, id: f.id as string },
        { selected: f.id === selectedId },
      );
    }
  }, [map, enabled, features, selectedId]);

  // ── Interaction ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!map || !enabled) {return;}

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const m = modeRef.current;
      const at: Position = [e.lngLat.lng, e.lngLat.lat];

      if (m === "select") {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [FILL_LAYER, LINE_LAYER, POINT_LAYER],
        });
        const id = hits.find((h) => h.id !== undefined)?.id;
        setSelectedId(id === undefined ? null : String(id));
        return;
      }

      if (m === "point") {
        addFeature({ type: "Point", coordinates: at });
        return;
      }

      if (m === "rectangle") {
        const start = pendingRef.current[0];
        if (!start) {
          setPending([at]);
        } else {
          addFeature({ type: "Polygon", coordinates: rectangle(start, at) });
          setPending([]);
        }
        return;
      }

      // line / polygon: accumulate vertices, finish on double-click or Enter.
      setPending((p) => [...p, at]);
    };

    const finish = () => {
      const m = modeRef.current;
      const p = pendingRef.current;
      if (m === "line" && p.length >= 2) {
        addFeature({ type: "LineString", coordinates: p });
      } else if (m === "polygon" && p.length >= 3) {
        addFeature({ type: "Polygon", coordinates: [[...p, p[0]]] });
      }
      setPending([]);
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      if (modeRef.current === "line" || modeRef.current === "polygon") {
        // Otherwise MapLibre also zooms, which is jarring at the moment you
        // finish a shape.
        e.preventDefault();
        finish();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {finish();}
      if (e.key === "Escape") {setPending([]);}
      if (e.key === "Backspace" && pendingRef.current.length > 0) {
        e.preventDefault();
        setPending((p) => p.slice(0, -1));
      }
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    window.addEventListener("keydown", onKey);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [map, enabled, addFeature]);

  // Crosshair while a drawing mode is active — the only affordance telling the
  // user the map is in a different state.
  useEffect(() => {
    if (!map || !enabled) {return;}
    const canvas = map.getCanvas();
    canvas.style.cursor = mode === "select" ? "" : "crosshair";
    return () => {
      canvas.style.cursor = "";
    };
  }, [map, enabled, mode]);

  const setMode = useCallback((next: DrawMode) => {
    setPending([]);
    setModeState(next);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) {return;}
    commit({
      type: "FeatureCollection",
      features: featuresRef.current.features.filter((f) => f.id !== selectedId),
    });
    setSelectedId(null);
  }, [commit, selectedId]);

  const deleteAll = useCallback(() => {
    commit(empty());
    setSelectedId(null);
    setPending([]);
  }, [commit]);

  return {
    mode,
    setMode,
    features,
    setFeatures: commit,
    selectedId,
    deleteSelected,
    deleteAll,
    cancel: () => setPending([]),
    drawing: pending.length > 0,
  };
}
