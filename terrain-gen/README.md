# terrain-gen

Builds the decho map datasets on your own machine, ready to upload to Foundry:
DEM analysis cells, a Terrarium terrain pyramid, hillshade, contours, a
re-chunked Protomaps basemap, glyphs and sprites, and a catalog. Why it's laid
out this way is in [PLAN.md](PLAN.md).

## Setup

Python 3.10+.

```bash
cd terrain-gen
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

`rasterio` ships GDAL in its wheels, so no system GDAL is needed. Two steps
use external tools:

| Step | Needs | Get it |
|---|---|---|
| `contours` | `tippecanoe` | `brew install tippecanoe`, `apt install tippecanoe`, or [build it](https://github.com/felt/tippecanoe) |
| `vector` | `tippecanoe` | as above |
| `basemap` | `pmtiles` | a binary from [go-pmtiles releases](https://github.com/protomaps/go-pmtiles/releases) |

## Run

Everything for a region (west,south,east,north):

```bash
python -m terrain_gen all --bbox 4,57,32,72
```

That runs download-dem → dem-cells → terrain → hillshade → contours → assets →
catalog. Add the basemap with `--products dem,terrain,hillshade,contours,basemap,assets
--source https://build.protomaps.com/YYYYMMDD.pmtiles` (pick a date from
[Protomaps downloads](https://docs.protomaps.com/basemaps/downloads)).

Or step by step:

```bash
python -m terrain_gen download-dem --bbox 4,57,32,72      # Copernicus GLO-90 tiles → work/sources/
python -m terrain_gen dem-cells    --bbox 4,57,32,72      # → out/dem-cells/
python -m terrain_gen terrain                             # → out/terrain/
python -m terrain_gen hillshade                           # → out/hillshade/
python -m terrain_gen contours --interval 20              # → out/contours/
python -m terrain_gen basemap --bbox 4,57,32,72 --source https://build.protomaps.com/20261101.pmtiles
python -m terrain_gen assets                              # → out/assets/
python -m terrain_gen catalog                             # → out/catalog/catalog.json
```

Steps resume: downloads already on disk are skipped, and `dem-cells` merges
into an existing manifest, so you can grow a dataset one region at a time.

### Options worth knowing

| Option | Default | |
|---|---|---|
| `--bbox` | whole grid | `west,south,east,north` |
| `--dem` | `glo90` | `glo30` for 30 m (about 9× the data) |
| `--target-mb` | `4` | largest archive the chunker aims for |
| `--workers` | CPUs − 1 | |
| `dem-cells --dem-dtype` | `float32` | `int16` rounds to whole metres, about half the size |
| `dem-cells --source-dir` | | use your own EPSG:4326 GeoTIFFs instead of Copernicus |
| `terrain --max-zoom` | 10 (glo90), 12 (glo30) | |
| `terrain --precision` | `0.25` | metres; `0` keeps full Terrarium precision (≈3× bigger) |
| `terrain --format` | `webp` | lossless; `png` is ≈40% bigger |
| `contours --interval` | `20` | metres; every 5th line is an index line |

`python -m terrain_gen <step> --help` lists the rest.

## Your own imagery and vector data

Two products take your data instead of the DEM. Neither is part of `all`
unless you pass its inputs (`all --products imagery,vector --imagery-dir … --vector-files …`).

**`imagery`**: a raster pyramid (`kind: "raster"`) from GeoTIFF/COG files in any
CRS, warped to web mercator (bilinear), or from an XYZ tile service:

```bash
python -m terrain_gen imagery --source-dir ~/orthophotos --attribution "© Kartverket"   # → out/imagery/
python -m terrain_gen imagery --files a.tif b.tif --max-zoom 16 --format jpg --id ortho
python -m terrain_gen imagery --xyz "https://tiles.example.com/{z}/{x}/{y}.jpg" --bbox 10,59,11,60 --max-zoom 14
```

> **XYZ: only fetch tiles you have the right to download and redistribute.**
> Most public tile services, the OpenStreetMap tile servers among them,
> forbid bulk downloading. There is no default URL. Requests are polite
> (4 connections, retries with backoff, `Retry-After` honoured, User-Agent
> `terrain-gen/…`), cached under `work/xyz-cache/`, and capped at
> `--xyz-max-tiles` (50 000).

The deepest zoom defaults to the one matching the finest source resolution;
shallower zooms are 2×2 averages (`--xyz-all-zooms` fetches them from the
server instead, better for tiles with labels). WebP quality 80 by default, with
alpha only where a tile is partly empty; empty tiles are skipped. `jpg` has no
alpha, so no-data edges are black. Non-8-bit rasters are stretched from their
2nd–98th percentile, or `--scale MIN,MAX`.

**`vector`**: any vector data as one vector-tile layer (`kind: "vector-tiles"`,
needs `tippecanoe`):

```bash
python -m terrain_gen vector roads.gpkg --layer-name roads           # → out/roads/
python -m terrain_gen vector sites.csv more-sites.geojson --max-zoom 12 --id sites
python -m terrain_gen vector parcels.shp --crs EPSG:25832            # when the file has no/wrong CRS
```

GeoJSON, line-delimited GeoJSON and CSV (lat/lon columns, or a WKT column) are
read in pure Python. GeoPackage, Shapefile, FlatGeobuf and other GDAL formats
are read with `pyogrio` (in requirements.txt; GDAL ships in its wheel), or with
the `ogr2ogr` command when pyogrio isn't installed. Everything is reprojected to
WGS84. The max zoom is tippecanoe's guess (`-zg`, at least 10) unless given;
low-zoom tiles over 500 KB are thinned (`--drop-densest-as-needed`, mostly
points), and zooms are added if needed so every feature is in the deepest zoom.
`--keep-all` turns thinning off.

The manifest's `encoding` lists what the studio needs to style the layer
without reading tiles: `sourceLayer`, `geometryTypes` (`Point`, `LineString`,
`Polygon`), `fields` (`{name: "string" | "number" | "boolean" | "mixed"}`) and
`featureCount`.

## Upload

Each folder in `out/` is one Foundry dataset. Upload its contents as they are,
keeping the folder structure: the manifests refer to paths like
`z10/c093_r005.pmtiles`. Each dataset describes itself in its own
`manifest.json`, so a dataset ID is all the studio needs to add it as a layer.

The catalog is optional: one ID that lists all of them. To use it, put the
dataset IDs in a file

```json
{ "dem-cells": "ri.foundry.main.dataset.…", "terrain": "ri.foundry.main.dataset.…" }
```

rebuild it with `python -m terrain_gen catalog --rids rids.json`, and upload
`out/catalog`.

`dem-cells` replaces the current Elevation dataset as-is: same file names, same
grid, same TIFF encoding. Set `manifestPath: "manifest.json"` on its DemStore to
pick up the allow-list, sizes and height ranges. The other products need the
package changes listed in PLAN.md before the apps can use them.

## Scale

Measured on GLO-90 over 4°×2° of Norwegian mountains (PLAN.md has the table):
about 1 minute and 77 MB for all four DEM products. Work and output scale with
land area: 2° cells and z10 tiles are the units of parallel work. A planet run
is many hours and hundreds of GB, mostly contours and the downloads, so run big
areas on a machine with cores and disk to spare.

## Tests

```bash
python -m pytest tests
```

Offline: a synthetic DEM, the Terrarium encoding against the TypeScript's
arithmetic, every chunked tile against a Python port of
`manifestResolver.pathForTile`, imagery from a synthetic UTM GeoTIFF and from a
local XYZ server, and vector tiles from GeoJSON, CSV and GeoPackage. The vector
tests are skipped without `tippecanoe`.

## Data licences

- Copernicus DEM: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH
  2014-2018, provided under COPERNICUS by the European Union and ESA. The
  attribution is written into each manifest.
- Protomaps basemap: © OpenStreetMap contributors (ODbL).
- Noto fonts: SIL Open Font License.
