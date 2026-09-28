/**
 * DemCodec — chunk bytes in, HeightGrid out.
 *
 * WHY THIS IS AN INTERFACE AND NOT JUST A FUNCTION
 * ------------------------------------------------
 * The wire format for elevation is the one consequential, hard-to-reverse
 * decision in this package, and it is not settled:
 *
 *   GeoTIFF          what the Elevation dataset holds today. Nothing to
 *                    prepare, decoded here, resampled to tiles in the browser.
 *   terrain-RGB      per-cell raster PMTiles carrying terrarium-encoded tiles.
 *                    MapLibre's terrain, hillshade and maplibre-contour all
 *                    read it with no resampling at all — but it is a new
 *                    dataset and a transform to build it.
 *   raw heightfield  a fixed-size Int16 lattice per cell. Trivial to decode,
 *                    smallest code path, useless for rendering on its own.
 *
 * Everything above this interface — sampling, profiles, sight lines, tile
 * rendering — works on HeightGrid and does not care. So the format can change
 * without a rewrite, and a consumer whose chunks are LZW-compressed (which the
 * built-in reader deliberately refuses) can supply their own codec over
 * geotiff.js without waiting for this package.
 */

import { decodeGeoTiff } from "./geotiff";
import type { CellBounds } from "./grid";
import type { HeightGrid } from "./heightGrid";

export interface DemDecodeOptions {
  /** Value meaning "no data", when the chunk itself does not declare one. */
  nodata?: number;
}

export interface DemCodec {
  /** For error messages. */
  readonly name: string;
  /** Lowercase file extensions, without the dot. */
  readonly extensions: readonly string[];
  decode(
    bytes: ArrayBuffer,
    bounds: CellBounds,
    options?: DemDecodeOptions,
  ): Promise<HeightGrid>;
}

export const geotiffCodec: DemCodec = {
  name: "geotiff",
  extensions: ["tif", "tiff", "gtiff"],
  decode: (bytes, bounds, options) => decodeGeoTiff(bytes, bounds, options),
};

export const BUILT_IN_CODECS: readonly DemCodec[] = [geotiffCodec];

/**
 * The codec for a chunk path, by extension.
 *
 * Chosen by extension rather than by sniffing magic bytes because the path is
 * known before the fetch: a chunk whose extension nothing claims is a
 * configuration error worth reporting before 20 MB is downloaded to find out.
 */
export function codecForPath(
  path: string,
  codecs: readonly DemCodec[] = BUILT_IN_CODECS,
): DemCodec {
  const dot = path.lastIndexOf(".");
  const extension = dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
  const found = codecs.find((codec) => codec.extensions.includes(extension));
  if (!found) {
    throw new Error(
      `decho-elevation: no DEM codec claims ".${extension}" (chunk "${path}"). ` +
        `Known: ${codecs
          .flatMap((c) => c.extensions.map((e) => `.${e}`))
          .join(", ")}. Pass { codecs: [...] } to createDemSource.`,
    );
  }
  return found;
}
