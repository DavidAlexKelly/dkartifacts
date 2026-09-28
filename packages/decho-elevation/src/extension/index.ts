/**
 * elevation() — the @acc/decho-basemap plug-in.
 *
 *   <DechoBasemap extensions={[elevation({ terrain: true, hillshade: true })]} />
 *
 * WHAT IT CONTRIBUTES
 * -------------------
 * One `raster-dem` source, served from the DEM chunks through a MapLibre custom
 * protocol, and then whichever of these is asked for:
 *
 *   hillshade   a `hillshade` layer on that source. MapLibre computes the
 *               shading itself — direction, exaggeration, accent and highlight
 *               colours are its own paint properties, so the light can move
 *               without re-rendering a tile.
 *   terrain     the style's `terrain` key. Real 3D: the vector basemap drapes
 *               over a mesh built from the same source.
 *   tint        a hypsometric colour ramp, as a `raster` layer.
 *   slope       slope classified into mobility bands, as a `raster` layer.
 *   contours    contour lines at a zoom-chosen interval, as a `raster` layer.
 *
 * They compose: tint under hillshade under contours under slope, all under the
 * labels, which is the order that reads correctly on a topographic map —
 * colour by height, relief over it, contours read against the relief, and any
 * warning wash over all of it.
 *
 * NOTHING LOADS UNTIL ZOOM 9
 * --------------------------
 * Every source and layer carries `minzoom: source.minZoom` (9 by default), and
 * MapLibre requests no tiles at all below a source's minzoom. That is not a
 * nicety: one tile fans out to every 2° DEM cell it covers, so a world view
 * without a floor asks for thousands of 3-25 MB chunks — see demSource.ts for
 * the table.
 *
 * So zoomed out there is no relief and the terrain is flat, and the first DEM
 * chunk is fetched when the user crosses the threshold. Pass `minZoom` to move
 * it. Point sampling, profiles and sight lines are unaffected — they load the
 * one cell they need at any zoom, because the user asked for an answer.
 *
 * WHY A FAILURE HERE DOES NOT FAIL THE MAP
 * ----------------------------------------
 * The extension contract lets `style()` throw, and for a collision it should:
 * the assembled style would be wrong. This one catches its own setup failures
 * instead and contributes nothing, because the likeliest failure by a wide
 * margin is a 403 — the DEM dataset not added as a Resource on the app in
 * Developer Console, which is a different dataset from the basemap's tiles and
 * is therefore forgotten roughly every time. Losing the relief in that case is
 * correct. Losing the whole map is not.
 */

import type {
  BasemapExtension,
  ExtensionContext,
  ExtensionMap,
  StyleContribution,
} from "@acc/decho-basemap";

import {
  createDemSource,
  type DemSourceHandle,
  type DemSourceOptions,
} from "../core/demSource";
import {
  contourTile,
  hypsometricTile,
  slopeTile,
  terrariumTile,
  type ColourStop,
  type ContourOptions,
  type SlopeClass,
  type TileRenderer,
} from "../core/renderers";

export {
  contourTiles,
  contourWindows,
  labelFeatures,
  ladderWindows,
  smallestGap,
  snapIndexInterval,
  widthByZoom,
  type ContourTilesExtension,
  type ContourTilesOptions,
} from "./contourTiles";

export {
  hillshadeTiles,
  type HillshadeTilesExtension,
  type HillshadeTilesOptions,
} from "./hillshadeTiles";

export interface HillshadeOptions {
  /** 0-1. MapLibre's own default is 0.5; 0.35 sits better under labels. */
  exaggeration?: number;
  /** Degrees clockwise from north the light comes FROM. 315 is convention. */
  illuminationDirection?: number;
  shadowColour?: string;
  highlightColour?: string;
  accentColour?: string;
}

export interface TerrainOptions {
  /**
   * 1.0 is honest and looks flat, because at map scales terrain is flat.
   * 1.4 reads as relief without turning hills into spikes.
   */
  exaggeration?: number;
}

export interface TintOptions {
  stops?: readonly ColourStop[];
  /** 0-1. Below about 0.5 the basemap's own colours still dominate. */
  opacity?: number;
}

export interface SlopeOverlayOptions {
  classes?: readonly SlopeClass[];
  opacity?: number;
}

export interface ContourOverlayOptions extends ContourOptions {
  /** Raster layer opacity, on top of the renderer's own `opacity`. */
  layerOpacity?: number;
  /**
   * Zoom levels ABOVE the DEM's own maximum at which contour tiles are still
   * rendered rather than stretched. 3 by default.
   *
   * This is what keeps the lines thin. Every other layer here is a wash or a
   * shading, and stretching one is invisible; a hairline is not — above the
   * source's maxzoom MapLibre magnifies one tile pixel across four, sixteen,
   * sixty-four screen pixels, and a one-pixel contour becomes a rope.
   * Rendering at the view's own zoom instead costs no more per SCREEN pixel
   * (the same viewport, more and smaller tiles), needs no new data — the
   * resample is a bilinear gather from the DEM, so it interpolates rather than
   * blocking up — and there is no upper zoom guard in the protocol to stop it.
   */
  renderOverzoom?: number;
}

export interface ElevationExtensionOptions
  extends Omit<DemSourceOptions, "tiles"> {
  /**
   * Extension id, and the prefix for every source and layer id it contributes.
   * Change it to run two DEMs on one map — a global one and a theatre one.
   */
  id?: string;
  terrain?: boolean | TerrainOptions;
  hillshade?: boolean | HillshadeOptions;
  tint?: boolean | TintOptions;
  slope?: boolean | SlopeOverlayOptions;
  /**
   * Contour lines, at an interval taken from the tile's own zoom — 10 m at
   * z14 and above, 25 m at z12-13, 100 m below that, with every fifth line
   * drawn heavier as an index contour. Pass `interval` to fix it.
   *
   * Raster, so they cannot be labelled; see contourTile in core/renderers for
   * what that costs and what it buys.
   */
  contours?: boolean | ContourOverlayOptions;
  /** Atmosphere, worth having whenever terrain is on. */
  sky?: boolean | Record<string, unknown>;
  /** Where the layers go. Defaults to "labels" — under them, over the ground. */
  before?: string | "labels";
  /**
   * The DEM source, once it exists. This is how an application gets at
   * `heightAt`, `elevationProfile` and `lineOfSight` for the same data the map
   * is drawing, without constructing a second source.
   */
  onReady?: (source: DemSourceHandle) => void;
}

export interface ElevationExtension extends BasemapExtension {
  /** Null until the map has been built. */
  readonly source: DemSourceHandle | null;
  /** Source id of the raster-dem, for a consumer adding its own layers. */
  readonly demSourceId: string;
}

const asOptions = <T extends object>(
  value: boolean | T | undefined,
): T | null => {
  if (value === undefined || value === false) {return null;}
  return value === true ? ({} as T) : value;
};

export function elevation(
  options: ElevationExtensionOptions = {},
): ElevationExtension {
  const id = options.id ?? "elevation";
  const demSourceId = `${id}-dem`;
  const tintSourceId = `${id}-tint`;
  const slopeSourceId = `${id}-slope`;
  const contourSourceId = `${id}-contours`;

  const terrain = asOptions<TerrainOptions>(options.terrain);
  const hillshade = asOptions<HillshadeOptions>(options.hillshade);
  const tint = asOptions<TintOptions>(options.tint);
  const slope = asOptions<SlopeOverlayOptions>(options.slope);
  const contours = asOptions<ContourOverlayOptions>(options.contours);
  const sky = asOptions<Record<string, unknown>>(options.sky);

  let source: DemSourceHandle | null = null;
  let host: ExtensionContext["maplibregl"] | null = null;

  return {
    id,
    demSourceId,

    get source() {
      return source;
    },

    async style(ctx): Promise<StyleContribution> {
      const tiles: Record<string, TileRenderer> = {
        [`${id}-dem`]: terrariumTile,
      };
      if (tint) {
        tiles[`${id}-tint`] = hypsometricTile({
          stops: tint.stops,
          opacity: 1,
        });
      }
      if (slope) {
        tiles[`${id}-slope`] = slopeTile({ classes: slope.classes });
      }
      if (contours) {
        tiles[`${id}-contours`] = contourTile(contours);
      }

      try {
        source = await createDemSource({
          store: options.store,
          codecs: options.codecs,
          tileSize: options.tileSize,
          maxZoom: options.maxZoom,
          cellBudgetBytes: options.cellBudgetBytes,
          tiles,
        });
      } catch (err) {
        console.error(
          `[decho-elevation] extension "${id}" could not open its DEM store, so ` +
            "the map will have no relief. The usual cause is the DEM dataset " +
            "not being listed under Resources on the app in Developer Console " +
            "— the api:use-datasets-read scope alone returns 403.",
          err,
        );
        return {};
      }

      host = ctx.maplibregl;
      source.register(ctx.maplibregl);
      options.onReady?.(source);

      // `minzoom` is the load switch, and it belongs here rather than only in
      // the protocol handler: MapLibre's coveringTiles returns NOTHING below a
      // source's minzoom, so below the floor no tile is requested at all —
      // which is the difference between a cheap no-op and a request per tile
      // that each has to be answered. `maxzoom` makes MapLibre overzoom the
      // top level rather than ask for detail the DEM does not have.
      const zoomRange = { minzoom: source.minZoom, maxzoom: source.maxZoom };

      const sources: Record<string, unknown> = {
        [demSourceId]: {
          type: "raster-dem",
          tiles: [source.tileUrl(`${id}-dem`)],
          tileSize: source.tileSize,
          encoding: "terrarium",
          ...zoomRange,
        },
      };
      const layers: Record<string, unknown>[] = [];

      // Order is the reading order of a topographic sheet: colour by height,
      // then relief over it, then any warning wash on top of both.
      if (tint) {
        sources[tintSourceId] = {
          type: "raster",
          tiles: [source.tileUrl(`${id}-tint`)],
          tileSize: source.tileSize,
          ...zoomRange,
        };
        layers.push({
          id: `${id}-tint`,
          type: "raster",
          source: tintSourceId,
          // Layer minzoom as well as source minzoom: the source's stops the
          // fetch, the layer's stops MapLibre keeping the tiles alive for a
          // layer that would draw them at a zoom we have decided not to serve.
          minzoom: source.minZoom,
          paint: { "raster-opacity": tint.opacity ?? 0.7 },
        });
      }

      if (hillshade) {
        layers.push({
          id: `${id}-hillshade`,
          type: "hillshade",
          source: demSourceId,
          minzoom: source.minZoom,
          paint: {
            "hillshade-exaggeration": hillshade.exaggeration ?? 0.35,
            // MapLibre's illuminationDirection is the direction the light comes
            // FROM, and 315° (north-west) is the cartographic convention —
            // relief lit from anywhere south reads as inverted to most people,
            // hills becoming hollows.
            "hillshade-illumination-direction":
              hillshade.illuminationDirection ?? 315,
            "hillshade-illumination-anchor": "map",
            "hillshade-shadow-color": hillshade.shadowColour ?? "#4a4a4a",
            "hillshade-highlight-color": hillshade.highlightColour ?? "#ffffff",
            "hillshade-accent-color": hillshade.accentColour ?? "#00000000",
          },
        });
      }

      // Contours over the relief and under the warning wash: a contour is read
      // against the shading, and a no-go band is read over both.
      if (contours) {
        sources[contourSourceId] = {
          type: "raster",
          tiles: [source.tileUrl(`${id}-contours`)],
          tileSize: source.tileSize,
          ...zoomRange,
          // Deliberately NOT the DEM's maxzoom. See renderOverzoom: a
          // stretched hairline is a rope, so these tiles are rendered at the
          // zoom they are viewed at.
          maxzoom: Math.min(22, source.maxZoom + (contours.renderOverzoom ?? 3)),
        };
        layers.push({
          id: `${id}-contours`,
          type: "raster",
          source: contourSourceId,
          minzoom: source.minZoom,
          paint: {
            "raster-opacity": contours.layerOpacity ?? 1,
            // Off, and it matters more here than for the tint: MapLibre's
            // default smooths between zoom levels, and a cross-fade of two
            // contour intervals is a moiré of double lines.
            "raster-fade-duration": 0,
            "raster-resampling": "nearest",
          },
        });
      }

      if (slope) {
        sources[slopeSourceId] = {
          type: "raster",
          tiles: [source.tileUrl(`${id}-slope`)],
          tileSize: source.tileSize,
          ...zoomRange,
        };
        layers.push({
          id: `${id}-slope`,
          type: "raster",
          source: slopeSourceId,
          minzoom: source.minZoom,
          paint: { "raster-opacity": slope.opacity ?? 1 },
        });
      }

      return {
        sources,
        layers,
        before: options.before ?? "labels",
        ...(terrain
          ? {
              terrain: {
                source: demSourceId,
                exaggeration: terrain.exaggeration ?? 1.4,
              },
            }
          : {}),
        ...(sky
          ? {
              sky: {
                "sky-color": "#a8c6e8",
                "horizon-color": "#e8eef2",
                "fog-color": "#dfe6ea",
                "sky-horizon-blend": 0.6,
                "horizon-fog-blend": 0.4,
                "fog-ground-blend": 0.1,
                ...sky,
              },
            }
          : {}),
      };
    },

    attach(map: ExtensionMap) {
      const current = source;
      if (!current) {return;}

      // Warm the cells around the view, debounced inside prefetchAround. A DEM
      // cell is 3-25 MB, so this speculates by BYTES and one cell at a time —
      // see demSource.ts.
      const onViewChange = () => {
        const bounds = map.getBounds();
        current.prefetchAround(map.getZoom(), {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        });
      };

      map.on("moveend", onViewChange);
      map.on("zoomend", onViewChange);
      onViewChange();

      return () => {
        map.off("moveend", onViewChange);
        map.off("zoomend", onViewChange);
        current.cancelPrefetch();
        if (host) {current.unregister(host);}
        current.dispose();
        source = null;
      };
    },
  };
}
