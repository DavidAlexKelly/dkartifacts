/**
 * Operational overlays over the archive's own tiles.
 *
 * Three extensions, none of which needs a dataset, a download or a dependency:
 * every property they filter on is already in the vector tiles the basemap is
 * fetching anyway. Same argument as buildings3d, and the same shape.
 *
 *   wetGaps()     water as an obstacle, graded by what it takes to cross
 *   chokePoints() bridges and tunnels — where a route depends on one structure
 *   going()       landuse as trafficability and concealment
 *
 * WHY THESE THREE
 * ---------------
 * They answer questions this estate already asks elsewhere and answers with
 * more expensive machinery. The pathfinding graphs rasterise water to decide
 * what is impassable; @acc/decho-elevation derives slope to decide what is
 * trafficable. These do the cheap half of the same job in the style, where it
 * is visible while a plan is being drawn rather than only when a route comes
 * back.
 *
 * A NOTE ON WHAT THE ROUTER DOES NOT KNOW
 * ---------------------------------------
 * The Pathfinding dataset's meta.json lists its impassable kinds: basin,
 * building, building_part, canal, ditch, dock, drain, lake, ocean, playa,
 * reservoir, river, riverbank, stream, water. There is no `wetland` and no
 * `glacier` in that list, and both are landuse kinds this schema carries — so
 * a route will cross a marsh or an icefield without comment. `going()` draws
 * them, which at least makes the gap visible; closing it belongs in the graph
 * build, not here.
 *
 * VISIBILITY IS IMPERATIVE, FOR THE REASON buildings3d IS
 * ------------------------------------------------------
 * A MapLibre style is assembled once. Toggling an overlay by rebuilding the map
 * throws away every downloaded tile, the camera and anything a host hung off
 * the instance — so the layers are always contributed and `setVisible` flips
 * one layout property each.
 */
import type {
  BasemapExtension,
  ExtensionContext,
  ExtensionMap,
  StyleContribution,
} from "./extensions";

// Layer specifications are `any` for the reason StyleFragment.sources is: core
// does not import maplibre-gl, so it cannot name LayerSpecification, and
// MapLibre validates the assembled style at construction.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OverlayOptions {
  /** Extension id, and the prefix for every layer it contributes. */
  id?: string;
  /** Whether it starts visible. The layers are contributed either way. */
  visible?: boolean;
  /** Insertion anchor. Defaults to "labels" — under them, over the ground. */
  before?: string | "labels";
  /** Lowest zoom the overlay draws at. */
  minZoom?: number;
  /** Source-layer name, if an archive uses something other than the default. */
  sourceLayer?: string;
}

export interface OverlayExtension extends BasemapExtension {
  readonly visible: boolean;
  /** Show or hide on a live map. One layout property per layer, no restyle. */
  setVisible(visible: boolean): void;
  readonly layerIds: readonly string[];
}

/**
 * The shared half of all three: contribute layers, remember whether they are
 * shown, and flip them on a live map.
 *
 * Written once because three copies of this would be three chances to forget
 * that a toggle must not remount the map.
 */
function createOverlay(
  id: string,
  build: (ctx: ExtensionContext) => any[],
  options: OverlayOptions,
): OverlayExtension {
  let visible = options.visible ?? true;
  let attached: ExtensionMap | null = null;
  let layerIds: string[] = [];

  const apply = (map: ExtensionMap) => {
    for (const layerId of layerIds) {
      if (!map.getLayer(layerId)) {
        continue;
      }
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    }
  };

  return {
    id,

    get visible() {
      return visible;
    },

    get layerIds() {
      return layerIds;
    },

    setVisible(next) {
      if (next === visible) {
        return;
      }
      visible = next;
      if (attached) {
        apply(attached);
      }
    },

    style(ctx): StyleContribution {
      const layers = build(ctx).map((layer) => ({
        ...layer,
        ...(options.minZoom !== undefined ? { minzoom: options.minZoom } : {}),
        layout: {
          ...(layer.layout ?? {}),
          visibility: visible ? "visible" : "none",
        },
      }));
      layerIds = layers.map((layer) => layer.id as string);
      return { layers, before: options.before ?? "labels" };
    },

    attach(map) {
      attached = map;
      apply(map);
      return () => {
        attached = null;
      };
    },
  };
}

// ── 1. Wet gaps ─────────────────────────────────────────────────────────────

export interface WetGapsOptions extends OverlayOptions {
  /** Colour for water that is a real obstacle. */
  colour?: string;
  /** Colour for ditches and drains — an inconvenience, not a gap. */
  minorColour?: string;
  width?: number;
}

/**
 * Water, graded by what it takes to cross.
 *
 * `kind_detail` is the useful field and almost nobody styles it: a ditch, a
 * canal and a river are all `kind: water` and are three completely different
 * problems. A canal has revetted banks and no ford anywhere along it; a ditch
 * is a step.
 *
 * `intermittent` is the one worth having and the one no basemap shows. A wadi
 * is a linear obstacle in spring and nothing in August, and the tiles have
 * known which all along — it is drawn dashed here, because a dashed line is
 * how every map in the world says "sometimes".
 */
export function wetGaps(options: WetGapsOptions = {}): OverlayExtension {
  const id = options.id ?? "wet-gaps";
  const source = options.sourceLayer ?? "water";
  const major = options.colour ?? "#2f6f9f";
  const minor = options.minorColour ?? "#7fa8c4";
  const width = options.width ?? 2.4;

  const isIntermittent: any = ["==", ["get", "intermittent"], true];
  const majorKinds: any = [
    "match",
    ["get", "kind_detail"],
    ["river", "riverbank", "canal"],
    true,
    false,
  ];

  const areaFilter: any = [
    "match",
    ["get", "kind_detail"],
    ["reservoir", "riverbank", "basin", "dock"],
    true,
    false,
  ];
  return createOverlay(
    id,
    (ctx) => [
      // Polygonal water first: a riverbank or a reservoir is an area, and the
      // line layers below draw the ones the archive holds as lines.
      {
        id: `${id}-area`,
        type: "fill",
        source: ctx.basemapSourceId,
        "source-layer": source,
        filter: areaFilter,
        paint: { "fill-color": major, "fill-opacity": 0.35 },
      },
      {
        id: `${id}-major`,
        type: "line",
        source: ctx.basemapSourceId,
        "source-layer": source,
        filter: ["all", majorKinds, ["!", isIntermittent]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": major, "line-width": width },
      },
      {
        id: `${id}-intermittent`,
        type: "line",
        source: ctx.basemapSourceId,
        "source-layer": source,
        filter: ["all", majorKinds, isIntermittent],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": major,
          "line-width": width,
          "line-dasharray": [3, 2],
        },
      },
      {
        id: `${id}-minor`,
        type: "line",
        source: ctx.basemapSourceId,
        "source-layer": source,
        filter: ["match", ["get", "kind_detail"], ["ditch", "drain", "stream"], true, false],
        paint: { "line-color": minor, "line-width": Math.max(1, width - 1.2) },
      },
    ],
    options,
  );
}

// ── 2. Choke points ─────────────────────────────────────────────────────────

export interface ChokePointsOptions extends OverlayOptions {
  colour?: string;
  /** Halo drawn under a bridge so it reads against the road beneath it. */
  casingColour?: string;
  width?: number;
}

/**
 * Bridges and tunnels: where a route depends on one structure.
 *
 * Probably the highest value per line in the whole schema. A plan that crosses
 * a river crosses it *at a bridge*, and that bridge is the plan's single point
 * of failure — but on a normal basemap it is drawn exactly like the road either
 * side of it, so it is invisible precisely when it matters. `is_bridge` and
 * `is_tunnel` are booleans already on every road feature.
 *
 * Drawn as a casing plus a line so a bridge reads against the road under it,
 * and tunnels dashed because a tunnel is a crossing you cannot see or interdict
 * the same way.
 */
export function chokePoints(options: ChokePointsOptions = {}): OverlayExtension {
  const id = options.id ?? "choke-points";
  const source = options.sourceLayer ?? "roads";
  const colour = options.colour ?? "#e0a33c";
  const casing = options.casingColour ?? "#3a2c10";
  const width = options.width ?? 5;

  return createOverlay(
    id,
    (ctx) => [
      {
        id: `${id}-bridge-casing`,
        type: "line",
        source: ctx.basemapSourceId,
        "source-layer": source,
        filter: ["==", ["get", "is_bridge"], true],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": casing, "line-width": width + 3 },
      },
      {
        id: `${id}-bridge`,
        type: "line",
        source: ctx.basemapSourceId,
        "source-layer": source,
        filter: ["==", ["get", "is_bridge"], true],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": colour, "line-width": width },
      },
      {
        id: `${id}-tunnel`,
        type: "line",
        source: ctx.basemapSourceId,
        "source-layer": source,
        filter: ["==", ["get", "is_tunnel"], true],
        paint: {
          "line-color": colour,
          "line-width": width - 1,
          "line-dasharray": [2, 2],
          "line-opacity": 0.8,
        },
      },
    ],
    options,
  );
}

// ── 3. Going and concealment ────────────────────────────────────────────────

export interface GoingOptions extends OverlayOptions {
  opacity?: number;
  /** Override any of the per-kind colours. */
  colours?: Partial<Record<string, string>>;
}

/**
 * Trafficability and concealment, from `landuse.kind`.
 *
 * One field carries a going map and a concealment map at once: forest is slow
 * going with cover, bare rock is fast with none, wetland is neither. The
 * palette below is deliberately desaturated — this is background a plan is
 * drawn over, not the subject.
 *
 * READ THE CENSUS BEFORE TRUSTING THIS. The obvious layer for it is
 * `landcover`, and `landcover` is z0–z7 only, so an archive cut at z12 has none
 * at any zoom a planner uses. `landuse` carries the same kinds at all zooms,
 * which is why this reads that — but whether a given archive populated it is a
 * question for `describeSourceLayer`.
 */
export const GOING_COLOURS: Record<string, string> = {
  // Slow going, good concealment.
  forest: "#2f5d3a",
  wood: "#2f5d3a",
  scrub: "#5c7444",
  orchard: "#4e6b3c",
  nature_reserve: "#4e6b3c",
  // Open, fast, exposed.
  farmland: "#95b350",
  meadow: "#7f8f5c",
  grass: "#7f8f5c",
  grassland: "#7f8f5c",
  golf_course: "#7f8f5c",
  garden: "#7f8f5c",
  sand: "#a89464",
  bare_rock: "#8a8a8a",
  // Hazard or effectively impassable — and NOT in the router's impassable
  // list, which is the point of drawing them.
  wetland: "#4f9c8e",
  glacier: "#cfe3ea",
  // Built-up: urban terrain, its own problem entirely.
  residential: "#d4d2d2",
  industrial: "#d4d2d2",
  commercial: "#d4d2d2",
  military: "#d4d2d2",
  urban_area: "#d4d2d2",
};

export function going(options: GoingOptions = {}): OverlayExtension {
  const id = options.id ?? "going";
  const source = options.sourceLayer ?? "landuse";
  const colours = { ...GOING_COLOURS, ...options.colours };

  // One layer with a match expression, not a layer per kind: sixteen layers
  // over one source-layer is sixteen draw passes for a single fill.
  const colourExpression: any = [
    "match",
    ["get", "kind"],
    ...Object.entries(colours).flatMap(([kind, colour]) => [kind, colour]),
    "transparent",
  ];

  const kindFilter: any = ["match", ["get", "kind"], Object.keys(colours), true, false];
  return createOverlay(
    id,
    (ctx) => [
      {
        id: `${id}-fill`,
        type: "fill",
        source: ctx.basemapSourceId,
        "source-layer": source,
        filter: kindFilter,
        paint: {
          "fill-color": colourExpression,
          "fill-opacity": options.opacity ?? 0.45,
        },
      },
    ],
    options,
  );
}
