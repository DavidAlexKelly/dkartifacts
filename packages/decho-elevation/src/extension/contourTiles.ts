/**
 * contourTiles() — pre-traced VECTOR contours, one PMTiles archive per DEM cell.
 *
 *   <DechoBasemap extensions={[contourTiles()]} />
 *
 * The other kind of contour in this package is contourTile in core/renderers:
 * lines found per pixel from the DEM and drawn into a raster tile. It is nearly
 * free and it cannot be labelled. These are the traced ones — gdal_contour over
 * the same GeoTIFFs, tippecanoe into a PMTiles per cell — so the lines are
 * geometry: crisp at any zoom, pickable, and carrying their height, which means
 * an index contour can say "300 m" along itself.
 *
 * WHY ONE SOURCE PER CELL, WHICH IS THE WHOLE DESIGN
 * --------------------------------------------------
 * The archives are cut per 2° cell from that cell's GeoTIFF and CLIPPED to it,
 * with no halo. So a map tile straddling a cell boundary exists in both
 * archives, and in each of them it holds only the half inside that cell.
 *
 * A single routed source — one protocol, pathForTile picking the cell that
 * contains the tile, which is how the basemap serves its own chunked archives —
 * would therefore drop every line on the far side of the boundary and leave a
 * gap along every 2° line, a tile wide. Raster chunks do not have this problem
 * because the resampler gathers from all four cells a tile touches; a vector
 * tile cannot be gathered without decoding and re-encoding MVT.
 *
 * So each visible cell gets its own MapLibre vector source, its own protocol and
 * its own layers, added when the cell comes into view and removed when it
 * leaves. Nothing is clipped away, and the cost is bounded: 2° cells are large,
 * so a planning view holds one to four of them.
 *
 * WHAT IT REUSES
 * --------------
 * Everything below the tile: each cell is a `createTileSource` from
 * @acc/decho-basemap, so PMTiles decoding, Foundry ranged reads, the LRU, Cache
 * Storage, request dedupe and the concurrency lanes all come for free, and a
 * cell is expressed as a fixed-grid store of exactly one archive. No new
 * dependency, and no second tile pipeline to keep in step with the first.
 *
 * ONE ZOOM IN, EVERY ZOOM OUT
 * ---------------------------
 * tippecanoe ran with -Z10 -z10, so an archive holds z10 tiles and nothing
 * else. Each source declares minzoom = maxzoom = 10 and MapLibre overzooms
 * above it — free for vector geometry, which scales without softening. Below
 * z10 there is nothing to draw, which is also where contours stop being
 * readable, so the extension detaches its cells rather than asking.
 *
 * WHY THE LABELS ARE ON A GEOJSON SOURCE AND THE LINES ARE NOT
 * ------------------------------------------------------------
 * Because of that overzoom, and it is a hard MapLibre constraint rather than a
 * preference. With terrain enabled, a symbol is raised to the ground: MapLibre
 * calls `terrain.getDEMElevation(tileID, x, y)` with the SYMBOL'S OWN TILE ID,
 * walks up from there to the nearest ancestor that has DEM data, and — see
 * maplibre-gl's terrain.ts — `if (!dem) return 0`.
 *
 * A label on a z10 contour tile therefore asks for a z10-or-coarser DEM tile.
 * At a z14 view the terrain has z12 tiles loaded and no z10 ancestor, so the
 * lookup misses, the elevation comes back 0, and every label is placed at sea
 * level — buried inside any ground that rises above it. Which is exactly the
 * symptom: heights visible over flat ground, gone over the hills, and
 * unaffected by either pitch alignment because the text is inside the mesh.
 *
 * Lines escape it because line layers are DRAPED — rendered into the terrain's
 * texture — and never ask for a per-feature elevation.
 *
 * So the index contours are copied into a `geojson` source, which MapLibre
 * tiles itself at the DISPLAY zoom: a z14 label tile finds the z12 DEM tile as
 * its ancestor, the elevation resolves, and the label sits on the ground it
 * belongs to. The features come from the vector tiles that are already loaded,
 * so this costs a query and a setData per view change, not another download.
 */

import {
  FONT_REGULAR,
  createTileSource,
  type BasemapExtension,
  type ExtensionContext,
  type ExtensionMap,
  type StyleContribution,
  type TileSourceHandle,
} from "@acc/decho-basemap";

import { defaultContourStore, type ContourStore } from "../core/defaults";
import { cellBounds, cellKey, cellsInBounds, type CellGrid } from "../core/grid";
import type { ContourStep } from "../core/renderers";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ContourTilesOptions {
  /** Extension id, and the prefix of every source, layer and protocol id. */
  id?: string;
  /** The archives. Defaults to this enrollment's preset. */
  store?: ContourStore;
  /** Overrides the store's grid, for archives cut on a different lattice. */
  grid?: CellGrid;
  /** Overrides the store's layer name. */
  sourceLayer?: string;
  /** Overrides the store's elevation property. */
  elevationProperty?: string;

  /**
   * Thin the contours by zoom: which intervals are drawn where, coarse to
   * fine, as a filter on the elevation.
   *
   * OFF BY DEFAULT, and that is a correction rather than laziness. The ladder
   * the raster renderer uses is expressed in absolute metres — 100, 25, 10 —
   * which only selects anything if the archives were traced at an interval
   * that divides those numbers. Trace at 40 m and the z12-14 rung asks for
   * multiples of 25, matches almost nothing, and the contours VANISH for two
   * zoom levels before reappearing above z14 where the rung asks for
   * multiples of 10 again. A thinning filter that depends on data this
   * extension cannot see is worse than no thinning at all.
   *
   * Pass `sourceInterval` and thinning becomes safe — the rungs are then
   * multiples of the real spacing — or pass a ladder here to say exactly
   * which absolute intervals you want, if you know them.
   */
  ladder?: readonly ContourStep[];
  /**
   * Metres between adjacent contours in the archives — gdal_contour's `-i`.
   *
   * Worth passing: it is the one number that lets the extension thin the lines
   * safely and put the index contours on lines that actually exist. Without
   * it, every line is drawn at every zoom and the index interval is taken at
   * face value.
   */
  sourceInterval?: number;
  /**
   * The INDEX contours: every multiple of this many metres is drawn heavier,
   * darker and labelled. 100 m by the usual convention, whatever interval the
   * archives were traced at — which is why this is an interval in metres
   * rather than "every Nth line": the archives know their own spacing and this
   * extension does not.
   */
  indexInterval?: number;

  /** Ordinary contours: light, thin, and read as texture rather than as lines. */
  colour?: string;
  opacity?: number;
  /**
   * Width in screen pixels by zoom, as [zoom, width] pairs.
   *
   * A ramp rather than one number because a contour that is legible at z14 is
   * a smear at z10, where the same lines are packed into a tenth of the space.
   */
  widthStops?: ReadonlyArray<readonly [number, number]>;

  /** Index contours: darker, heavier, more opaque. The ones a reader counts. */
  indexColour?: string;
  indexOpacity?: number;
  indexWidthStops?: ReadonlyArray<readonly [number, number]>;

  /** Label index contours with their height. */
  labels?: boolean;
  /** Glyphs the basemap serves. Labels are silently dropped without them. */
  labelFont?: readonly string[];
  /** Labels below this are noise. */
  labelMinZoom?: number;
  /** Unit suffix on a label. "" for none. */
  labelSuffix?: string;
  labelColour?: string;
  labelSize?: number;
  /** Pixels along a contour between repeats of its height. */
  labelSpacing?: number;
  /**
   * Degrees of bend a label will follow before giving up.
   *
   * Generous, because TERRAIN bends it further: a contour that is smooth on
   * the flat projects through the elevated mesh as a much wigglier path, and
   * MapLibre measures this against the PROJECTED line. Too tight and the
   * labels quietly stop being placed the moment relief is switched on.
   */
  labelMaxAngle?: number;
  /**
   * How the text sits relative to the camera when the map is pitched.
   *
   * "map" by default, which lies the label flat on the ground. NOT "viewport":
   * with terrain, MapLibre places a symbol at the ground elevation of its
   * anchor and depth-tests it against the terrain mesh, and a billboard
   * standing on the surface it is being tested against intersects that surface
   * and is culled as hidden behind it. Which shows up as labels that work
   * until the DEM loads and then disappear.
   */
  labelPitchAlignment?: "map" | "viewport" | "auto";
  /**
   * Let labels overlap each other. Off by default; an escape hatch for a
   * pitched, mountainous view where the projected contours crowd together and
   * collision drops most of the heights.
   */
  labelAllowOverlap?: boolean;

  /** Nothing is drawn below this. The archives start at their own zoom. */
  minZoom?: number;
  /**
   * Rings of cells to attach BEYOND the viewport, so panning arrives at
   * contours that are already there. 1 by default.
   *
   * Cheap, which is the whole reason it is on: an attached cell that is off
   * screen asks for no tiles — its source `bounds` see to that — and draws
   * nothing. What it costs is the archive it has already downloaded staying in
   * the cache, and a source and four layers of bookkeeping.
   */
  ring?: number;
  /**
   * How many cells stay attached at once, INCLUDING off-screen ones kept for
   * when the view comes back.
   *
   * This is a budget, not a visibility test. Cells are evicted least-recently-
   * wanted first and only when the budget is exceeded, so panning out of a
   * cell and back does not tear its source down and build it again — which was
   * visible as contours blinking out and returning a beat later.
   */
  maxCells?: number;

  /** Where the layers go. "labels" by default — over the ground, under text. */
  before?: string | "labels" | "ground";
  visible?: boolean;
}

export interface ContourTilesExtension extends BasemapExtension {
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  /** Cell keys attached right now — for a HUD, and for tests. */
  readonly attachedCells: readonly string[];
}

// Bistre, in two weights. The ordinary lines are meant to read as texture and
// the index lines as lines; hence the gap in both colour and opacity, not just
// in width.
const DEFAULT_COLOUR = "#8b7355";
const DEFAULT_OPACITY = 0.45;
const DEFAULT_INDEX_COLOUR = "#6b5344";
const DEFAULT_INDEX_OPACITY = 0.65;

/**
 * Width by zoom, in screen pixels.
 *
 * Hairlines, and thinner still as you zoom out, because zooming out packs the
 * same lines into less space: at z10 a 0.6px contour already reads as a solid
 * hillside. Index contours are roughly double throughout, which is what makes
 * them countable without measuring.
 */
const DEFAULT_WIDTH_STOPS: ReadonlyArray<readonly [number, number]> = [
  [10, 0.3],
  [12, 0.6],
  [14, 1],
];
const DEFAULT_INDEX_WIDTH_STOPS: ReadonlyArray<readonly [number, number]> = [
  [10, 0.5],
  [12, 0.8],
  [14, 1.2],
];

const DEFAULT_INDEX_INTERVAL = 100;
const DEFAULT_LABEL_COLOUR = "#4a3428";
const DEFAULT_LABEL_MIN_ZOOM = 11;
const DEFAULT_LABEL_SIZE = 11;
const DEFAULT_LABEL_SPACING = 400;
// 45 rather than 30: terrain bends the projected contour further than the flat
// map does, and the angle is measured on the projection.
const DEFAULT_LABEL_MAX_ANGLE = 45;
// A ring by default, and a budget generous enough to hold it: a planning view
// spans one or two 2° cells, so ring 1 wants four to nine and 12 leaves room to
// pan without evicting anything.
const DEFAULT_RING = 1;
const DEFAULT_MAX_CELLS = 12;

/** Property names gdal_contour and its neighbours write the height under. */
export const ELEVATION_PROPERTIES = ["ELEV", "elevation", "elev"] as const;

/**
 * How long to wait before rebuilding the label source, and how many contour
 * pieces to copy into it.
 *
 * A zoom fires a stream of events and each rebuild walks every loaded feature,
 * so it is debounced; and a wide view of dense terrain holds tens of thousands
 * of pieces while the placement only ever labels a handful, so it is capped.
 */
const LABEL_REFRESH_MS = 200;
const LABEL_FEATURE_LIMIT = 6000;

/**
 * The elevation, as an expression.
 *
 * gdal_contour writes `ELEV` unless told otherwise, tippecanoe passes it
 * through, and every other pipeline spells it differently. Coalescing the
 * usual names means the common case needs no configuration, and the trailing 0
 * keeps the result a number so `%` and `concat` cannot fail on a feature that
 * has none of them — such a feature draws as an index contour labelled 0,
 * which is a visible symptom rather than a silent absence, and the console says
 * what the properties actually were.
 */
function elevationExpression(property?: string): any {
  if (property) {return ["to-number", ["get", property], 0];}
  return [
    "to-number",
    ["coalesce", ...ELEVATION_PROPERTIES.map((key) => ["get", key]), 0],
    0,
  ];
}

/** Rungs sorted fine-first, each with the zoom window it owns. */
export function ladderWindows(
  ladder: readonly ContourStep[],
  floor: number,
): Array<{ interval: number; minzoom: number; maxzoom?: number }> {
  const steps = [...ladder].sort((a, b) => b.minZoom - a.minZoom);
  return steps.map((step, i) => {
    const above = steps[i - 1];
    return {
      interval: step.interval,
      minzoom: Math.max(floor, step.minZoom),
      // The rung above starts where this one ends. The finest has no ceiling.
      ...(above ? { maxzoom: Math.max(floor, above.minZoom) } : {}),
    };
  });
}

/**
 * `elevation % interval == 0`, rounded.
 *
 * Rounded because gdal_contour writes a double: a line at 300 m can arrive as
 * 299.99999999999994, and `% 100` on that is 99.99999999999994 rather than 0,
 * which would hide every index contour on the map.
 */
function onInterval(elevation: any, interval: number): any {
  return ["==", ["%", ["round", elevation], interval], 0];
}

/**
 * Width by zoom, with the index lines heavier at every stop.
 *
 * THE ORDER OF THESE TWO IS NOT A STYLE CHOICE. MapLibre only allows `["zoom"]`
 * as the OUTERMOST expression of a paint property, so this has to be an
 * interpolate whose stop values are `case`s — not the reverse. A `case` that
 * picks between two interpolates reads better and throws at style validation:
 *
 *   BAD   ["case", isIndex, ["interpolate", ["linear"], ["zoom"], …], …]
 *   GOOD  ["interpolate", ["linear"], ["zoom"], 10, ["case", isIndex, …], …]
 *
 * Composite functions like this — zoom outside, data-driven inside — are
 * exactly what line-width supports.
 */
/**
 * The index interval, snapped to a line that exists.
 *
 * 100 m is the convention, but a convention is no use if the archives were
 * traced at 40 m: no elevation in them is a multiple of 100 except every
 * fifth, so "every 100 m" would label two lines on the whole map and weight
 * the same two. Given the real spacing, round the convention UP to the nearest
 * multiple of it — 40 m data gets index contours every 120 m — which keeps
 * them roughly where a reader expects and, more importantly, on lines that are
 * in the data.
 */
export function snapIndexInterval(
  wanted: number,
  sourceInterval?: number,
): number {
  if (!sourceInterval || sourceInterval <= 0) {return wanted;}
  if (wanted % sourceInterval === 0) {return wanted;}
  return Math.ceil(wanted / sourceInterval) * sourceInterval;
}

/**
 * The zoom windows to draw, as [minzoom, maxzoom, interval] triples.
 *
 * With no ladder this is one window: every line, from the floor up. With one,
 * the rungs are used as given — or as multiples of `sourceInterval`, when that
 * is known, so a rung cannot ask for an elevation the archives do not contain.
 */
export function contourWindows(
  floor: number,
  ladder?: readonly ContourStep[],
  sourceInterval?: number,
): Array<{ interval: number | null; minzoom: number; maxzoom?: number }> {
  if (!ladder) {return [{ interval: null, minzoom: floor }];}

  return ladderWindows(ladder, floor).map((window) => ({
    ...window,
    // A rung of 25 m against 40 m data becomes 40 m: the nearest interval at
    // or above it that the data can satisfy.
    interval: snapIndexInterval(window.interval, sourceInterval),
  }));
}

/**
 * Index contours, as GeoJSON, from the vector tiles already on the map.
 *
 * Only the elevation is carried across: the label layer needs the height and
 * the geometry and nothing else, and the rest of a contour's properties would
 * be copied for every feature on every view change.
 */
export function labelFeatures(
  features: readonly unknown[],
  limit: number,
  read: readonly string[],
  write: string,
): { type: "FeatureCollection"; features: unknown[] } {
  const out: unknown[] = [];
  for (const feature of features) {
    if (out.length >= limit) {break;}
    const source = feature as {
      geometry?: unknown;
      properties?: Record<string, unknown>;
    };
    if (!source.geometry) {continue;}

    // The height under whichever of the candidate names this pipeline used,
    // rewritten under ONE name — so the label layer's expression is the same
    // whether it reads the vector tiles or this.
    let height: number | null = null;
    for (const key of read) {
      const value = source.properties?.[key];
      const parsed = typeof value === "string" ? Number(value) : value;
      if (typeof parsed === "number" && Number.isFinite(parsed)) {
        height = parsed;
        break;
      }
    }
    if (height === null) {continue;}

    out.push({
      type: "Feature",
      geometry: source.geometry,
      properties: { [write]: height },
    });
  }
  return { type: "FeatureCollection", features: out };
}

export function widthByZoom(
  isIndex: any,
  ordinary: ReadonlyArray<readonly [number, number]>,
  index: ReadonlyArray<readonly [number, number]>,
): any {
  const zooms = [...new Set([...ordinary, ...index].map(([zoom]) => zoom))].sort(
    (a, b) => a - b,
  );

  // Each stop's value is itself a choice between the two weights at that zoom.
  const at = (
    stops: ReadonlyArray<readonly [number, number]>,
    zoom: number,
  ): number => {
    const exact = stops.find(([z]) => z === zoom);
    if (exact) {return exact[1];}
    // A stop the other ramp declares and this one does not: hold the nearest.
    const below = [...stops].reverse().find(([z]) => z < zoom);
    const above = stops.find(([z]) => z > zoom);
    return (below ?? above ?? [0, 1])[1];
  };

  const expression: any[] = ["interpolate", ["linear"], ["zoom"]];
  for (const zoom of zooms) {
    expression.push(zoom, [
      "case",
      isIndex,
      at(index, zoom),
      at(ordinary, zoom),
    ]);
  }
  return expression;
}

/**
 * The smallest gap between contour heights in a sample of features.
 *
 * The archives' own interval, measured rather than assumed. Rounded, because
 * gdal_contour writes doubles and the gap between 1300.0000000000002 and 1350
 * is not 50 to a computer.
 */
export function smallestGap(
  features: readonly unknown[],
  property: string,
  sample = 400,
): number | null {
  const heights = new Set<number>();
  for (const feature of features.slice(0, sample)) {
    const value = (feature as { properties?: Record<string, unknown> })
      .properties?.[property];
    const height = typeof value === "string" ? Number(value) : value;
    if (typeof height === "number" && Number.isFinite(height)) {
      heights.add(Math.round(height));
    }
  }

  const sorted = [...heights].sort((a, b) => a - b);
  let smallest: number | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 0 && (smallest === null || gap < smallest)) {smallest = gap;}
  }
  return smallest;
}

export function contourTiles(
  options: ContourTilesOptions = {},
): ContourTilesExtension {
  const id = options.id ?? "contour-tiles";
  const store = options.store ?? defaultContourStore();
  const grid = options.grid ?? store.grid;
  const sourceLayer = options.sourceLayer ?? store.sourceLayer;
  const elevation = elevationExpression(
    options.elevationProperty ?? store.elevationProperty,
  );

  // No default ladder: see ContourTilesOptions.ladder for why thinning against
  // an interval this extension cannot see makes contours disappear.
  const indexInterval = snapIndexInterval(
    options.indexInterval ?? DEFAULT_INDEX_INTERVAL,
    options.sourceInterval,
  );
  const colour = options.colour ?? DEFAULT_COLOUR;
  const opacity = options.opacity ?? DEFAULT_OPACITY;
  const widthStops = options.widthStops ?? DEFAULT_WIDTH_STOPS;
  const indexColour = options.indexColour ?? DEFAULT_INDEX_COLOUR;
  const indexOpacity = options.indexOpacity ?? DEFAULT_INDEX_OPACITY;
  const indexWidthStops = options.indexWidthStops ?? DEFAULT_INDEX_WIDTH_STOPS;
  const labels = options.labels ?? true;
  // The basemap's own constant, not a hand-typed name: a font the glyph
  // bundle does not serve renders no text and logs one error per tile, and a
  // string that has to match across two packages will eventually not.
  const labelFont = options.labelFont ?? FONT_REGULAR;
  const labelMinZoom = options.labelMinZoom ?? DEFAULT_LABEL_MIN_ZOOM;
  const labelSuffix = options.labelSuffix ?? " m";
  const labelColour = options.labelColour ?? DEFAULT_LABEL_COLOUR;
  const labelSize = options.labelSize ?? DEFAULT_LABEL_SIZE;
  const labelSpacing = options.labelSpacing ?? DEFAULT_LABEL_SPACING;
  const labelMaxAngle = options.labelMaxAngle ?? DEFAULT_LABEL_MAX_ANGLE;
  const labelPitchAlignment = options.labelPitchAlignment ?? "map";
  const labelAllowOverlap = options.labelAllowOverlap ?? false;
  // The archives' own lowest zoom, which is the real floor: MapLibre requests
  // nothing below a source's minzoom, and a z10 tile cannot be re-cut into a
  // z8 one on the client. Seeing contours further out is a re-bake with a
  // lower tippecanoe -Z, and then archiveMinZoom.
  const archiveMinZoom = store.archiveMinZoom ?? store.archiveZoom;
  const floor = options.minZoom ?? archiveMinZoom;
  const ring = options.ring ?? DEFAULT_RING;
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const anchor = options.before ?? "labels";

  const windows = contourWindows(floor, options.ladder, options.sourceInterval);
  // Computed once: every layer filters, colours and weighs itself against the
  // same question, so a line cannot be an index contour in one rung and an
  // ordinary one in the next.
  const isIndex = onInterval(elevation, indexInterval);

  interface Cell {
    key: string;
    sourceId: string;
    handle: TileSourceHandle | null;
    /** Set when the cell is dropped while its archive was still opening. */
    abandoned: boolean;
  }

  const cells = new Map<string, Cell>();
  /** When each cell was last asked for, for eviction. See sync(). */
  const wantedAt = new Map<string, number>();
  let tick = 0;
  // The labels live on one GeoJSON source for the whole extension, not per
  // cell: see the note at the top of the file. It is fed from the vector tiles
  // that are already loaded.
  const labelSourceId = `${id}-labels`;
  const labelLayerId = `${id}-label`;

  let shown = options.visible ?? true;
  let attached: ExtensionMap | null = null;
  let host: ExtensionContext["maplibregl"] | null = null;
  let warnedEmpty = false;
  let labelRefresh: ReturnType<typeof setTimeout> | null = null;

  const visibility = () => (shown ? "visible" : "none");

  /** The layer the cell layers are inserted before. */
  const anchorLayerId = (map: ExtensionMap): string | undefined => {
    const style = (map as { getStyle?: () => { layers?: unknown[] } }).getStyle?.();
    const layers = style?.layers;
    if (!Array.isArray(layers)) {return undefined;}

    const wanted = anchor === "ground" ? "line" : "symbol";
    if (anchor !== "labels" && anchor !== "ground") {
      return layers.some((l) => (l as { id?: string }).id === anchor)
        ? anchor
        : undefined;
    }
    const found = layers.find(
      (l) => (l as { type?: string }).type === wanted,
    ) as { id?: string } | undefined;
    return found?.id;
  };

  const layerSpecs = (cellKeyName: string, sourceId: string): any[] => {
    const specs: any[] = [];

    // Coarse to fine, so the finest is nearest the top of this group. Each
    // rung owns a zoom window, which is how the ladder is enforced without
    // putting ["zoom"] inside a filter.
    for (const window of [...windows].reverse()) {
      specs.push({
        id: `${id}-${cellKeyName}-${window.interval ?? "all"}`,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        minzoom: window.minzoom,
        ...(window.maxzoom === undefined ? {} : { maxzoom: window.maxzoom }),
        // No interval means no thinning: every line the archive holds. Which
        // is the default, because a filter against the wrong interval hides
        // the contours entirely at some zooms.
        ...(window.interval === null
          ? {}
          : { filter: onInterval(elevation, window.interval) }),
        layout: {
          visibility: visibility(),
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          // One layer per rung, with the index contours inside it drawn darker,
          // heavier and more opaque — all three data-driven, rather than a
          // second layer per rung. Colour and opacity take a plain `case`;
          // width cannot, because it also varies with zoom. See widthByZoom.
          "line-color": ["case", isIndex, indexColour, colour],
          "line-opacity": ["case", isIndex, indexOpacity, opacity],
          "line-width": widthByZoom(isIndex, widthStops, indexWidthStops),
        },
      });
    }

    return specs;
  };

  /**
   * The one label layer, on the GeoJSON source rather than per cell.
   *
   * See the note at the top of the file: a symbol on an overzoomed z10 tile
   * cannot find a DEM ancestor, so MapLibre places it at elevation 0 and the
   * terrain swallows it. GeoJSON is tiled at the display zoom, which is the
   * whole reason this layer is separate from the lines it labels.
   */
  const labelLayerSpec = (): any => ({
    id: labelLayerId,
    type: "symbol",
    source: labelSourceId,
    minzoom: Math.max(floor, labelMinZoom),
    // Index contours only. Labelling every line is unreadable, and the index
    // ones are what a reader counts from.
    filter: isIndex,
    layout: {
      visibility: visibility(),
      // Text follows the contour rather than sitting beside a point on it.
      "symbol-placement": "line",
      // round + to-string, NOT number-format: number-format is locale-aware
      // and renders 1300 as "1,300" in most locales, which is not how a
      // height is written on a map. round because gdal_contour writes doubles
      // and "1300.0000000000002 m" is the alternative.
      "text-field": [
        "concat",
        ["to-string", ["round", elevation]],
        labelSuffix,
      ],
      "text-font": labelFont as string[],
      "text-size": labelSize,
      // Follows a bend up to this much and then drops the label rather than
      // bending text through a hairpin. Generous, because terrain bends the
      // projected line further than the flat map does.
      "text-max-angle": labelMaxAngle,
      // Along the line, repeating, so a long contour is identifiable wherever
      // you look at it rather than only at one end.
      //
      // A plain number, and it can be: symbol-spacing is measured in TILE
      // pixels, and a GeoJSON source is tiled at the display zoom, so a tile
      // pixel IS a screen pixel here. On the overzoomed vector tiles the same
      // number meant 6400 screen pixels at z14 — a label every few screenfuls.
      "symbol-spacing": labelSpacing,
      // Rotates with the map, so the height runs along its own contour.
      "text-rotation-alignment": "map",
      // Draped flat rather than billboarded upright, which is what a paper
      // topo sheet does. Either works now that the elevation resolves.
      "text-pitch-alignment": labelPitchAlignment,
      "text-allow-overlap": labelAllowOverlap,
      "text-padding": 4,
      // text-optional is deliberately NOT set. It only means anything beside
      // an icon-image — "draw the icon even if the text will not fit" — and
      // this layer has no icon, so at best it says nothing and at worst it
      // lets the placement drop a symbol that has nothing else to show.
    },
    paint: {
      "text-color": labelColour,
      // A halo, because a contour label sits on the line it belongs to.
      "text-halo-color": "rgba(255, 255, 255, 0.85)",
      "text-halo-width": 1.5,
    },
  });

  /**
   * The layer ids a cell owns, whether or not they were added yet.
   *
   * Derived rather than recorded, so cleanup covers a cell that failed
   * halfway: a list built up as layers are added cannot remove the ones it
   * never got to.
   */
  const cellLayerIds = (cellKeyName: string): string[] =>
    layerSpecs(cellKeyName, `${id}-${cellKeyName}`).map(
      (spec) => spec.id as string,
    );

  const removeCellLayers = (map: ExtensionMap, cellKeyName: string): void => {
    for (const layerId of cellLayerIds(cellKeyName)) {
      if (map.getLayer(layerId)) {map.removeLayer(layerId);}
    }
  };

  /**
   * Copy the index contours of the loaded cells into the label source.
   *
   * Debounced, because a zoom fires a stream of events and this walks every
   * loaded feature. Capped, because a wide view of dense terrain can hold tens
   * of thousands of contour pieces and the labels only ever place a handful of
   * them — the cap costs a few labels at the edge of a huge view and saves
   * copying geometry nobody sees.
   */
  const refreshLabels = (map: ExtensionMap): void => {
    if (!labels) {return;}
    if (labelRefresh) {clearTimeout(labelRefresh);}

    labelRefresh = setTimeout(() => {
      labelRefresh = null;
      const source = map.getSource(labelSourceId) as
        | { setData?: (data: unknown) => void }
        | undefined;
      if (!source?.setData) {return;}

      const query = (
        map as {
          querySourceFeatures?: (
            id: string,
            params: { sourceLayer: string; filter?: unknown },
          ) => unknown[];
        }
      ).querySourceFeatures;
      if (typeof query !== "function") {return;}

      // Written under the configured name, or under "elev" — which is in the
      // coalesce the label expression already reads, so one expression serves
      // both the vector tiles and this source.
      const configured = options.elevationProperty ?? store.elevationProperty;
      const read = configured ? [configured] : ELEVATION_PROPERTIES;
      const write = configured ?? "elev";
      const collected: unknown[] = [];
      for (const cell of cells.values()) {
        if (!map.getSource(cell.sourceId)) {continue;}
        // The filter runs in MapLibre, so only index contours come back.
        const found = query.call(map, cell.sourceId, {
          sourceLayer,
          filter: isIndex,
        });
        collected.push(...found);
      }

      source.setData(
        labelFeatures(collected, LABEL_FEATURE_LIMIT, read, write),
      );
    }, LABEL_REFRESH_MS);
  };

  /** Attach one cell: its own archive, its own source, its own layers. */
  const addCell = async (
    map: ExtensionMap,
    col: number,
    row: number,
  ): Promise<void> => {
    const key = cellKey(col, row);
    if (cells.has(key)) {return;}

    const bounds = cellBounds(grid, col, row);
    const path = store.pathTemplate.replace("{cell}", key);
    const sourceId = `${id}-${key}`;

    const cell: Cell = {
      key,
      sourceId,
      handle: null,
      abandoned: false,
    };
    // Registered before the await, so a second view change cannot start the
    // same cell twice.
    cells.set(key, cell);

    let handle: TileSourceHandle;
    try {
      handle = await createTileSource({
        protocol: `${id}-${key}`,
        store: {
          kind: "fixed-grid",
          datasetRid: store.datasetRid,
          // One archive for every zoom it is asked for: this store IS one
          // file. The grid of per-zoom cells that a chunked basemap needs is
          // empty here, and the bbox keeps a tile outside the cell unanswered.
          singleFileMaxZoom: store.archiveZoom,
          singleFilePath: path,
          bbox: {
            minLon: bounds.west,
            minLat: bounds.south,
            maxLon: bounds.east,
            maxLat: bounds.north,
          },
          grid: {},
          maxZoom: store.archiveZoom,
          // Never called: every zoom this store serves is at or below
          // singleFileMaxZoom, so the resolver answers with singleFilePath and
          // never reaches the per-zoom grid this names a file in. Required by
          // the type, so it returns the only file there is.
          fileName: () => path,
        },
      });
    } catch (err) {
      cells.delete(key);
      // One cell of contours, not the map. A missing archive is ordinary: the
      // dataset covers land the DEM covers, and the sea has no contours.
      console.warn(
        `[decho-elevation] contourTiles could not open ${path}; that cell has ` +
          "no contours. The rest of the map is unaffected.",
        err,
      );
      return;
    }

    if (cell.abandoned || !attached) {
      // Panned away while the archive was opening.
      if (host) {handle.unregister(host);}
      cells.delete(key);
      return;
    }

    cell.handle = handle;
    if (host) {handle.register(host);}

    try {
      // Clear anything left over before adding. A cell dropped while its
      // archive was opening, or a hot reload, can leave the source or some of
      // its layers in the style — and addSource/addLayer THROW on a duplicate
      // id. That threw halfway through the loop below, which left the cell
      // with its line layers and no label layer until the next pan: lines
      // that come back without their heights.
      removeCellLayers(map, key);
      if (map.getSource(sourceId)) {map.removeSource(sourceId);}

      map.addSource(sourceId, {
        type: "vector",
        tiles: [handle.tileUrl],
        // The zooms the archive actually holds; MapLibre overzooms above the
        // top of that, free for vector geometry, and requests nothing below
        // the bottom of it.
        minzoom: archiveMinZoom,
        maxzoom: store.archiveZoom,
        // Clipped archives, so this is exact rather than a hint: it stops
        // MapLibre asking for tiles the archive does not hold.
        bounds: [bounds.west, bounds.south, bounds.east, bounds.north],
      });

      // Under the label layer when there is one, so the heights are never
      // buried by a line drawn after them; otherwise at the anchor.
      const before = map.getLayer(labelLayerId)
        ? labelLayerId
        : anchorLayerId(map);
      for (const spec of layerSpecs(key, sourceId)) {
        map.addLayer(spec, before);
      }
    } catch (err) {
      // Loud, because the symptom is contours that are simply absent for one
      // cell and nothing else says why.
      console.warn(
        `[decho-elevation] contourTiles could not attach cell ${key}; it will ` +
          "be retried on the next pan.",
        err,
      );
      dropCell(map, key);
    }
  };

  const dropCell = (map: ExtensionMap, key: string): void => {
    const cell = cells.get(key);
    if (!cell) {return;}
    cell.abandoned = true;
    cells.delete(key);
    wantedAt.delete(key);

    removeCellLayers(map, key);
    if (map.getSource(cell.sourceId)) {map.removeSource(cell.sourceId);}
    if (cell.handle) {
      cell.handle.cancelPrefetch();
      if (host) {cell.handle.unregister(host);}
    }
  };

  /**
   * Which cells the view wants, nearest the centre first.
   *
   * Sorted so that the budget, when it bites, refuses the corner of the screen
   * rather than the middle of it.
   */
  const wantedCells = (
    zoom: number,
    view: { west: number; south: number; east: number; north: number },
  ): Array<{ col: number; row: number }> => {
    if (zoom < floor) {return [];}
    const centreLon = (view.west + view.east) / 2;
    const centreLat = (view.south + view.north) / 2;

    return cellsInBounds(grid, view, ring)
      .map((cell) => {
        const bounds = cellBounds(grid, cell.col, cell.row);
        return {
          ...cell,
          distance: Math.hypot(
            (bounds.west + bounds.east) / 2 - centreLon,
            (bounds.north + bounds.south) / 2 - centreLat,
          ),
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxCells);
  };

  /**
   * Attach what the view wants; evict only when over budget.
   *
   * WHY NOT "DROP WHAT IS OFF SCREEN", WHICH IS WHAT THIS USED TO DO. Because
   * an off-screen cell costs almost nothing to keep — its source `bounds` stop
   * MapLibre asking for tiles and its layers have nothing on screen to draw —
   * while tearing one down and building it again costs a PMTiles header read, a
   * protocol registration and a re-parse of every tile. Panning a little way
   * out of a cell and back therefore made the contours blink out and return a
   * beat later, for no saving at all.
   *
   * So visibility decides what to ADD, and the budget decides what to REMOVE,
   * least-recently-wanted first. A cell the view keeps asking for is touched
   * every sync and cannot be evicted while anything staler is attached.
   */
  const sync = (map: ExtensionMap): void => {
    const view = map.getBounds();
    const wanted = wantedCells(map.getZoom(), {
      west: view.getWest(),
      south: view.getSouth(),
      east: view.getEast(),
      north: view.getNorth(),
    });

    for (const cell of wanted) {
      const key = cellKey(cell.col, cell.row);
      wantedAt.set(key, ++tick);
      void addCell(map, cell.col, cell.row);
    }

    // Below the floor nothing is wanted, and there is no reason to hold cells
    // for a view that cannot show them.
    if (wanted.length === 0) {
      for (const key of [...cells.keys()]) {dropCell(map, key);}
      return;
    }

    if (cells.size <= maxCells) {return;}

    const stalest = [...cells.keys()].sort(
      (a, b) => (wantedAt.get(a) ?? 0) - (wantedAt.get(b) ?? 0),
    );
    for (const key of stalest.slice(0, cells.size - maxCells)) {
      dropCell(map, key);
    }
  };

  /**
   * Say so when an archive loads and the configured layer holds nothing.
   *
   * The layer name is tippecanoe's `-l`, or the input file's basename when it
   * was not passed, and getting it wrong renders exactly nothing with no error
   * anywhere. This turns that into one line naming what the archive actually
   * contains.
   */
  const probe = (map: ExtensionMap, sourceId: string): void => {
    if (warnedEmpty) {return;}
    const query = (
      map as {
        querySourceFeatures?: (
          id: string,
          params: { sourceLayer: string },
        ) => unknown[];
      }
    ).querySourceFeatures;
    if (typeof query !== "function") {return;}

    const features = query.call(map, sourceId, { sourceLayer });
    if (features.length > 0) {
      const properties = (features[0] as { properties?: Record<string, unknown> })
        .properties;
      const keys = Object.keys(properties ?? {});
      const known = ELEVATION_PROPERTIES;
      const property =
        options.elevationProperty ??
        store.elevationProperty ??
        known.find((k) => keys.includes(k));

      if (!property) {
        warnedEmpty = true;
        console.warn(
          `[decho-elevation] contourTiles found features in "${sourceLayer}" but ` +
            `none of ${known.join(", ")} among their properties (${keys.join(", ")}). ` +
            "Pass elevationProperty, or the lines will all be drawn as index " +
            "contours labelled 0.",
        );
        return;
      }

      // The archives know their own interval and this extension does not, so
      // measure it: the smallest gap between adjacent contour heights in the
      // tiles that are loaded. If the index interval is not a multiple of it,
      // the index lines and their labels land on elevations the data does not
      // contain — which looks like contours that lose their labels at some
      // zooms and is the hardest version of this to diagnose by eye.
      const observed = smallestGap(features, property);
      if (observed && indexInterval % observed !== 0) {
        warnedEmpty = true;
        console.warn(
          `[decho-elevation] contourTiles measured a contour interval of about ` +
            `${observed} m, which does not divide the index interval of ` +
            `${indexInterval} m — so index contours and their labels will be ` +
            `sparse or absent. Pass sourceInterval: ${observed} to have both ` +
            "snapped to intervals the data has, or set indexInterval to a " +
            "multiple of it.",
        );
      }
      return;
    }

    warnedEmpty = true;
    console.warn(
      `[decho-elevation] contourTiles loaded an archive but found no features in ` +
        `the vector layer "${sourceLayer}". That name comes from tippecanoe's -l ` +
        "flag, or from the input file's basename when it was omitted — check it " +
        "with `pmtiles show`, then pass sourceLayer.",
    );
  };

  return {
    id,

    get visible() {
      return shown;
    },

    get attachedCells() {
      return [...cells.keys()];
    },

    setVisible(next) {
      if (next === shown) {return;}
      shown = next;
      const map = attached;
      if (!map) {return;}
      for (const cell of cells.values()) {
        for (const layerId of cellLayerIds(cell.key)) {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", visibility());
          }
        }
      }
      if (map.getLayer(labelLayerId)) {
        map.setLayoutProperty(labelLayerId, "visibility", visibility());
      }
    },

    /**
     * Nothing. Every source here is view-dependent, so there is nothing to
     * declare before the map exists — which is the one place this extension
     * departs from the others in the estate.
     */
    style(): StyleContribution {
      return {};
    },

    attach(map, ctx) {
      attached = map;
      host = ctx.maplibregl;

      // The label source and layer exist for the life of the attachment, and
      // are fed from whichever cells happen to be loaded. One source rather
      // than one per cell because a contour crossing a cell boundary should be
      // labelled as one line, and because MapLibre tiles GeoJSON at the
      // display zoom — which is the whole reason the labels are here and not
      // on the vector tiles. See the note at the top of the file.
      if (labels) {
        try {
          if (map.getLayer(labelLayerId)) {map.removeLayer(labelLayerId);}
          if (map.getSource(labelSourceId)) {map.removeSource(labelSourceId);}

          map.addSource(labelSourceId, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer(labelLayerSpec(), anchorLayerId(map));
        } catch (err) {
          console.warn(
            "[decho-elevation] contourTiles could not add its label layer; the " +
              "contours will be drawn without their heights.",
            err,
          );
        }
      }

      const onViewChange = () => {
        sync(map);
        refreshLabels(map);
      };
      const onSourceData = (event: {
        sourceId?: string;
        isSourceLoaded?: boolean;
      }) => {
        if (
          event?.isSourceLoaded &&
          event.sourceId &&
          event.sourceId.startsWith(`${id}-`) &&
          event.sourceId !== labelSourceId
        ) {
          probe(map, event.sourceId);
          // A cell's tiles have arrived, so there are features to label that
          // were not there when the view last changed.
          refreshLabels(map);
        }
      };

      map.on("moveend", onViewChange);
      map.on("zoomend", onViewChange);
      map.on("sourcedata", onSourceData);
      sync(map);

      return () => {
        map.off("moveend", onViewChange);
        map.off("zoomend", onViewChange);
        map.off("sourcedata", onSourceData);
        if (labelRefresh) {
          clearTimeout(labelRefresh);
          labelRefresh = null;
        }
        for (const key of [...cells.keys()]) {dropCell(map, key);}
        if (map.getLayer(labelLayerId)) {map.removeLayer(labelLayerId);}
        if (map.getSource(labelSourceId)) {map.removeSource(labelSourceId);}
        attached = null;
        host = null;
      };
    },
  };
}
