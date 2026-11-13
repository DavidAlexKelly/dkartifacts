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

## Upload

Each folder in `out/` is one Foundry dataset. Upload its contents as they are,
keeping the folder structure. Then put the dataset RIDs in a file:

```json
{ "dem-cells": "ri.foundry.main.dataset.…", "terrain": "ri.foundry.main.dataset.…" }
```

and rebuild the catalog with them: `python -m terrain_gen catalog --rids rids.json`.

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
arithmetic, and every chunked tile against a Python port of
`manifestResolver.pathForTile`.

## Data licences

- Copernicus DEM: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH
  2014-2018, provided under COPERNICUS by the European Union and ESA. The
  attribution is written into each manifest.
- Protomaps basemap: © OpenStreetMap contributors (ODbL).
- Noto fonts: SIL Open Font License.
