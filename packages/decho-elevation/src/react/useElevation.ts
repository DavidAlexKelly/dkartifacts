/**
 * useElevation — a DEM source with a React lifecycle, and the two readouts an
 * application always ends up wanting.
 *
 * OWNED OR BORROWED
 * -----------------
 * Pass a `source` (the one `elevation({ onReady })` handed you) and this hook
 * borrows it: no second source, no second cell cache, no second set of
 * protocols. Pass none and it creates and disposes one of its own, which is
 * what a page with no map — a route table, a report — wants.
 *
 * Getting that wrong is expensive rather than broken: two sources over one
 * dataset each decode their own copy of every cell, so a 2° cell costs 23 MB
 * instead of 11.5.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createDemSource,
  type DemSourceHandle,
  type DemSourceOptions,
} from "../core/demSource.js";
import {
  elevationProfile,
  type ElevationProfile,
  type GeoPoint,
  type ProfileOptions,
} from "../core/profile.js";
import {
  lineOfSight,
  viewshed,
  type SightRequest,
  type SightResult,
  type Viewshed,
  type ViewshedOptions,
} from "../core/lineOfSight.js";

export interface UseElevationOptions extends DemSourceOptions {
  /** An existing source to use instead of creating one. */
  source?: DemSourceHandle | null;
}

export interface UseElevationResult {
  source: DemSourceHandle | null;
  /** True while an owned source is being created. */
  loading: boolean;
  error: Error | null;
  heightAt(lon: number, lat: number): Promise<number>;
  profile(
    waypoints: readonly GeoPoint[],
    options?: ProfileOptions,
  ): Promise<ElevationProfile>;
  sight(request: SightRequest): Promise<SightResult>;
  viewshed(
    options: ViewshedOptions,
    onProgress?: (fraction: number) => void,
  ): Promise<Viewshed>;
}

export function useElevation(
  options: UseElevationOptions = {},
): UseElevationResult {
  const borrowed = options.source ?? null;
  const [owned, setOwned] = useState<DemSourceHandle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Read once, like useBasemap: re-creating a source because a prop object was
  // re-made on a render would throw away every decoded cell.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (borrowed) {return;}

    let cancelled = false;
    let created: DemSourceHandle | null = null;
    setLoading(true);

    void (async () => {
      try {
        const opts = optionsRef.current;
        created = await createDemSource({
          store: opts.store,
          codecs: opts.codecs,
          tileSize: opts.tileSize,
          maxZoom: opts.maxZoom,
          cellBudgetBytes: opts.cellBudgetBytes,
          tiles: opts.tiles,
        });
        if (cancelled) {
          created.dispose();
          return;
        }
        setOwned(created);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {setLoading(false);}
      }
    })();

    return () => {
      cancelled = true;
      created?.dispose();
      setOwned(null);
    };
  }, [borrowed]);

  const source = borrowed ?? owned;

  const require = useCallback((): DemSourceHandle => {
    if (!source) {
      throw new Error(
        "decho-elevation: the DEM source is not ready yet. Guard on " +
          "`source` (or `loading`) before asking it questions.",
      );
    }
    return source;
  }, [source]);

  return {
    source,
    loading,
    error,

    heightAt: useCallback(
      (lon, lat) => require().heightAt(lon, lat),
      [require],
    ),

    profile: useCallback(
      (waypoints, profileOptions) =>
        elevationProfile(require(), waypoints, profileOptions),
      [require],
    ),

    sight: useCallback(
      (request) => lineOfSight(require(), request),
      [require],
    ),

    viewshed: useCallback(
      (viewshedOptions, onProgress) =>
        viewshed(require(), viewshedOptions, onProgress),
      [require],
    ),
  };
}

/** The slice of a map this hook listens to. Structural: no maplibre-gl import. */
export interface PointerMap {
  on(
    type: string,
    listener: (event: { lngLat?: { lng: number; lat: number } }) => void,
  ): unknown;
  off(
    type: string,
    listener: (event: { lngLat?: { lng: number; lat: number } }) => void,
  ): unknown;
}

export interface CursorElevation {
  lon: number;
  lat: number;
  /** Metres, NaN where the DEM has nothing, null before the first move. */
  elevation: number | null;
}

/**
 * Height under the pointer.
 *
 * READS ONLY RESIDENT CELLS
 * -------------------------
 * `heightAtLoaded`, not `heightAt`: a pointer crossing a map fires this
 * hundreds of times a second, and the awaiting version would queue a 20 MB
 * download per cell boundary crossed, out of order, for a number that is stale
 * by the time it arrives. The cell under the view is resident anyway — the map
 * is drawing it — so the readout is populated in practice and honestly blank
 * when it is not.
 */
export function useCursorElevation(
  map: PointerMap | null | undefined,
  source: DemSourceHandle | null | undefined,
): CursorElevation | null {
  const [state, setState] = useState<CursorElevation | null>(null);

  useEffect(() => {
    if (!map || !source) {return;}

    let frame: number | null = null;
    let pending: { lon: number; lat: number } | null = null;

    const flush = () => {
      frame = null;
      if (!pending) {return;}
      const { lon, lat } = pending;
      setState({ lon, lat, elevation: source.heightAtLoaded(lon, lat) });
    };

    const onMove = (event: { lngLat?: { lng: number; lat: number } }) => {
      if (!event.lngLat) {return;}
      pending = { lon: event.lngLat.lng, lat: event.lngLat.lat };
      // Coalesced to one update per frame. Without this, React re-renders the
      // whole HUD on every mousemove event, which on a map is dozens per frame.
      if (frame === null) {
        frame =
          typeof requestAnimationFrame === "function"
            ? requestAnimationFrame(flush)
            : (setTimeout(flush, 16) as unknown as number);
      }
    };

    const onLeave = () => setState(null);

    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);

    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
      if (frame !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
      }
    };
  }, [map, source]);

  return state;
}
