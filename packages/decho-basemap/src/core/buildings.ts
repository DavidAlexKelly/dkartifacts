/**
 * buildings3d() — extruded buildings from the basemap's own tiles.
 *
 * WHY THIS IS THE CHEAPEST FEATURE IN THE STACK
 * ---------------------------------------------
 * The data is already there. The Protomaps `buildings` layer in the archive
 * this package already serves carries, per feature:
 *
 *   kind              "address" | "building" | "building_part"
 *   height            metres, when OSM knows. May be QUANTIZED at low zoom.
 *   min_height        metres, for parts that start above the ground.
 *   layer             relative ordering against other buildings
 *   addr_housenumber  for kind=address only
 *
 * `height` and `min_height` are exactly the two numbers MapLibre's
 * `fill-extrusion` wants. So this needs no new dataset, no new transform, no
 * new dependency and no bytes that are not already being downloaded — it is
 * three layers and a filter over a source that is already in the style.
 *
 * WHAT IT WILL ACTUALLY LOOK LIKE, HONESTLY
 * -----------------------------------------
 * Two properties of the archive decide that, and both are worth knowing before
 * anyone is promised a skyline:
 *
 *   1. The Protomaps schema splits buildings into two tiers: z0-14 holds
 *      MERGED buildings — adjacent and even disconnected ones fused into single
 *      polygons — and z15+ holds individual OSM buildings. A planet archive cut
 *      at z12, which this one is, therefore contains only the merged tier, and
 *      at z12 generalisation. Extruded, that reads as city-block MASSING: a
 *      block of terraced houses is one slab, not thirty houses.
 *
 *   2. MapLibre overzooms above a source's maxzoom, so at display z16 the
 *      geometry is still the z12 geometry, scaled up. More zoom does not buy
 *      more buildings.
 *
 * Massing is genuinely useful — urban terrain, dead ground, what a street can
 * see — and it is not what most people picture when they hear "3D buildings".
 * Individual footprints need the archive re-cut to z15+, which is a much larger
 * archive and a data decision, not a rendering one. `describeBuildingCoverage`
 * exists so that the answer for a given archive is measured rather than argued
 * about; the harness page prints it.
 *
 * WHY AN EXTENSION AND NOT A PROP
 * -------------------------------
 * It reads the BASEMAP's source, so it is the first thing to use
 * `ExtensionContext.basemapSourceId`, and it has to insert under the labels —
 * which is what `before: "labels"` is for. It also composes: with
 * @acc/decho-elevation's terrain on, MapLibre puts extrusions on the terrain
 * surface, so buildings stand on the hillside rather than floating at sea level.
 * A prop could not be ordered against another add-on's layers; an extension can.
 */

import type { BasemapExtension, ExtensionMap, StyleContribution } from "./extensions.js";

/* eslint-disable @typescript-eslint/no-explicit-any --
   Layer and paint specifications are `any` for the reason StyleFragment.sources
   is: core does not import maplibre-gl, so it cannot name LayerSpecification,
   and MapLibre validates the assembled style at construction. */

/** Source-layer name in the Protomaps basemaps schema. */
export const BUILDINGS_SOURCE_LAYER = "buildings";

/**
 * The flat building fill the Protomaps flavors draw, by layer id.
 *
 * Handed off to the extrusion at its floor rather than left underneath it: two
 * representations of the same footprint at the same zoom means the flat fill
 * shows as a hard edge around every extrusion where the roof does not quite
 * cover it.
 */
export const PROTOMAPS_FLAT_BUILDINGS_LAYER = "buildings";

export interface Buildings3dOptions {
  /** Extension id, and the prefix for the layer it contributes. */
  id?: string;
  /**
   * Zoom the extrusions appear at. Default 14.
   *
   * Not lower, for two reasons that both matter: the tiles carry the merged
   * tier, which at z12 is a handful of enormous polygons per city and reads as
   * grey lumps; and `fill-extrusion` is the most expensive layer type MapLibre
   * has, so drawing every building in a continent is a frame-rate decision as
   * well as a cartographic one.
   */
  minZoom?: number;
  /**
   * Metres to use when a feature has no `height`.
   *
   * Most OSM buildings have no height tag, so this is not an edge case — it is
   * the common case, and it is why an extruded OSM city looks like a car park
   * with a few towers in it. 9 m is about three storeys.
   */
  defaultHeight?: number;
  /** Multiplies every height. 1 is honest; 1.2 reads better in flat cities. */
  exaggeration?: number;
  colour?: string;
  /**
   * 0-1. Zoom-interpolated from 0 at `minZoom` so buildings rise into view
   * rather than popping — `fill-extrusion-opacity` cannot vary per feature, but
   * it can vary by zoom, which is the one thing needed here.
   */
  opacity?: number;
  /** Shade the walls darker towards the ground. MapLibre's own default. */
  verticalGradient?: boolean;
  /**
   * Draw `building_part` features as well. Default false.
   *
   * Parts are sub-volumes of a building under OSM's Simple 3D Buildings
   * scheme, and the parent building is usually present too — so drawing both
   * puts two solids in the same space and lets the depth buffer decide, which
   * it does differently every frame. Turn this on for a city that has been
   * mapped in 3D properly, and expect z-fighting anywhere it has not.
   */
  includeParts?: boolean;
  /**
   * Whether the extrusions start visible. Default true.
   *
   * The layer is contributed either way; this only sets its initial
   * `visibility`. See `setVisible` for why.
   */
  visible?: boolean;
  /** Insertion anchor. Default "labels" — under them, over the ground. */
  before?: string | "labels";
  /** Source-layer name, if the archive uses something other than "buildings". */
  sourceLayer?: string;
  /**
   * Layer id of the flavor's flat building fill, to hand off to at `minZoom`.
   * Pass false to leave it alone.
   */
  handOffFlatLayer?: string | false;
}

export interface Buildings3dExtension extends BasemapExtension {
  /** Layer id of the extrusion, for a consumer restyling it live. */
  readonly layerId: string;
  readonly visible: boolean;
  /**
   * Turn the extrusions on and off on a LIVE map.
   *
   * WHY THIS EXISTS RATHER THAN RECREATING THE MAP
   * ----------------------------------------------
   * A MapLibre style is assembled once, at construction, so the obvious way to
   * add or remove a layer is to rebuild the map — and rebuilding throws away
   * every downloaded tile, the drawing, the camera and any state a host has
   * hung off the map instance, for a switch a user expects to be instant.
   *
   * So the layer is ALWAYS contributed and this flips its `visibility`. A
   * hidden layer is not drawn and costs nothing: the source is the basemap's
   * own vector tiles, which are downloaded either way. Toggling is therefore
   * one layout property, no restyle, no refetch, and the flat building fill
   * hands back and forth with it so the map is a true 2D/3D switch rather than
   * two overlapping representations.
   *
   * Safe to call before the map exists — the state is remembered and applied on
   * attach.
   */
  setVisible(visible: boolean): void;
}

/**
 * Height in metres for a feature, as a MapLibre expression.
 *
 * Exported because a consumer writing their own extrusion layer — a different
 * colour ramp by height, a filter to one district — should not have to
 * rediscover that `height` is frequently missing.
 */
export function buildingHeightExpression(
  defaultHeight: number,
  exaggeration = 1,
): any {
  const height = ["coalesce", ["get", "height"], defaultHeight];
  return exaggeration === 1 ? height : ["*", exaggeration, height];
}

/** Base height in metres: where a building part starts. */
export function buildingBaseExpression(exaggeration = 1): any {
  const base = ["coalesce", ["get", "min_height"], 0];
  return exaggeration === 1 ? base : ["*", exaggeration, base];
}

export function buildings3d(
  options: Buildings3dOptions = {},
): Buildings3dExtension {
  const id = options.id ?? "buildings-3d";
  const layerId = `${id}-extrusion`;
  const minZoom = options.minZoom ?? 14;
  const defaultHeight = options.defaultHeight ?? 9;
  const exaggeration = options.exaggeration ?? 1;
  const opacity = options.opacity ?? 0.9;
  const flatLayer =
    options.handOffFlatLayer === undefined
      ? PROTOMAPS_FLAT_BUILDINGS_LAYER
      : options.handOffFlatLayer;

  let visible = options.visible ?? true;
  let attached: ExtensionMap | null = null;
  /** The flat fill's original zoom range, so the hand-off can be undone. */
  let flatRange: { min: number; max: number } | null = null;

  /**
   * Apply the current state to a live map: the extrusion's visibility, and the
   * flat fill's zoom range with it.
   *
   * Both together, because they are one decision. Hiding the extrusion without
   * giving the flat fill its zooms back leaves the map with no buildings at
   * all above the floor, which looks like the toggle broke something.
   */
  const apply = (map: ExtensionMap) => {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");

    if (!flatLayer || !flatRange) {return;}
    if (!map.getLayer(flatLayer)) {return;}
    map.setLayerZoomRange(
      flatLayer,
      flatRange.min,
      visible ? minZoom : flatRange.max,
    );
  };

  return {
    id,
    layerId,

    get visible() {
      return visible;
    },

    setVisible(next) {
      if (next === visible) {return;}
      visible = next;
      if (attached) {apply(attached);}
    },

    style(ctx): StyleContribution {
      return {
        // No sources: this reads the basemap's own vector tiles. That is what
        // ExtensionContext.basemapSourceId is for.
        layers: [
          {
            id: layerId,
            type: "fill-extrusion",
            source: ctx.basemapSourceId,
            "source-layer": options.sourceLayer ?? BUILDINGS_SOURCE_LAYER,
            minzoom: minZoom,
            // Contributed even when starting hidden, so the switch is a layout
            // property later rather than a rebuilt style. See setVisible.
            layout: { visibility: visible ? "visible" : "none" },
            filter: options.includeParts
              ? [
                  "match",
                  ["get", "kind"],
                  ["building", "building_part"],
                  true,
                  false,
                ]
              : ["==", ["get", "kind"], "building"],
            paint: {
              "fill-extrusion-color": options.colour ?? "#d7d2c8",
              "fill-extrusion-height": buildingHeightExpression(
                defaultHeight,
                exaggeration,
              ),
              "fill-extrusion-base": buildingBaseExpression(exaggeration),
              // Interpolated by zoom, not by feature: the property does not
              // support data-driven values, and fading over half a zoom level
              // is the difference between buildings growing and buildings
              // appearing.
              "fill-extrusion-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                minZoom,
                0,
                minZoom + 0.5,
                opacity,
              ],
              "fill-extrusion-vertical-gradient":
                options.verticalGradient ?? true,
            },
          },
        ],
        before: options.before ?? "labels",
      };
    },

    attach(map: ExtensionMap) {
      attached = map;

      // The flavor's flat fill exists in the host's layer list, not in this
      // extension's contribution, so it can only be adjusted once the map is
      // up. This is the case the two-phase contract was written for.
      //
      // A consumer using their own layer list legitimately has no layer by this
      // name; that is not a warning, it just means there is no hand-off to do.
      // MapLibre has no getLayerZoomRange, but the layer object carries the
      // range, so the original is recoverable for the teardown.
      const layer = flatLayer
        ? (map.getLayer(flatLayer) as
            | { minzoom?: number; maxzoom?: number }
            | undefined)
        : undefined;
      flatRange = layer
        ? { min: layer.minzoom ?? 0, max: layer.maxzoom ?? 24 }
        : null;

      apply(map);

      return () => {
        attached = null;
        // Restored, in case the map outlives this extension — a StrictMode
        // remount, or an extension list that changes.
        if (flatLayer && flatRange && map.getLayer(flatLayer)) {
          map.setLayerZoomRange(flatLayer, flatRange.min, flatRange.max);
        }
        flatRange = null;
      };
    },
  };
}

// ── Diagnostics ─────────────────────────────────────────────────────────────

/** The slice of a map `describeBuildingCoverage` needs. */
export interface QueryableMap {
  querySourceFeatures(
    sourceId: string,
    parameters?: { sourceLayer?: string; filter?: any },
  ): Array<{ properties?: Record<string, unknown> | null }>;
  getZoom(): number;
}

export interface BuildingCoverage {
  zoom: number;
  /** Features loaded for the source-layer in the tiles currently held. */
  features: number;
  /** How many carry a usable `height`. */
  withHeight: number;
  /** How many carry `min_height`, i.e. are parts starting above ground. */
  withMinHeight: number;
  /** Counts by `kind`. */
  kinds: Record<string, number>;
  /** Median of the heights that exist, metres. NaN when none do. */
  medianHeight: number;
}

/**
 * Census the building features the map currently holds.
 *
 * WHY THIS SHIPS RATHER THAN LIVING IN A SCRATCH FILE
 * ---------------------------------------------------
 * Whether extruded buildings are worth turning on for a given archive comes
 * down to two questions nobody can answer by reading: are there building
 * features at the zooms this archive serves, and do they have heights? A cut
 * that dropped the buildings layer, or one whose features are all
 * height-less, produces a uniform 9 m slab city — which looks like a bug in
 * this code and is not one.
 *
 * `querySourceFeatures` reads the tiles already in memory, so this costs
 * nothing and reports on exactly what the user is looking at.
 */
export function describeBuildingCoverage(
  map: QueryableMap,
  options: { sourceId: string; sourceLayer?: string } ,
): BuildingCoverage {
  const features = map.querySourceFeatures(options.sourceId, {
    sourceLayer: options.sourceLayer ?? BUILDINGS_SOURCE_LAYER,
  });

  const heights: number[] = [];
  const kinds: Record<string, number> = {};
  let withMinHeight = 0;

  for (const feature of features) {
    const properties = feature.properties ?? {};
    const kind = typeof properties.kind === "string" ? properties.kind : "?";
    kinds[kind] = (kinds[kind] ?? 0) + 1;

    const height = properties.height;
    if (typeof height === "number" && Number.isFinite(height) && height > 0) {
      heights.push(height);
    }
    const minHeight = properties.min_height;
    if (typeof minHeight === "number" && minHeight > 0) {withMinHeight += 1;}
  }

  heights.sort((a, b) => a - b);

  return {
    zoom: map.getZoom(),
    features: features.length,
    withHeight: heights.length,
    withMinHeight,
    kinds,
    medianHeight:
      heights.length === 0 ? NaN : heights[Math.floor(heights.length / 2)],
  };
}
