# Decho Studio

A browser GIS over Foundry, in the spirit of QGIS. It reads the map datasets
that [`terrain-gen`](../terrain-gen) builds (the `decho-layer/1` format: a
catalog, one manifest per layer, chunked PMTiles archives) and lets you
compose, style, draw, edit, measure and export maps on top of them. The map
makes no external network calls: tiles, terrain, contours, glyphs and sprites
all come from the catalog's datasets.

## What it does

| | |
|---|---|
| **Catalog** | Open a catalog from a Foundry dataset RID, or from a folder URL for local work. Every layer is listed with its kind, size and file count; add one to the map with a click. A fresh project starts with the basemap, terrain and contours. |
| **Layers** | Layer tree with visibility, opacity, reordering, zoom-to and remove. Catalog layers: basemap (five Protomaps styles), terrain (hillshade and 3D terrain with exaggeration), contours (colour, width, height labels), raster overlays, DEM-cell footprints. |
| **Vector data** | Import GeoJSON, CSV (lat/lon or WKT columns), KML and GPX by menu or by dropping files on the map. Style by single colour or categorised by a field, with labels. |
| **Editing** | Draw points, lines and polygons; select (shift adds); drag vertices, drag a midpoint to insert one, alt-click to delete one; snapping to the active layer's vertices; Delete removes the selection. Editable attribute table: filter, sort, edit cells, add and remove fields. Undo and redo for everything (Ctrl+Z / Ctrl+Shift+Z). |
| **Analysis** | Identify (features under the cursor, plus the height there). Distance and area measurement. Elevation profile along a drawn line, with range and total climb. Cursor coordinates and height in the status bar. |
| **Output** | Save and open projects (`.decho.json`; autosaved in the browser too). Export the active layer as GeoJSON, CSV (WKT geometry) or KML. Export the map as a PNG with title, legend, scale bar, north arrow and attributions. |

## How it reads the data

```
catalog.json ──► layer entry ──► manifest.json ──► pathForTile(z,x,y) ──► archive.pmtiles ──► tile
```

- **One catalog RID** configures everything. Each catalog entry names the
  dataset (Foundry) or folder (HTTP) holding that layer.
- **The resolver** (`src/data/manifest.ts`) is a port of decho-basemap's
  `manifestResolver`. A test runs it over tiles that terrain-gen chunked and
  checks that both put every tile in the same archive.
- **Whole-file reads, cached by content.** Foundry ignores HTTP Range, so an
  archive is downloaded whole. Archives are kept in an in-memory LRU and in
  Cache Storage **keyed by the `sha256` the manifest declares**, after checking
  the downloaded bytes against it. A rebuilt dataset therefore re-downloads
  only the archives whose bytes changed.
- **MapLibre protocols** (`decho://`, `decho-glyphs://`, `decho-sprite://`)
  serve tiles, glyphs and sprites from the catalog, so the style never names a
  network URL.
- **The project is the source of truth.** The map style is rebuilt from it on
  every change and applied with MapLibre's style diff, which is what makes
  undo, save and export exact.

## Run it locally

```bash
cd studio
npm install
STUDIO_DATA=../terrain-gen/out npm run dev     # serves that folder at /data/
```

Open http://localhost:8080. It connects to `/data/` by default; another folder
or a Foundry catalog can be opened from the Catalog panel, or with
`?data=<url>` / `?catalog=<rid>` in the address. `?fresh` ignores the
autosaved project.

## Host it on Foundry

1. Register an OSDK application in Developer Console with the
   `api:use-datasets-read` scope.
2. Add **every** dataset as a Resource on the app: the catalog and each layer
   in it. The scope alone returns 403. The error message names the dataset.
3. Copy `.env.example` to `.env` and fill in `VITE_FOUNDRY_API_URL`,
   `VITE_FOUNDRY_CLIENT_ID`, `VITE_FOUNDRY_REDIRECT_URL` and, optionally,
   `VITE_STUDIO_CATALOG_RID`.
4. `npm run build` and host `dist/` the way the repo's other OSDK app is
   hosted. The redirect URL's path is handled by the app itself.

The catalog needs dataset RIDs: after uploading terrain-gen's folders, rebuild
it with `python -m terrain_gen catalog --rids rids.json` and upload
`out/catalog`.

## Check it

```bash
npm test          # resolver vs terrain-gen, history, geometry, formats, style
npm run build     # typecheck + production build
```

## Limits, for now

- **Projects and edits live in the browser and in files.** Nothing is written
  back to Foundry yet: that needs a write path (Ontology Actions or dataset
  transactions) and is the next step.
- **Labels need the assets layer** (`terrain-gen assets`). Without it, label
  options are disabled rather than broken.
- **Web Mercator and globe only.** Data in other projections must be
  reprojected before import.
- **Vector layers are held in memory,** which is fine to roughly 100k features.
  Bigger data belongs in a tiled catalog layer.
- **Not yet tested against a live Foundry enrollment.** The Foundry store and
  OAuth flow follow the repo's existing OSDK app. Everything else has been run
  in a browser against real terrain-gen output (GLO-90 over Jotunheimen).
  Neither the basemap nor the assets were available in that environment, so
  the basemap and label paths have only been checked by the unit tests.
