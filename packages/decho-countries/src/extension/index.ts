/**
 * countries() — the @acc/decho-basemap add-on.
 *
 *   <DechoBasemap extensions={[countries({ onSelect: (s) => setSelected(s) })]} />
 *
 * WHAT IT DRAWS
 * -------------
 * Country outlines from a countries dataset: a translucent fill, coloured by
 * region unless told
 * otherwise, and the borders over it — all under the basemap's labels, so
 * place names stay readable. Hovering highlights a country, or its whole
 * region in region mode; clicking selects it.
 *
 * WHAT THE DATA DECIDES
 * ---------------------
 * Which border views and region schemes exist. A dataset built with
 * foundry/countries_transform.py carries Natural Earth's de facto view and one per
 * point of view that draws disputed territory differently, and five region
 * schemes; another dataset may carry others. `view` and `regionScheme` choose
 * among them at start, and the controller handed to `onReady` switches them
 * while the map is up — no rebuild, just the source's data.
 *
 * Detail follows zoom: each view lists its files with the zoom each starts
 * at, and the extension swaps to the finer one as the map passes it.
 *
 * CLICKS IT LEAVES ALONE
 * ----------------------
 * Countries cover most of the land, so a naive click handler would steal
 * every click meant for something drawn over them — an event, a unit, a
 * route. A click or hover only counts here when nothing is under the pointer
 * on a layer above these, the basemap's own labels excepted. The country is
 * then found by point-in-polygon on the outlines, not by what MapLibre
 * rendered, so it works the same at any zoom.
 *
 * WHY A FAILURE HERE DOES NOT FAIL THE MAP
 * ----------------------------------------
 * As with decho-elevation: the likeliest failure is a dataset that is not a
 * Resource on the app, and losing the country layer for that is right, while
 * losing the whole map is not. Load failures go to `onError` and the console,
 * and the extension contributes nothing.
 */

import type {
  BasemapExtension,
  ExtensionContext,
  ExtensionMap,
  StyleContribution,
} from "@acc/decho-basemap";

import { loadCountries, type CountriesData, type CountriesStore } from "../core/load.js";
import { fileForZoom } from "../core/manifest.js";
import type { Bounds, CountryIndex } from "../core/geometry.js";
import type { CountryFeatureCollection, CountryRecord, Region, RegionSchemeInfo, ViewInfo } from "../core/types.js";
import {
  DEFAULT_APPEARANCE,
  annotate,
  layerIds,
  layersFor,
  matchFilter,
  type Appearance,
  type FillMode,
} from "./layers.js";

export { DEFAULT_PALETTE, type FillMode } from "./layers.js";

export type CountriesMode = "countries" | "regions" | "auto";

export type CountrySelection =
  | { kind: "country"; country: CountryRecord; region?: Region }
  | { kind: "region"; region: Region; scheme: RegionSchemeInfo };

/** What `select` takes: a country or region id, said which. */
export type SelectTarget = { kind: "country"; id: string } | { kind: "region"; id: string };

export interface CountriesController {
  data: CountriesData;
  /** The view being drawn. */
  readonly view: ViewInfo;
  /** Switch border view. Resolves once its outlines are on the map. */
  setView(id: string): Promise<void>;
  readonly regionScheme: RegionSchemeInfo | undefined;
  setRegionScheme(id: string): void;
  readonly mode: CountriesMode;
  setMode(mode: CountriesMode): void;
  /** Whether hover and clicks are on regions right now (regions mode, or auto below its zoom). */
  readonly pickingRegions: boolean;
  readonly selection: CountrySelection | null;
  /** Select a country or region, or clear with null. Fires onSelect. */
  select(target: SelectTarget | null): void;
  /** Frame a country or region. */
  fitTo(target: SelectTarget): void;
  /** The country at a point in the current view. */
  countryAt(lon: number, lat: number): CountryRecord | undefined;
}

export interface CountriesOptions {
  /** Where the data comes from: the countries dataset. */
  store: CountriesStore;
  /** Border view id; the dataset's default when omitted. */
  view?: string;
  /** Region scheme id; the dataset's default when omitted. */
  regionScheme?: string;
  /**
   * What hover and clicks pick: countries, regions, or regions when zoomed
   * out below `regionsBelowZoom` and countries above. Default "countries".
   */
  mode?: CountriesMode;
  regionsBelowZoom?: number;
  /**
   * "region" (default): one colour per region of the scheme. "country": a
   * colour per country. "uniform": one colour. "none": borders only. Or a
   * function of the record, for a choropleth — return a CSS colour.
   */
  fill?: FillMode;
  palette?: string[];
  uniformColour?: string;
  fillOpacity?: number;
  hoverOpacity?: number;
  borderColour?: string;
  borderWidth?: number;
  highlightColour?: string;
  /** Hover and click. Default true; false draws the layer and nothing else. */
  interactive?: boolean;
  /** Where in the style; see decho-basemap's StyleContribution. Default "labels". */
  before?: string;
  /** Extension id and layer id prefix. Change it to put two on one map. */
  id?: string;
  onSelect?(selection: CountrySelection | null): void;
  onHover?(selection: CountrySelection | null): void;
  onReady?(controller: CountriesController): void;
  onError?(error: unknown): void;
}

/** The slice of a MapLibre map used here beyond what ExtensionMap promises. */
interface InteractiveMap extends ExtensionMap {
  setFilter?(layerId: string, filter: unknown): unknown;
  queryRenderedFeatures?(point: unknown, options?: { layers?: string[] }): Array<{ layer?: { id?: string } }>;
  fitBounds?(bounds: [[number, number], [number, number]], options?: Record<string, unknown>): unknown;
  flyTo?(options: Record<string, unknown>): unknown;
  getStyle?(): { layers?: Array<{ id: string; source?: string }> } | undefined;
}

interface PointerEvent {
  lngLat: { lng: number; lat: number };
  point: unknown;
}

const DEFAULT_REGIONS_BELOW_ZOOM = 3;

export function countries(options: CountriesOptions): BasemapExtension {
  const prefix = options.id ?? "countries";
  const ids = layerIds(prefix);
  const appearance: Appearance = {
    ...DEFAULT_APPEARANCE,
    ...Object.fromEntries(
      Object.entries({
        fill: options.fill,
        palette: options.palette,
        uniformColour: options.uniformColour,
        fillOpacity: options.fillOpacity,
        hoverOpacity: options.hoverOpacity,
        borderColour: options.borderColour,
        borderWidth: options.borderWidth,
        highlightColour: options.highlightColour,
      }).filter(([, value]) => value !== undefined),
    ),
  };

  // Kept across map rebuilds — a host that rebuilds its map (to toggle globe
  // or terrain, say) gets the same data without reading it again, and the
  // same view, scheme, mode and selection back.
  let dataPromise: Promise<CountriesData> | null = null;
  let data: CountriesData | null = null;
  const state: {
    viewId: string | undefined;
    schemeId: string | undefined;
    mode: CountriesMode;
    selected: SelectTarget | null;
  } = {
    viewId: options.view,
    schemeId: options.regionScheme,
    mode: options.mode ?? "countries",
    selected: null,
  };

  const report = (error: unknown) => {
    console.warn(`[decho-countries] ${error instanceof Error ? error.message : String(error)}`);
    options.onError?.(error);
  };

  return {
    id: prefix,

    async style(_ctx: ExtensionContext): Promise<StyleContribution> {
      try {
        dataPromise ??= loadCountries(options.store);
        data = await dataPromise;
        const view = data.view(state.viewId);
        state.viewId = view.id;
        const scheme = data.regionScheme(state.schemeId);
        if (state.schemeId && !scheme) {
          report(new Error(`no region scheme "${state.schemeId}"; using the dataset's default.`));
        }
        state.schemeId = data.regionScheme(scheme?.id)?.id;
        const outlines = await data.geometry(view.id, 0);
        return {
          sources: {
            [ids.source]: { type: "geojson", data: annotate(outlines, data, state.schemeId, appearance) },
          },
          layers: layersFor(prefix, appearance),
          before: options.before ?? "labels",
        };
      } catch (error) {
        // Not cached: a rebuild after fixing the dataset's access tries again.
        dataPromise = null;
        data = null;
        report(error);
        return {};
      }
    },

    attach(baseMap: ExtensionMap, ctx: ExtensionContext) {
      if (!data) {return;}
      const map = baseMap as InteractiveMap;
      const loaded = data;

      let view = loaded.view(state.viewId);
      let schemeId = state.schemeId;
      let mode: CountriesMode = state.mode;
      const regionsBelowZoom = options.regionsBelowZoom ?? DEFAULT_REGIONS_BELOW_ZOOM;
      let filePath = fileForZoom(view, 0).path;
      let outlines: CountryFeatureCollection | null = null;
      let index: CountryIndex | null = null;
      let selection: CountrySelection | null = null;
      let hovered: string | null = null;
      let disposed = false;

      const pickingRegions = () =>
        Boolean(schemeId) && (mode === "regions" || (mode === "auto" && map.getZoom() < regionsBelowZoom));

      const setData = (collection: CountryFeatureCollection) => {
        const source = map.getSource(ids.source) as { setData?: (data: unknown) => void } | undefined;
        source?.setData?.(annotate(collection, loaded, schemeId, appearance));
      };

      /** Load the file for the current view and zoom, if it is not the one drawn. */
      const refreshOutlines = async (force = false) => {
        const file = fileForZoom(view, map.getZoom());
        if (!force && file.path === filePath && outlines) {return;}
        const wantedView = view;
        const collection = await loaded.geometry(view.id, map.getZoom());
        // A newer request (another view, another zoom) has won.
        if (disposed || wantedView !== view || fileForZoom(view, map.getZoom()).path !== file.path) {return;}
        filePath = file.path;
        outlines = collection;
        index = await loaded.index(view.id, map.getZoom());
        setData(collection);
      };

      const selectionFor = (target: SelectTarget | null): CountrySelection | null => {
        if (!target) {return null;}
        if (target.kind === "country") {
          const country = loaded.country(target.id);
          return country ? { kind: "country", country, region: loaded.regionOf(country.id, schemeId) } : null;
        }
        const scheme = loaded.regionScheme(schemeId);
        const region = scheme && loaded.regions(scheme.id).find((candidate) => candidate.id === target.id);
        return scheme && region ? { kind: "region", region, scheme } : null;
      };

      const showSelection = () => {
        const filter =
          selection?.kind === "country"
            ? matchFilter("country", selection.country.id)
            : selection?.kind === "region"
              ? matchFilter("region", selection.region.id)
              : matchFilter("country", null);
        map.setFilter?.(ids.selected, filter);
      };

      const showHover = (id: string | null) => {
        hovered = id;
        map.setFilter?.(ids.hover, matchFilter(pickingRegions() ? "region" : "country", id));
      };

      // Layers drawn above ours that are not the basemap's: a pointer over
      // one of their features belongs to them. Refreshed when the style
      // changes, since other extensions and apps add layers after us.
      let above: string[] = [];
      const findLayersAbove = () => {
        const layers = map.getStyle?.()?.layers ?? [];
        const ours = layers.findIndex((layer) => layer.id === ids.selected);
        above = ours === -1
          ? []
          : layers.slice(ours + 1).filter((layer) => layer.source && layer.source !== ctx.basemapSourceId).map((layer) => layer.id);
      };
      const covered = (point: unknown) =>
        above.length > 0 && (map.queryRenderedFeatures?.(point, { layers: above }) ?? []).length > 0;

      /** What the pointer is over: a country or region id, null for sea, undefined when covered. */
      const pick = (event: PointerEvent): string | null | undefined => {
        if (covered(event.point)) {return undefined;}
        const id = index?.countryAt(event.lngLat.lng, event.lngLat.lat) ?? null;
        if (id === null || !pickingRegions()) {return id;}
        return loaded.country(id)?.regions[schemeId as string] ?? null;
      };

      const targetFor = (id: string): SelectTarget =>
        pickingRegions() ? { kind: "region", id } : { kind: "country", id };

      const onMove = (event: PointerEvent) => {
        const id = pick(event);
        const next = id === undefined ? null : id;
        if (next === hovered) {return;}
        showHover(next);
        options.onHover?.(next === null ? null : selectionFor(targetFor(next)));
      };

      const onLeave = () => {
        if (hovered === null) {return;}
        showHover(null);
        options.onHover?.(null);
      };

      const onClick = (event: PointerEvent) => {
        const id = pick(event);
        if (id === undefined) {return;}
        controller.select(id === null ? null : targetFor(id));
      };

      const onZoom = () => {
        void refreshOutlines().catch(report);
        // Crossing the auto threshold changes what a hover means.
        if (mode === "auto" && hovered !== null) {showHover(null);}
      };

      const unionBounds = (boxes: Array<Bounds | null>): Bounds | null => {
        const present = boxes.filter((box): box is Bounds => box !== null);
        if (present.length === 0) {return null;}
        return [
          Math.min(...present.map((b) => b[0])),
          Math.min(...present.map((b) => b[1])),
          Math.max(...present.map((b) => b[2])),
          Math.max(...present.map((b) => b[3])),
        ];
      };

      const controller: CountriesController = {
        data: loaded,
        get view() {
          return view;
        },
        async setView(id) {
          view = loaded.view(id);
          state.viewId = view.id;
          await refreshOutlines(true);
          // A selected country this view does not draw (merged into another) is dropped.
          if (selection?.kind === "country" && index && !index.bounds(selection.country.id)) {
            controller.select(null);
          }
        },
        get regionScheme() {
          return loaded.regionScheme(schemeId);
        },
        setRegionScheme(id) {
          const scheme = loaded.regionScheme(id);
          if (!scheme) {
            report(new Error(`no region scheme "${id}".`));
            return;
          }
          schemeId = scheme.id;
          state.schemeId = scheme.id;
          if (outlines) {setData(outlines);}
          if (selection?.kind === "region") {controller.select(null);}
          showHover(null);
        },
        get mode() {
          return mode;
        },
        setMode(next) {
          mode = next;
          state.mode = next;
          showHover(null);
        },
        get pickingRegions() {
          return pickingRegions();
        },
        get selection() {
          return selection;
        },
        select(target) {
          selection = selectionFor(target);
          state.selected = selection ? target : null;
          showSelection();
          options.onSelect?.(selection);
        },
        fitTo(target) {
          const found = selectionFor(target);
          const members = found?.kind === "region" ? found.region.countries : [target.id];
          const box = unionBounds(members.map((id) => index?.bounds(id) ?? null));
          if (!box) {return;}
          // A box across most of the world is one that crosses the antimeridian
          // (Russia, Fiji, the USA with Alaska): fly to the label point instead.
          if (box[2] - box[0] > 270) {
            const record = target.kind === "country" ? loaded.country(target.id) : undefined;
            const [lon, lat] = record?.label ?? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
            map.flyTo?.({ center: [lon, lat], zoom: 2, duration: 1200 });
            return;
          }
          map.fitBounds?.([[box[0], box[1]], [box[2], box[3]]], { padding: 40, maxZoom: 7, duration: 1200 });
        },
        countryAt(lon, lat) {
          const id = index?.countryAt(lon, lat);
          return id ? loaded.country(id) : undefined;
        },
      };

      findLayersAbove();
      map.on("styledata", findLayersAbove);
      map.on("zoomend", onZoom);
      if (options.interactive !== false) {
        map.on("mousemove", onMove as (event: unknown) => void);
        map.on("mouseout", onLeave);
        map.on("click", onClick as (event: unknown) => void);
      }
      void refreshOutlines(true)
        .then(() => {
          if (disposed) {return;}
          // Back from a rebuild: the same selection, shown again, without
          // telling onSelect about a change that is not one.
          if (state.selected) {
            selection = selectionFor(state.selected);
            showSelection();
          }
          options.onReady?.(controller);
        })
        .catch(report);

      return () => {
        disposed = true;
        map.off("styledata", findLayersAbove);
        map.off("zoomend", onZoom);
        map.off("mousemove", onMove as (event: unknown) => void);
        map.off("mouseout", onLeave);
        map.off("click", onClick as (event: unknown) => void);
      };
    },
  };
}
