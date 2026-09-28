/**
 * whenStyleLoaded — the fix for "Style is not done loading".
 *
 * THE FOOTGUN
 * -----------
 * A MapLibre `Map` is usable the instant its constructor returns, but its STYLE
 * is not. `Style#_checkLoaded()` throws `Error: Style is not done loading` and
 * guards every method that mutates the style — `addSource`, `addLayer`,
 * `removeLayer`, `setPaintProperty`, `setLayoutProperty`, `setLayerZoomRange`,
 * `setTerrain`, `setProjection`, `setFilter` and the rest.
 *
 * Passing a style OBJECT rather than a URL does not save you: MapLibre still
 * finishes loading it a frame or more later, once glyphs and sprite have been
 * resolved. So this:
 *
 *   const map = new maplibregl.Map({ container, style });
 *   map.setProjection({ type: "globe" });     // throws, sometimes
 *
 * fails on a slow frame and works on a fast one. That intermittency is the
 * whole character of the bug: it passes in development on a warm cache and
 * fails on someone else's laptop, or on the third reload, or only when the
 * sprite is cold.
 *
 * WHY IT IS WORTH A MODULE
 * ------------------------
 * It bit three separate places in this repository — the globe projection, the
 * drawing tools' `addSource`, and any extension mutating the style in
 * `attach()` — and it will bite every consumer that adds a layer in
 * `onMapReady`. Waiting is four lines, and getting the waiting subtly wrong
 * (listening for `load` only, and missing the case where it already fired) is
 * its own intermittent bug. So it is written once, tested, and exported.
 *
 * `useBasemap` awaits this before it touches the projection, attaches
 * extensions, publishes the map or calls `onMapReady` — which makes "the style
 * is loaded" a guarantee for everything downstream rather than a race everyone
 * has to know about.
 */

/** The slice of `maplibregl.Map` this needs. Structural: core imports no maplibre-gl. */
export interface StyleReadyMap {
  /**
   * `boolean | void` because that is MapLibre's own signature: it returns
   * undefined when the map has no style at all, which is a third state and not
   * the same as "loaded". Narrowed with `=== true` below rather than coerced,
   * so "no style yet" waits instead of being read as loaded.
   */
  isStyleLoaded(): boolean | void;
  on(type: string, listener: () => void): unknown;
  off(type: string, listener: () => void): unknown;
}

export interface WhenStyleLoadedOptions {
  /**
   * Give up after this long and resolve `false`. Default 10s.
   *
   * A style that never finishes — a malformed layer list, a sprite URL that
   * hangs — would otherwise leave the caller waiting forever, and a map that
   * never reports ready is harder to diagnose than one that reports a specific
   * failure. Resolving lets the caller proceed and fail loudly instead.
   */
  timeoutMs?: number;
}

/**
 * Resolves when the map's style is loaded: `true` if it loaded, `false` if it
 * timed out.
 *
 * Safe to call on a map whose style is already loaded — that is the common case
 * and it resolves without touching an event.
 */
export function whenStyleLoaded(
  map: StyleReadyMap,
  options: WhenStyleLoadedOptions = {},
): Promise<boolean> {
  const loaded = () => map.isStyleLoaded() === true;
  if (loaded()) {return Promise.resolve(true);}

  const timeoutMs = options.timeoutMs ?? 10_000;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (loaded: boolean) => {
      if (settled) {return;}
      settled = true;
      map.off("styledata", onStyleData);
      map.off("load", onLoad);
      if (timer !== null) {clearTimeout(timer);}
      resolve(loaded);
    };

    // `styledata` fires several times while a style comes up — on the JSON, on
    // the sprite, on each glyph range — so the flag is what decides, not the
    // event. `load` is the belt: it fires once, after the style is loaded and
    // the first frame is drawn.
    const onStyleData = () => {
      if (loaded()) {finish(true);}
    };
    const onLoad = () => finish(true);

    map.on("styledata", onStyleData);
    map.on("load", onLoad);

    if (timeoutMs > 0) {
      timer = setTimeout(() => finish(false), timeoutMs);
    }

    // Re-checked after subscribing: the style can finish between the early
    // return above and here, and then no further event is coming. This is the
    // race that makes a naive `map.once("load")` hang forever on a fast load.
    if (loaded()) {finish(true);}
  });
}
