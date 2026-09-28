/**
 * useBasemap — own the container, get a fully wired MapLibre map back.
 *
 * This is the layer for applications that do a lot with the map: extra
 * sources and layers, DOM markers, drawing tools, click handling,
 * queryRenderedFeatures, custom overlays. You get the real `maplibregl.Map`
 * and the library stays out of the way.
 *
 *   const { map, status } = useBasemap(ref, { flavor: MILITARY_TOPO });
 *   useEffect(() => { if (map) initMgrsOverlay(map); }, [map]);
 *
 * <DechoBasemap/> is a thin wrapper over this hook; anything it can do, this
 * can do.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { layers as protomapsLayers, namedFlavor } from "@protomaps/basemaps";


import { createBasemap, type BasemapHandle } from "../core/basemap";
import {
  attachExtensions,
  collectStyleContributions,
  mergeExtensionStyle,
  type ExtensionContext,
  type ExtensionMap,
} from "../core/extensions";
import { whenStyleLoaded } from "../core/styleReady";
import { useDrawingTools, type DrawingToolsState } from "./useDrawingTools";
import {
  resolveAssetStore,
  resolveTileStore,
  resolveView,
  type UseBasemapOptions,
} from "./options";

export type { UseBasemapOptions };
export { resolveAssetStore, resolveTileStore, resolveView };


export interface UseBasemapResult {
  map: maplibregl.Map | null;
  globe: BasemapHandle | null;
  /** Archive currently downloading, or null when idle. */
  loading: string | null;
  error: Error | null;
  /** Present regardless of `drawingTools`; inert until it is enabled. */
  drawing: DrawingToolsState;
}


export function useBasemap(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseBasemapOptions = {},
): UseBasemapResult {
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [globe, setGlobe] = useState<BasemapHandle | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Options are read once at init. Re-creating a map on every prop change
  // would throw away the consumer's layers and markers, which is never what
  // they want — imperative updates go through the returned map instead.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {return;}

    let cancelled = false;
    let created: maplibregl.Map | null = null;
    let handle: BasemapHandle | null = null;
    let detach: (() => void) | null = null;
    let unsubscribe: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let disposeExtensions: (() => void) | null = null;

    void (async () => {
      const opts = optionsRef.current;

      try {
        const created0 = await createBasemap(maplibregl, {
          tiles: resolveTileStore(opts),
          assets: resolveAssetStore(opts),
          protocol: opts.protocol,
          sourceId: opts.sourceId,
          sourceOptions: opts.sourceOptions,
        });
        if (cancelled) {
          created0.dispose();
          return;
        }
        handle = created0;

        unsubscribe = created0.onStatus((path, status) =>
          setLoading(status === "downloading" ? path : null),
        );

        const sourceId = created0.sourceId;
        const layers = opts.layers
          ? opts.layers(sourceId)
          : protomapsLayers(
              sourceId,
              opts.flavor ?? namedFlavor(opts.mapStyle ?? "light"),
              {
              lang: opts.lang ?? "en",
            });

        // ── Extensions, phase 1: style ────────────────────────────────────
        //
        // Contributions are collected and merged BEFORE the Map exists, so an
        // extension's hillshade can land under the labels and its terrain can
        // be declared in the style rather than set afterwards (which would
        // re-tessellate every tile on screen). Collisions throw here — see
        // core/extensions.ts.
        const extensions = opts.extensions ?? [];
        const extensionCtx: ExtensionContext = {
          maplibregl,
          basemapSourceId: sourceId,
          basemapMaxZoom: created0.maxZoom,
        };
        const contributions = await collectStyleContributions(
          extensions,
          extensionCtx,
        );
        if (cancelled) {
          created0.dispose();
          return;
        }

        const { sources: baseSources, ...assetKeys } = created0.styleFragment();
        const merged = mergeExtensionStyle(
          { sources: baseSources, layers },
          contributions,
        );

        // Cast at the boundary: core is deliberately free of any maplibre-gl
        // import (so it can be used from a worker or a non-MapLibre consumer),
        // which means its style fragment is structurally typed. @protomaps
        // layer lists are likewise loosely typed. Both are validated by
        // MapLibre itself at construction.
        const style = {
          version: 8,
          ...assetKeys,
          sources: merged.sources,
          layers: merged.layers,
          // Spread conditionally rather than assigning undefined: MapLibre
          // validates the style object it is given, and an explicit
          // `terrain: undefined` is not the same thing as no terrain key.
          ...(merged.terrain ? { terrain: merged.terrain } : {}),
          ...(merged.sky ? { sky: merged.sky } : {}),
        } as unknown as maplibregl.StyleSpecification;

        const view = resolveView(opts);
        const mapInstance = new maplibregl.Map({
          container: container as HTMLElement,
          style,
          center: view.center,
          zoom: view.zoom,
          maxZoom: created0.maxZoom + (opts.overzoom ?? 4),
        });
        created = mapInstance;

        // Subscribed before anything can go wrong, so a style failure is
        // reported rather than swallowed while we wait for it below.
        mapInstance.on("error", (e) => {
          console.warn("[decho-basemap] map error", e?.error ?? e);
        });

        if (opts.navigationControl !== false) {
          mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");
        }
        if (opts.scaleControl !== false) {
          mapInstance.addControl(
            new maplibregl.ScaleControl({ maxWidth: 200, unit: "metric" }),
            "bottom-right",
          );
        }

        // ── Wait for the style ────────────────────────────────────────────
        //
        // A Map is usable the moment the constructor returns; its STYLE is not,
        // even when the style is passed as an object. Every method that mutates
        // the style — setProjection, addSource, addLayer, setLayerZoomRange —
        // throws "Style is not done loading" until it is.
        //
        // That was an intermittent bug here for exactly as long as `globe` has
        // existed: setProjection ran on the line after the constructor and won
        // or lost a race with the style, so the map failed to open on a slow
        // frame and worked on a fast one.
        //
        // Waiting here makes "the style is loaded" a GUARANTEE for everything
        // downstream — the projection, useDrawingTools' addSource, every
        // extension's attach(), and the host's own onMapReady — rather than a
        // race each of them has to know about.
        const styleLoaded = await whenStyleLoaded(mapInstance);
        // Nothing to undo here: by this point `handle` and `created` are both
        // assigned, so the cleanup that set `cancelled` has already disposed
        // the basemap and removed the map. Doing it again would double-remove.
        if (cancelled) {return;}
        if (!styleLoaded) {
          // Proceeding anyway: the calls below may throw, and a specific error
          // is more use than a map that silently never becomes ready.
          console.warn(
            "[decho-basemap] the style did not finish loading within 10s; " +
              "continuing anyway. Check the map error log above for a source, " +
              "sprite or glyph that failed.",
          );
        }

        if (opts.globe) {
          // Set after construction rather than as a style key: it works the
          // same, but keeps the projection out of the style object so a later
          // setStyle (flavor change) cannot silently drop it. It has to come
          // after the wait above — this is the call that surfaced the whole
          // problem.
          mapInstance.setProjection({ type: "globe" });
        }

        detach = created0.attach(mapInstance);

        // MapLibre measures its container once, at construction, and never
        // re-measures on its own. Any host that sizes the container after
        // first paint — a percentage height that was indefinite for a frame, a
        // panel that animates open, a tab that mounts hidden — leaves the map
        // permanently at that initial size, which is very often zero. The
        // symptom is brutal to diagnose: tiles download and decode correctly
        // and absolutely nothing appears.
        //
        // Observing the container makes that self-healing.
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => mapInstance.resize());
          resizeObserver.observe(container as HTMLElement);
        }

        // ── Extensions, phase 2: attach ───────────────────────────────────
        //
        // Before onMapReady, so a host callback sees a fully assembled map
        // rather than one whose add-ons are still arriving.
        disposeExtensions = await attachExtensions(
          mapInstance as unknown as ExtensionMap,
          extensionCtx,
          extensions,
        );
        if (cancelled) {
          // The cleanup already ran while this was awaiting, and it could not
          // have disposed what did not exist yet.
          disposeExtensions();
          disposeExtensions = null;
          return;
        }

        setGlobe(created0);
        setMap(mapInstance);
        opts.onMapReady?.(mapInstance, created0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      unsubscribe?.();
      // Extensions come down before the basemap and the Map itself: they were
      // attached last, and an extension's teardown may touch sources and layers
      // that only exist while the map does.
      disposeExtensions?.();
      detach?.();
      handle?.dispose();
      created?.remove();
      setMap(null);
      setGlobe(null);
    };
    // Intentionally empty: see optionsRef above.
     
  }, [containerRef]);

  const drawing = useDrawingTools(
    map,
    options.drawingTools ?? false,
    options.onDrawChange,
  );

  return { map, globe, loading, error, drawing };
}
