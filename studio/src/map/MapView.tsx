import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { MapView as View } from "../project/types";

interface Props {
  style: StyleSpecification;
  initialView: View;
  onViewChange(view: View): void;
  onReady(map: MlMap | null): void;
  onError?(message: string): void;
}

/**
 * The map canvas. It owns nothing but the MapLibre instance: whatever the
 * project says is passed in as a whole style, and applied by diff.
 */
export function MapView({ style, initialView, onViewChange, onReady, onError }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const callbacks = useRef({ onViewChange, onError });
  callbacks.current = { onViewChange, onError };

  useEffect(() => {
    if (!container.current) {return;}
    const map = new maplibregl.Map({
      container: container.current,
      style,
      center: initialView.center as [number, number],
      zoom: initialView.zoom,
      bearing: initialView.bearing,
      pitch: initialView.pitch,
      maxPitch: 85,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true }, // PNG export reads the canvas
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("moveend", () => {
      const c = map.getCenter();
      callbacks.current.onViewChange({ center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
    });
    let lastError = "";
    map.on("error", (e) => {
      const message = e.error?.message ?? String(e.error ?? e);
      // Missing tiles and aborted requests are ordinary while panning.
      if (/abort/i.test(message) || message === lastError) {return;}
      lastError = message;
      callbacks.current.onError?.(message);
    });
    mapRef.current = map;
    onReady(map);
    return () => {
      onReady(null);
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; style and view changes flow in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Until the FIRST style has loaded MapLibre cannot diff against it and would
  // rebuild from scratch, so hold the newest style until then. (Not
  // isStyleLoaded(): that is also false whenever tiles are in flight, and
  // "load" fires only once — waiting on it would drop updates.)
  const latest = useRef(style);
  latest.current = style;
  const firstLoad = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {return;}
    if (firstLoad.current) {
      applyStyle(map, style);
      return;
    }
    const apply = () => {
      firstLoad.current = true;
      applyStyle(map, latest.current);
    };
    map.once("load", apply);
    return () => {
      map.off("load", apply);
    };
  }, [style]);

  return <div ref={container} className="map" data-testid="map" />;
}

/**
 * Terrain goes in through setTerrain rather than the style diff: MapLibre's
 * diff fails on a terrain change ("_checkLoaded" of undefined) and falls back
 * to rebuilding the whole style, which flashes every layer.
 */
function applyStyle(map: MlMap, style: StyleSpecification): void {
  const { terrain, ...rest } = style;
  map.setStyle(rest, { diff: true });
  const want = terrain ?? null;
  const setTerrain = () => {
    if (JSON.stringify(map.getTerrain() ?? null) === JSON.stringify(want)) {return true;}
    if (want && !map.getSource(want.source)) {return false;}
    map.setTerrain(want);
    return true;
  };
  if (!setTerrain()) {
    const retry = () => {
      if (setTerrain()) {map.off("styledata", retry);}
    };
    map.on("styledata", retry);
  }
}
