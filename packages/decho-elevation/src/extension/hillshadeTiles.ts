/**
 * hillshadeTiles() — relief that was shaded before it got here.
 *
 *   <DechoBasemap extensions={[hillshadeTiles()]} />
 *
 * One 8-bit GeoTIFF per DEM cell from `gdaldem hillshade`, on the same grid and
 * with the same names as the elevation chunks. The alternative already in this
 * package is `elevation({ hillshade: true })`, where MapLibre computes the
 * shading itself from the raster-dem source. Both are worth having:
 *
 *   elevation({ hillshade })  no second dataset, and the light is a paint
 *                             property — azimuth and exaggeration can change
 *                             without re-rendering a tile.
 *   hillshadeTiles()          a picture somebody chose: whatever azimuth,
 *                             altitude, z-factor or multidirectional bake GDAL
 *                             was asked for, with no gradient arithmetic per
 *                             frame and no DEM needed on the client at all.
 *
 * WHY THIS IS TWENTY LINES AND contourTiles IS THREE HUNDRED
 * ----------------------------------------------------------
 * Because it is a RASTER on the cell grid, and the DEM pipeline already serves
 * exactly that. `createDemSource` reprojects as a GATHER — every output pixel
 * asks whichever cell contains its longitude and latitude — so a tile
 * straddling four cells is seamless by construction, and one MapLibre source
 * covers the world.
 *
 * The contours could not do that: they are vector tiles clipped per cell, and
 * a vector tile can only come from one archive, so they need a source per
 * visible cell. Same dataset shape, same grid, completely different plumbing —
 * and the difference is raster versus vector, not anything about the data.
 *
 * So this reuses the GeoTIFF decoder, the Mercator resampler, the cell cache,
 * the PNG encoder, the custom protocol, the byte layer underneath it and the
 * z9 load floor. All that is new is the renderer.
 */

import type {
  BasemapExtension,
  ExtensionContext,
  ExtensionMap,
  StyleContribution,
} from "@acc/decho-basemap";

import { defaultHillshadeStore } from "../core/defaults.js";
import {
  createDemSource,
  type DemSourceHandle,
  type DemSourceOptions,
} from "../core/demSource.js";
import {
  shadedReliefTile,
  type ShadedReliefOptions,
} from "../core/renderers.js";

export interface HillshadeTilesOptions
  extends Omit<DemSourceOptions, "tiles">,
    ShadedReliefOptions {
  /** Extension id, and the prefix of its source, layer and protocol ids. */
  id?: string;
  /** Raster layer opacity, on top of the renderer's own strengths. */
  opacity?: number;
  /** Where the layer goes. "labels" by default — over the ground, under text. */
  before?: string | "labels" | "ground";
  visible?: boolean;
}

export interface HillshadeTilesExtension extends BasemapExtension {
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  /** Null until the map has been built. */
  readonly source: DemSourceHandle | null;
}

export function hillshadeTiles(
  options: HillshadeTilesOptions = {},
): HillshadeTilesExtension {
  const id = options.id ?? "hillshade-tiles";
  const sourceId = `${id}-raster`;
  const layerId = `${id}-layer`;

  let source: DemSourceHandle | null = null;
  let host: ExtensionContext["maplibregl"] | null = null;
  let attached: ExtensionMap | null = null;
  let shown = options.visible ?? true;

  return {
    id,

    get visible() {
      return shown;
    },

    get source() {
      return source;
    },

    setVisible(next) {
      if (next === shown) {return;}
      shown = next;
      if (attached?.getLayer(layerId)) {
        attached.setLayoutProperty(
          layerId,
          "visibility",
          shown ? "visible" : "none",
        );
      }
    },

    async style(ctx): Promise<StyleContribution> {
      try {
        source = await createDemSource({
          store: options.store ?? defaultHillshadeStore(),
          codecs: options.codecs,
          tileSize: options.tileSize,
          maxZoom: options.maxZoom,
          minZoom: options.minZoom,
          cellBudgetBytes: options.cellBudgetBytes,
          tiles: {
            [sourceId]: shadedReliefTile({
              neutral: options.neutral,
              shadow: options.shadow,
              highlight: options.highlight,
              shadowColour: options.shadowColour,
              highlightColour: options.highlightColour,
            }),
          },
        });
      } catch (err) {
        // The same bargain elevation() makes, and for the same reason: by far
        // the likeliest failure is a 403 because this is yet another dataset
        // to list under Resources in Developer Console. Losing the relief is
        // correct; losing the map is not.
        console.error(
          `[decho-elevation] hillshadeTiles ("${id}") could not open its store, ` +
            "so the map will have no baked relief. The usual cause is the " +
            "hillshade dataset not being listed under Resources on the app in " +
            "Developer Console — it is a separate dataset from the DEM.",
          err,
        );
        return {};
      }

      host = ctx.maplibregl;
      source.register(ctx.maplibregl);

      // minzoom on both source and layer, for the reason elevation() gives:
      // below a source's minzoom MapLibre requests no tiles at all, and one
      // tile at a low zoom fans out to every 2° cell it covers.
      const zoomRange = { minzoom: source.minZoom, maxzoom: source.maxZoom };

      return {
        sources: {
          [sourceId]: {
            type: "raster",
            tiles: [source.tileUrl(sourceId)],
            tileSize: source.tileSize,
            ...zoomRange,
          },
        },
        layers: [
          {
            id: layerId,
            type: "raster",
            source: sourceId,
            minzoom: source.minZoom,
            layout: { visibility: shown ? "visible" : "none" },
            paint: {
              "raster-opacity": options.opacity ?? 1,
              // The shading is already a picture; MapLibre's own resampling of
              // it between zooms is a cross-fade of two pictures, which reads
              // as a double exposure on a hillside.
              "raster-fade-duration": 0,
            },
          },
        ],
        before: options.before ?? "labels",
      };
    },

    attach(map: ExtensionMap) {
      const current = source;
      if (!current) {return;}
      attached = map;

      // Warm the cells around the view, debounced and budgeted inside
      // prefetchAround — same as elevation().
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
        attached = null;
      };
    },
  };
}
