# Map data: assessment and plan

How the decho packages' Foundry data is laid out today, what is wrong with it,
and the setup to move to. The code in this folder (`terrain_gen/`) builds the
new setup locally; see [README.md](README.md) to run it.

## What is loaded today

| Data | Dataset | Format | Cut | Manifest |
|---|---|---|---|---|
| Planet basemap | `c7e99de1…` (+ media set copy `94a3…`) | PMTiles: one low-zoom archive + 2° cells at z12 | 2° grid | Yes. Cells in two shapes; `version` not bumped between them |
| Theatre basemap | `a31a2aa5…` | PMTiles | fixed bbox, a different grid | None. The cut is hardcoded in `decho-basemap/src/core/defaults.ts` |
| Glyphs + sprites | `8637f7a1…` | Protomaps assets bundle | – | – |
| DEM | `358e2e32…` | GeoTIFF per 2° cell, 3–25 MB | 2° | None. Grid and nodata hardcoded |
| Hillshade | `8622fb23…` | 8-bit GeoTIFF per cell | 2° | None |
| Contours | `b2d5b73e…` | PMTiles per cell, **z10 only, clipped at the cell edge** | 2° | None |
| Pathfinding | `35f5ccc8…` | `meta.json` + `nodes.bin` + `edges.bin` per cell | 2° | None. Per-cell `meta.json`, no index |
| Countries | transform output | GeoJSON views + `countries.json` | – | Yes, with a checked schema version |
| Events | any source | `readTable` as CSV, capped at a maximum row count | – | – |

## Problems, roughly by impact

1. **One small rebuild wipes the browser cache.** `decho-foundry-bytes` keys
   its persistent cache by the dataset's current `master` transaction
   (`src/bytes.ts:255–280`). A rebuild that changes three DEM cells makes
   every user re-download every cell. Appending cells does the same. `master`
   is hardcoded.
2. **Six datasets, five ways of describing themselves.** The basemap manifest
   has two cell shapes it can't tell apart by version, the DEM's manifest is
   optional and missing, pathfinding and contours have none, countries has a
   proper one. The facts about the data (grid origin, cell size, path
   templates, nodata, zoom ranges) live in TypeScript defaults, so code and
   data can drift apart silently. Only the DEM checks.
3. **The 2° grid exists only by agreement.** `decho-elevation/src/core/grid.ts`
   and `decho-pathfinding/src/core/grid.ts` are near-copies. Nothing checks
   that datasets agree with each other.
4. **Dataset RIDs are hardcoded everywhere.** Three packages' defaults and six
   app pages. Every dataset also needs its own Resource grant in Developer
   Console, and the READMEs call that "the most common way this package
   appears broken".
5. **Display data is stored in analysis formats.** Terrain is decoded from
   large GeoTIFFs in the browser, which forces the zoom-9 floor. Hillshade is
   a GeoTIFF too. Contours exist only at z10 and are clipped per cell, so the
   client adds one map source per visible cell to avoid gaps.
6. **Chunk size is the transfer size, and it's uneven.** Foundry ignores
   `Range`, so a read downloads the whole file. A fixed 2° cut gives 3 MB on
   the steppe and 25 MB in the Alps.
7. **The pipelines aren't in the repo.** Only countries is built by a
   transform here. Tile cutting, DEM, hillshade, contours and the pathfinding
   graphs were built elsewhere and can't be rebuilt from this repo.
8. **Leftovers.** The theatre basemap's fixed-grid format, and the basemap's
   full media-set duplicate that only serves as a fallback.

## The target setup

### 1. Two classes of data, each in the right format

**Display products** are multi-zoom PMTiles pyramids, cut into archives and
described by the manifest the basemap already reads (`gridOrigin` +
`layers[]`):

| Product | Was | Becomes |
|---|---|---|
| `basemap` | per-cell PMTiles at a fixed 2° | same, cut to a size target |
| `terrain` | browser-decoded GeoTIFFs, nothing below z9 | **Terrarium `raster-dem` pyramid, z0–z10**, drawn natively by MapLibre |
| `hillshade` | 8-bit GeoTIFF cells | transparent raster pyramid (optional: MapLibre can shade `terrain` itself) |
| `contours` | z10-only, clipped per cell | **one vector pyramid z8–z12** with labelled index lines; complete tiles across cell edges |

**Analysis products** stay on the 2° lat/lon grid, because analysis needs raw
values and the pathfinding graphs are cut on that grid:

| Product | Change |
|---|---|
| `dem-cells` | Same files and names as today, plus the manifest it never had |
| pathfinding | Unchanged for now (see "Not covered") |

### 2. One manifest format

Every dataset has a `manifest.json` at its root. It is a **superset** of what
the packages read today, so it is readable without TypeScript changes:

```jsonc
{
  "schema": "decho-layer/1",
  "id": "terrain", "kind": "raster-dem",      // raster | vector-tiles | dem-cells | assets
  "title": "…", "attribution": "…",
  "bounds": [w, s, e, n],
  "encoding": { "tileType": "webp", "rasterDem": "terrarium", "tileSize": 256 },
  "provenance": { "source": "dem-cells", "generator": "terrain-gen 0.1.0",
                  "generatedAt": "…", "parameters": { … } },

  // pyramid products: the GlobeManifest shape decho-basemap reads
  "version": 2,
  "gridOrigin": { "lon": -180, "lat": 85 },
  "layers": [
    { "id": "z0-z9", "type": "single", "path": "z0-z9.pmtiles", "bytes": …, "sha256": "…" },
    { "id": "z10", "type": "grid", "cellDeg": 4, "pathTemplate": "z10/c{col}_r{row}.pmtiles",
      "cells": [ { "col": 46, "row": 5, "bytes": …, "sha256": "…" } ] }
  ]

  // dem-cells instead: the DemManifest shape decho-elevation reads
  // "gridOrigin", "cellDeg", "pathTemplate": "{cell}.tif",
  // "cells": [{ col, row, bytes, sha256, min, max, bounds }], "dem": { source, verticalDatum, nodata }
}
```

Every file listed carries `bytes` and `sha256`.

### 3. Cache by content hash

With hashes in the manifest, `decho-foundry-bytes` can key its Cache Storage
entries by `sha256` instead of by dataset transaction. A rebuild then only
re-downloads the files that changed, appending cells stops invalidating
everything, the hardcoded `master` goes away, and the same key works for media
sets. This is the biggest win for the least code.

### 4. A catalog dataset

`catalog/catalog.json` lists every layer: id, kind, title, dataset RID,
manifest path and hash, bounds, encoding, attribution, `dependsOn`, file
count and size. Apps get configured with **one** RID. A startup check can walk
the catalog and say exactly which dataset is missing its Resource grant.

Open question: whether Developer Console on our enrollment can grant a whole
Project as a Resource. If it can, put every backing dataset in one Project and
grant it once.

### 5. Archives cut to a size target, not a fixed 2°

Because the archive is the transfer unit, archives are cut so none exceeds a
target (default 4 MB):

1. one archive takes the low zooms, for as long as their total fits;
2. each remaining zoom gets the coarsest cell size that fits, from
   128°, 64° … 2°, 1°, 0.5°, 0.25° (powers of two times 2°, so display cells
   nest with the analysis grid);
3. neighbouring zooms merge into one band while the band still fits.

Tiles go to archives by their north-west corner, exactly as
`manifestResolver.pathForTile` looks them up. The tests port that function to
Python and check every tile against it.

### 6. Pipelines in the repo

This folder is the local version of those pipelines. The next step is the same
code as Foundry transforms, next to `decho-countries/foundry/`.

### 7. Tidy up

Regenerate the theatre basemap with a manifest (or retire it). Make datasets
canonical and keep media sets for user uploads only.

## What `terrain_gen` builds

```
out/
  dem-cells/   manifest.json  c093_r011.tif …            ← analysis, replaces "Elevation"
  terrain/     manifest.json  z0-z9.pmtiles  z10/…       ← Terrarium raster-dem
  hillshade/   manifest.json  z0-z9.pmtiles  z10/…       ← transparent shaded relief
  contours/    manifest.json  z8.pmtiles  z9/…  z12/…    ← vector, layer "contours", ELEV + index
  basemap/     manifest.json  …                          ← Protomaps extract, re-chunked
  assets/      manifest.json  fonts/…  sprites/…         ← glyphs + sprites
  catalog/     catalog.json  manifest.json
```

Each folder is one Foundry dataset: upload its contents as-is.

### Measured on a real region

Copernicus GLO-90 over 6–10°E, 61–63°N (two 2° cells, steep Norwegian
mountains), default settings, 4 workers:

| Product | Size | Archives | Largest | Time |
|---|---|---|---|---|
| dem-cells (float32) | 17.8 MB | 2 | 9.6 MB | 1 s |
| terrain z0–z10 | 10.2 MB | 3 | 3.8 MB | 5 s |
| hillshade z0–z10 | 9.0 MB | 3 | 3.3 MB | 4 s |
| contours 20 m, z8–z12 | 39.4 MB | 30 | 2.9 MB | 45 s |

Things learned getting there, now built in as defaults:

- **The terrain pyramid can easily be bigger than the DEM.** The first run was
  84 MB, 4.7× the DEM cells. Two causes: Terrarium's blue channel (1/256 m)
  is noise after resampling and doesn't compress, and z11 oversamples 90 m
  data about 6× in pixel count at 62°N. Rounding heights to 0.25 m (GLO-90's
  own accuracy is several metres), WebP lossless and max zoom 10 for GLO-90
  bring it to 10.2 MB. MapLibre overzooms terrain smoothly past z10.
- **WebP lossless effort level 1** gives the same size as effort 4 on these
  tiles and is 18× faster (0.02 s vs 0.38 s per tile).
- **tippecanoe's per-feature `minzoom` key dropped ~97% of contour lines** at
  every zoom, z12 included, reported only as `dropped_by_rate`. A `-j` zoom
  filter does the same thinning without losing lines.
- **Contours are the big product.** 20 m lines in steep terrain cost about
  4× the terrain itself. For large areas, consider `--interval 50`.
- **Copernicus tiles are pixel-is-point** (bounds offset by half a pixel), so
  cutting them on exact 2° edges resamples by half a pixel. That's harmless at
  90 m, and it's what makes the cells line up with the grid.

## Changes needed in the packages to use this

Not done here. In rough order:

1. **decho-foundry-bytes:** key the persistent cache by a manifest-declared
   `sha256` when one is given (fall back to the transaction key otherwise).
2. **decho-elevation:**
   - set `manifestPath: "manifest.json"` on the DEM store once `dem-cells` is
     uploaded (works today: the manifest is the shape it already reads);
   - add a terrain-pyramid store: a `raster-dem` source over the `terrain`
     manifest through the basemap's existing manifest resolver and PMTiles
     protocol, so terrain and hillshade work at every zoom;
   - read contours as one store through the same resolver, and drop the
     per-cell source workaround.
3. **A shared `decho-grid` module:** one copy of the grid and manifest reader,
   replacing the two `grid.ts` files and the two cell shapes.
4. **Catalog:** read `catalog.json` from one configured RID, plus a startup
   check that reports missing Resource grants.
5. **Foundry transforms:** port `terrain_gen` to transforms so the datasets
   build in the platform.

## Not covered

- **Pathfinding graphs.** Building them needs land-cover and water masks as
  well as heights, and the current generator isn't in the repo. They stay as
  they are; a `manifest.json` listing their cells, sizes and hashes is the
  first step.
- **Countries** already has its own transform.
- **Variable-size cells per area** (quadtree). The cut here adapts per zoom,
  not per area, so it still targets the densest place at each zoom. That
  covers the size problem without changing the resolver; a quadtree would
  need a resolver change.
