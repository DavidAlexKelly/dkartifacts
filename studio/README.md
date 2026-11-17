# Decho Studio

A browser GIS over Foundry, in the spirit of QGIS and ArcGIS. It reads the map
datasets that [`terrain-gen`](../terrain-gen) builds (the `decho-layer/1`
format) and your Ontology, and lets you compose, style, analyse, edit, print
and share maps on top of them. The map itself makes no external network
calls: tiles, terrain, contours, glyphs and sprites all come from Foundry
datasets.

## What it does

| | |
|---|---|
| **Data** | Paste a dataset ID into **Add data** and it becomes a layer; its own `manifest.json` says what it is (terrain, hillshade, contours, imagery, vector tiles, DEM cells, basemap). The `assets` dataset turns labels on. The older chunked planet basemap and glyph bundle already in Foundry work as they are. A tabular dataset with lat/lon or WKT columns becomes a point/shape layer. **Data → Add from the Ontology:** any object type with a geopoint/geoshape as a read-only layer, or an editable **feature collection**. Import GeoJSON, CSV, KML/KMZ, GPX, Shapefile (loose or zipped), GeoPackage and DXF, with reprojection from the file's CRS (or a prompt when it has none). An optional catalog lists many datasets under one ID. |
| **Styling** | Single, categorized, graduated (natural breaks, quantile, equal interval, standard deviation; colour ramps), rule-based (any expression) and heatmap. Proportional symbol sizes, marker shapes, **APP-6D / MIL-STD-2525 symbols** from a SIDC field, labels, 3D extrusion, zoom ranges, a **time slider** for layers with a time field, save/load styles. Terrain: colour by height, hillshade, slope classes, aspect, 3D terrain. Basemap: five styles. |
| **Analysis** | **Processing toolbox** (buffer, clip, difference, intersect, union, dissolve, spatial join, nearest, points in polygons, centroids, hulls, bounding boxes, simplify, points along lines, split, merge, topology check) with run history and "selected features only". **Select** by expression or location; **field calculator**; **statistics**. Terrain: identify height, elevation **profile**, **line of sight**, **viewshed** (curvature and refraction included), slope/aspect. **Terrain-aware routing** over the Foundry pathfinding graphs (tracked, wheeled, foot). Distance and area measurement. |
| **Editing** | Draw points, lines and polygons; drag vertices, insert at midpoints, alt-click to delete; snapping to vertices and edges; split with a line, merge, copy/paste; editable attribute table and a **feature form** checked against per-field rules (type, required, allowed values). Undo/redo for everything. Edits to Foundry collections are committed as **Actions**. |
| **Coordinates** | Readout in decimal, DMS, DDM, **MGRS** or UTM; **go to** any of those; lat/lon or **MGRS grid** over the map. |
| **Output** | **Save to Foundry** (projects are MapProject objects others can open), or download/open project files. Export layers as GeoJSON, CSV, KML, KMZ, Shapefile or GeoPackage. **Print** PDF/PNG on A4–A2, Letter or Tabloid at up to 300 dpi with legend, scale bar, north arrow, lat/lon or MGRS frame grid, overview and notes; **atlas** mode prints a page per feature. |

## Setting up Foundry

1. Register an OSDK application in Developer Console with the scopes
   `api:use-datasets-read`, `api:use-ontologies-read` and
   `api:use-ontologies-write`.
2. For saved projects and editable collections, create the object types and
   actions in **[ONTOLOGY.md](ONTOLOGY.md)** (two object types, six actions).
3. Add **every** dataset, object type and action you will use as a Resource
   on the app. Scopes alone return 403; the error names the resource.
4. Copy `.env.example` to `.env` and fill in `VITE_FOUNDRY_API_URL`,
   `VITE_FOUNDRY_CLIENT_ID` and `VITE_FOUNDRY_REDIRECT_URL` (and the
   `VITE_ONTOLOGY…` names if yours differ from ONTOLOGY.md, and
   `VITE_PATHFINDING_DATASET` if the routing graphs are not the default).
5. `npm run build` and host `dist/` like the repo's other OSDK app. The
   CSP must allow `'wasm-unsafe-eval'` for GeoPackage import/export.

## Run it locally

```bash
cd studio
npm install
STUDIO_DATA=../terrain-gen/out npm run dev        # http://localhost:8080
```

Add layers by folder URL (`/data/terrain/`, `/data/contours/`, `/data/assets/`).

**Everything Foundry-side, without an enrollment.** A fake Foundry in the dev
server implements the Ontology contract, Actions, dataset files and tables:

```bash
cat > .env.local <<'ENV'
VITE_FOUNDRY_API_URL=http://localhost:8080/fake-foundry
VITE_FOUNDRY_TOKEN=fake
ENV
npx vite-node dev/make-test-graph.ts ../terrain-gen/out/pathgraph   # optional: a routing graph
STUDIO_FAKE_FOUNDRY=1 STUDIO_DATA=../terrain-gen/out npm run dev
```

Each folder is served as a dataset; their fake IDs are printed at start-up and
listed at `/fake-foundry/fake/rids`. Two made-up object types (Airfield,
TrainingArea) stand in for your Ontology. `VITE_FOUNDRY_TOKEN` also works
against a real enrollment in development (a personal token); production builds
never read it.

## How it works

- **Datasets describe themselves.** `dataset ID → manifest.json →
  pathForTile(z,x,y) → archive.pmtiles → tile`. The resolver is a port of
  decho-basemap's and is tested against terrain-gen's own output.
- **Cached by content.** Foundry ignores HTTP Range, so archives are read
  whole, verified against the manifest's `sha256`, and cached under that hash:
  a rebuilt dataset re-downloads only what changed.
- **The project is the source of truth.** The map style is rebuilt from it and
  applied by diff; symbology is computed per feature in JavaScript so styles
  can use the full expression language. That's what makes undo, save, print
  and export exact.
- **Foundry-backed layers** store where their features come from, not the
  features; edits are tracked (created/modified/deleted) and committed as
  Actions, with refused ones kept for retry.
- **Heavy code loads on demand**: GeoPackage (SQLite as WebAssembly), CRS
  support (proj4), PDF (jsPDF), routing, military symbols.

## Check it

```bash
npm test          # 171 tests: resolver vs terrain-gen, Ontology flows against the fake,
                  # history, geometry, analysis, formats, coordinates, print, symbology
npm run build     # typecheck + production build
```

## Limits

- **Not yet run against a live enrollment.** The Ontology client, dataset
  reads and OAuth follow Foundry's v2 API and the repo's existing app, and are
  tested end to end against the fake, but the real thing may differ in
  details (for example, geoshape parameter formats).
- **Web Mercator and globe only** for display; data in other CRSs is
  reprojected on import.
- **Vector layers are held in memory** (fine to roughly 100k features). Bigger
  data belongs in a tiled dataset (terrain-gen `vector`).
- **Analysis runs in the browser**, without a spatial index: joins and
  nearest-feature slow down past a few thousand features.
- **Routing** has been tested on a synthetic graph, not the real one.
- **Print:** PDF text uses Helvetica (no CJK); the overview has no coastlines.
