# @acc/decho-elevation

Elevation served **entirely from Foundry**. DEM chunks are read from a dataset
over the platform's own APIs, decoded in the browser, and turned into either
pictures — 3D terrain, hillshade, hypsometric tint, slope bands — or answers:
height at a point, the section under a route, line of sight, viewshed.

No external network calls, so it works offline from the public internet and
under the default Content Security Policy, exactly like the basemap it plugs
into.

## Quick start

```tsx
// once, at application startup — the same call the basemap needs
import { configureBasemap } from "@acc/decho-basemap";
configureBasemap({ foundryUrl, getToken: auth, platformClient });
```

```tsx
import { DechoBasemap } from "@acc/decho-basemap/react";
import { elevation } from "@acc/decho-elevation/extension";

<DechoBasemap
  extensions={[elevation({ terrain: true, hillshade: true, sky: true })]}
  spawnLat={61.5} spawnLong={9} spawnZoom={10}
/>;
```

That is the whole integration. The basemap is stock — no elevation props on it
and no wrapper component — because this is a `BasemapExtension`: it contributes
its sources and layers to the style *before* the map is built, which is what
lets hillshade sit under the labels instead of over everything. Add
`milGraphics()` to the same array and both are on one map.

### Without a map at all

```ts
import { createDemSource, elevationProfile, lineOfSight } from "@acc/decho-elevation";

const dem = await createDemSource();

await dem.heightAt(9.0, 61.5);                       // metres, NaN off coverage
await elevationProfile(dem, waypoints, { samples: 240 });
await lineOfSight(dem, { from, to, observerHeight: 2 });
```

The core entry point imports neither React nor maplibre-gl, so a Worker, a
Node script or a Function can use it.

## Three layers, pick your altitude

| Layer | Import | Use when |
|---|---|---|
| `elevation({...})` | `.../extension` | You want relief on a map |
| `useElevation`, `useCursorElevation`, `<TerrainProfile/>` | `.../react` | You want readouts and charts in React |
| `createDemSource`, `elevationProfile`, `lineOfSight`, `viewshed` | `.` | No map, or you own the rendering |

Pass the extension's own source into the hook — `elevation({ onReady })` hands
it over — and the map and the questions share one set of decoded cells. Two
sources over one dataset each decode their own copy: 23 MB instead of 11.5 for
every 2° cell.

## What loads, and when

**Nothing until zoom 9.** One tile request fans out to every DEM cell the tile
covers, and cells are 2° and 3–25 MB:

| Zoom | One 256 px tile spans | Cells it touches |
|---|---|---|
| z12 | 0.088° | 1, usually |
| z10 | 0.35° | 1–4 |
| z9 (the default floor) | 0.70° | 1–4 |
| z8 | 1.41° | up to 9 |
| z2 | 90° | ~2,000 |
| z0 | the planet | ~15,700 |

The first version of this had no floor, so a world view asked for one tile that
resolved to fifteen thousand chunk fetches. The floor is enforced three times
over, because that failure is expensive:

1. **the style** — `minzoom` on the source. MapLibre requests *no tiles at all*
   below a source's minzoom, so this is the one that actually prevents work;
2. **the protocol handler** — a tile below the floor answers with a constant
   empty tile without touching a cell, so a hand-written style that forgets
   `minzoom` degrades to flat terrain instead of a stampede;
3. **a 16-cell cap per tile** — a backstop against a floor set too low, which
   logs rather than fetching.

Move it with `elevation({ minZoom: 10 })`. Zoomed out, terrain is flat and there
is no relief; the first chunk is fetched as the user crosses the threshold.

**The floor applies to tiles only.** `heightAt`, `elevationProfile`,
`lineOfSight` and `viewshed` load whatever cell they need at any zoom, because
they are answering a question somebody asked. One cell is a fair price for a
profile; drawing terrain nobody can see is not.

Above the floor:

- a cell is fetched **once** — concurrent tiles share one in-flight request, and
  the decoded grid is reused by every later tile, sample and sight line;
- a cell that answers 404 is remembered as absent for five minutes, so panning
  over ocean does not re-ask per tile;
- `maxZoom` (12) makes MapLibre **overzoom** the top level rather than request
  detail the DEM does not have. Above about z10 the tiles are interpolation, not
  information;
- `prefetchAround` warms neighbouring cells on `moveend`, debounced, one at a
  time, against a byte budget — from one level **below** the floor, so the zoom
  step that crosses it finds the cells already decoded rather than starting a
  3–25 MB download at the moment the camera arrives. One level only: two is a
  view four times as wide, where the same four cells are much less likely to be
  the ones anybody zooms into. Warming a cell no tile
  will draw is the most expensive kind of pointless.

## How the chunks are addressed

One `c{col}_r{row}.tif` per 2° cell, on `gridOrigin { lon: -180, lat: 85 }` —
**the same cut as the basemap's finest PMTiles layer and the pathfinding
graphs**. A DEM cell, a graph cell and a tile cell are the same cell, which is
why this package needs no spatial index of its own.

That agreement is a convention, and a convention nobody checks is one that is
eventually untrue, so `gridMismatch` is called against any bounds a chunk
declares for itself and throws with both extents named. Every sample being two
degrees adrift looks like slightly wrong terrain, not like an error, and that is
the sort of failure worth paying a check for.

### The manifest is optional

The Elevation dataset has none today: it is a flat set of chunks, and a cell
that does not exist answers 404, which reads as "no data here". Most of the
planet is ocean and has no chunk; that is normal, not an error.

Writing one buys four things:

| Field | Buys |
|---|---|
| `cells` allow-list | Panning over the Atlantic costs no round trips |
| `bytes` per cell | Prefetch spends a **byte** budget, not a cell count — cells are 3–25 MB |
| `dem.nodata` | Declared once, instead of trusted to be in every chunk's GDAL tag |
| `min`/`max` per cell | A relief ramp scaled to the data in view |

```jsonc
{ "version": 1,
  "gridOrigin": { "lon": -180, "lat": 85 },
  "cellDeg": 2,
  "pathTemplate": "{cell}.tif",
  "cells": [{ "col": 94, "row": 11, "bytes": 4210688, "min": 0, "max": 2469 }],
  "dem": { "source": "glo90", "nodata": -32768, "verticalDatum": "EGM2008" } }
```

Deliberately a superset of the basemap's `GlobeManifest`, so one generator can
emit both. Then set `manifestPath: "manifest.json"` on the store.

## The wire format, and the seam under it

The chunks are GeoTIFF and are decoded here — `core/geotiff.ts` reads classic
TIFF, one band, Int16/UInt16/Float32, striped or tiled, either byte order,
uncompressed or Deflate, predictor 1 or 2. That is what GDAL emits by default
for a DEM.

Anything else **throws with the compression named**, rather than guessing.
Guessing at LZW and getting it subtly wrong produces a grid of
plausible-looking rubbish, and rubbish elevations do not look wrong on a map
until somebody plans a route through a hill that is not there. Two honest fixes:
re-cut with `-co COMPRESS=DEFLATE`, or implement `DemCodec` over geotiff.js and
pass it in.

`DemCodec` is the seam because the format is the one hard-to-reverse decision
here and it is not settled:

| Format | Renders in MapLibre | Samples cheaply | Data work |
|---|---|---|---|
| **GeoTIFF** (today) | via the browser-side resampling in this package | yes | none |
| **terrain-RGB raster PMTiles** | natively, no resampling | yes, after a PNG decode | a transform |
| **raw Int16 heightfield** | no | trivially | a transform |

Everything above the codec works on `HeightGrid`, so moving to pre-encoded
terrain-RGB later changes the codec and deletes the resampling step. Nothing
else.

## What it draws, and what MapLibre draws

The expensive part — reprojecting a geographic DEM cell onto a Web-Mercator
tile — happens once per tile, as a *gather*: every output pixel asks the DEM
what is at its own longitude and latitude, so a tile straddling four cells has
no seam by construction. What comes out is handed to a renderer:

- **`terrariumTile`** → a `raster-dem` source. From this MapLibre builds **3D
  terrain** (`terrain`) and **hillshade** (a `hillshade` layer) *itself* — with
  illumination direction, exaggeration and accent colours as paint properties,
  so the light can move without re-rendering a tile. Generating hillshade pixels
  here would be slower and worse.
- **`hypsometricTile`** → a colour ramp by elevation. Restrained on purpose: on
  an operational map the tint is background and a saturated ramp competes with
  the symbols it sits behind. Voids stay transparent — they are water, which the
  basemap already draws.
- **`slopeTile`** → slope classified go / slow / restricted / no-go, with the
  no-go band starting at **0.4**, which is the `max_slope` the pathfinding
  graphs refuse to traverse. The map and the router then disagree about nothing.
- **`contourTile`** → contour lines, at an interval taken from the tile's own
  zoom. See below.

Add your own with `tiles: { "my-protocol": myRenderer }` — an avalanche-risk
tint, a landing-zone mask — and it goes through the same resampling, cache and
prefetch.

### Baked hillshade

Relief that was shaded before it got here — `gdaldem hillshade` per DEM cell,
stored as its own 8-bit GeoTIFF on the same grid with the same names:

```tsx
import { hillshadeTiles } from "@acc/decho-elevation/extension";

<DechoBasemap extensions={[hillshadeTiles()]} />
```

Both hillshades are worth having, and they are different things:

| | |
|---|---|
| `elevation({ hillshade: true })` | MapLibre computes it from the `raster-dem` source. No second dataset, and the light is a paint property — azimuth and exaggeration change without re-rendering a tile |
| `hillshadeTiles()` | A picture somebody chose: whatever azimuth, altitude, z-factor or multidirectional bake GDAL was asked for, with no gradient arithmetic per frame |

**It is twenty lines against `contourTiles`' three hundred, and the difference
is raster versus vector.** A hillshade is a raster on the cell grid, and the DEM
pipeline already serves exactly that: `createDemSource` reprojects as a *gather*,
where every output pixel asks whichever cell contains its longitude and latitude,
so a tile straddling four cells is seamless by construction and one source covers
the world. The contours could not do that — a vector tile can only come from one
archive, so they need a source per visible cell. Same dataset shape, same grid,
completely different plumbing.

So this reuses the GeoTIFF decoder, the Mercator resampler, the cell cache, the
PNG encoder, the protocol, the byte layer and the z9 floor. Only the renderer is
new.

**Drawn as shadow and light, not as grey.** The obvious rendering — grey pixel,
value straight through — lays a sheet of grey over the map and drains every
colour under it. So the neutral value is fully transparent and only the
*departure* from it is painted: darker than neutral towards black, lighter
towards white, each with its own strength. The plate keeps its colours and gains
relief.

`neutral` defaults to **180**, which is what `gdaldem hillshade` gives flat
ground at its default 45° sun altitude (255 × sin 45° ≈ 180). **If you bake at a
different altitude, move it** — otherwise flat country comes out uniformly shaded
or uniformly lit:

```tsx
hillshadeTiles({ neutral: 180, shadow: 0.55, highlight: 0.25, opacity: 1 })
```

`nodata: 0` in the preset, because `gdaldem` reserves 0 for it and puts real
shading in 1–255; without that every cell would carry a black border its source
never had.

### Contours

```tsx
elevation({ hillshade: true, contours: true })
elevation({
  contours: {
    interval: 20,            // fixed, instead of the zoom ladder below
    indexEvery: 5,           // every fifth line heavier; 0 for none
    width: 0.8,              // FULL width in tile pixels — a hairline
    indexWidth: 1.6,
    colour: [90, 90, 90],
  },
})
```

**The interval comes from the zoom**, because a contour interval is fixed in
metres and read in pixels: 10 m contours at z9 are a solid mat of ink and 100 m
contours at z15 are two lines on the screen.

| Zoom | Interval |
|---|---|
| z14 and above | 10 m |
| z12–z13 | 25 m |
| below z12 | 100 m |

Every fifth line is an **index contour**, drawn heavier — the ones a reader
counts from. The rungs are a step function, deliberately: a contour that fades
in halfway through a zoom is worse than one that appears. Pass `interval` to
fix it, or `ladder` to re-cut the rungs.

**No marching squares.** The pixel already knows everything needed: the height
`h` gives the distance in metres to the nearest contour, the gradient converts
that to a distance along the ground, and `metresPerPixel` converts it to
pixels. Paint anything within half a line width and the contours come out
closed, connected and correctly spaced without a segment ever being traced —
antialiased by feathering the last pixel, and constant in weight at every zoom
because the width is expressed in pixels. Flat ground has no gradient, so a
plain draws nothing rather than everything.

**They are rendered above the DEM's maxzoom, not stretched.** This is what
keeps them thin, and it is the one way contours differ from every other layer
here. Stretching a wash or a shading is invisible; stretching a hairline is not
— above a source's `maxzoom` MapLibre magnifies one tile pixel across four,
sixteen, sixty-four screen pixels, and a one-pixel contour becomes a rope. So
the contour source declares `maxzoom = dem.maxZoom + 3` and the tiles are
rendered at the zoom they are viewed at. It costs nothing per *screen* pixel
(the same viewport, more and smaller tiles), needs no new data, and the
resample is a bilinear gather, so the extra detail interpolates rather than
blocking up. `renderOverzoom` moves the 3.

**They cannot be labelled.** There is no way to write "300 m" along a raster
line, so if the height has to be readable off the map, use `contourTiles()`
below. Failing that, [`maplibre-contour`][contour] traces isolines from this
package's `raster-dem` source id (`elevation-dem`, or `extension.demSourceId`)
in a worker, at the cost of a dependency and a worker.

[contour]: https://github.com/onthegomap/maplibre-contour

### Traced contours, one archive per cell

When the contours have been traced ahead of time — `gdal_contour` per DEM cell,
`tippecanoe` into a PMTiles each — they are vector tiles, and then they can be
labelled:

```tsx
import { contourTiles } from "@acc/decho-elevation/extension";

<DechoBasemap extensions={[elevation({ hillshade: true }), contourTiles()]} />
```

Crisp at any zoom, pickable with `queryRenderedFeatures`, and index contours
carry their height as text along the line.

**Pass `sourceInterval` if you know it** — the metres between adjacent contours,
`gdal_contour`'s `-i`. It is the one number that lets this style itself safely,
and without it two things are guesswork:

```tsx
contourTiles({ sourceInterval: 50 })
```

*Thinning is off by default because of it.* The raster ladder is absolute metres
— 100, 25, 10 — which selects nothing unless the archives were traced at an
interval dividing those numbers. Trace at 40 m and the z12–14 rung asks for
multiples of 25, matches almost nothing, and **the contours vanish for two zoom
levels** before reappearing above z14 where the rung asks for multiples of 10
again. A filter that depends on data the extension cannot see is worse than no
filter, so by default every line is drawn at every zoom above the floor. Pass
`sourceInterval` and the rungs become multiples of the real spacing; pass
`ladder` to name the intervals yourself.

*The index interval is snapped for the same reason.* Every 100 m is the
convention, but against 40 m data no line is a multiple of 100 except every
fifth — so with `sourceInterval` the convention rounds up to 120 m, which is
near where a reader expects it and is on lines that exist.

Not knowing is survivable: the extension **measures** the interval from the
first tiles that load and, if it does not divide the index interval, says so in
the console with the number to pass. Filters are rounded, too, because
`gdal_contour` writes doubles and a 300 m line can arrive as 299.99999999999994,
which `% 100` does not see as an index contour.

**One vector source per visible cell**, and this is the whole design rather than
an implementation detail. Each archive is cut from one cell's GeoTIFF and
**clipped to that cell with no halo**, so a map tile straddling a cell boundary
holds only half its lines in either archive. A single routed source — one
protocol, `pathForTile` picking the cell that contains the tile, which is how the
basemap serves its own chunked archives — would drop everything on the far side
and leave a gap along every 2° line. Raster chunks do not have this problem
because the resampler gathers from all four cells a tile touches; a vector tile
cannot be gathered without decoding and re-encoding MVT.

So each visible cell gets its own source, protocol and layers, attached when it
comes into view and removed when it leaves. 2° cells are large, so a planning
view holds one to four; `maxCells` caps it at 9 and drops the corners of the
screen before the middle. Everything under the tile is reused — each cell is a
`createTileSource` from the basemap, so PMTiles decoding, ranged reads, the LRU,
Cache Storage and the concurrency lanes come for free.

The archives were tiled `-Z10 -z10`, so each source declares
`minzoom = maxzoom = 10` and MapLibre overzooms above it, which costs vector
geometry nothing. Below z10 the extension detaches its cells rather than asking
for tiles that do not exist.

**Two weights, and the index lines are darker as well as heavier.** Every
multiple of `indexInterval` — 100 m by convention, whatever the archives were
traced at — is drawn in a darker bistre at higher opacity and roughly double the
width, and is the only line labelled. The ordinary contours are meant to read as
texture; the index ones as lines you can count. All three properties are
data-driven off one shared test, so a line cannot be an index contour by colour
and an ordinary one by width.

Width ramps with zoom (0.3 → 1.0px for ordinary, 0.7 → 1.6px for index, z10 to
z14), because zooming out packs the same lines into less space. **The nesting of
that expression is not a style choice**: MapLibre only allows `["zoom"]` as the
outermost expression of a paint property, so it has to be an `interpolate` whose
stop values are `case`s, not a `case` between two `interpolate`s — the natural
way round throws at style validation. `widthByZoom` builds it and a test asserts
the order.

```tsx
contourTiles({
  indexInterval: 100,                       // metres; the darker, labelled lines
  colour: "#8b7355", opacity: 0.45,         // ordinary
  indexColour: "#6b5344", indexOpacity: 0.65,
  widthStops: [[10, 0.3], [12, 0.6], [14, 1]],
  indexWidthStops: [[10, 0.5], [12, 0.8], [14, 1.2]],
  labelMinZoom: 11, labelSpacing: 400, labelSuffix: " m",
})
```

**The labels are on a GeoJSON source, and with terrain that is the difference
between labels and no labels.** This is the one genuinely surprising thing in
here, so it is worth stating plainly.

With `terrain` set, MapLibre raises each symbol to the ground: it calls
`terrain.getDEMElevation(tileID, x, y)` with **the symbol's own tile id**, walks
up from there to the nearest ancestor that has DEM data, and — see maplibre-gl's
`terrain.ts` — `if (!dem) return 0`.

A label on a **z10** contour tile therefore asks for a z10-or-coarser DEM tile.
At a z14 view the terrain has z12 tiles loaded and no z10 ancestor, so the lookup
misses, the elevation comes back **0**, and every label is placed at sea level —
buried inside any ground that rises above it. The symptom is exact and
memorable: heights visible over flat ground, gone over the hills, and unaffected
by pitch alignment, because the text is *inside* the mesh.

Lines escape it entirely, because line layers are **draped** — rendered into the
terrain's texture — and never ask for a per-feature elevation.

So the index contours are copied into a `geojson` source, which MapLibre tiles
itself at the **display** zoom: a z14 label tile finds the z12 DEM tile as its
ancestor and the label sits on the ground it belongs to. The features come from
the vector tiles that are already loaded — `querySourceFeatures` with the index
filter — so it costs a query and a `setData` per view change, debounced, and no
extra download. It also means `symbol-spacing` is a plain number again: a tile
pixel is a screen pixel when the source is tiled at the display zoom, whereas on
the overzoomed vector tiles 400 meant 6400 screen pixels at z14.

`text-max-angle` is 45° for a related reason: terrain bends the *projected*
contour further than the flat map does, and the angle is measured on the
projection, so a tight limit quietly stops placing labels once relief is on. If a
pitched mountainous view still drops most of them, `labelAllowOverlap: true` is
the escape hatch, and `labelPitchAlignment` switches between draped text
(`"map"`, the default, what a paper sheet does) and upright (`"viewport"`, more
legible on a steep pitch).

Labels are `round` + `to-string`, deliberately **not** `number-format`: that is
locale-aware and renders 1300 as "1,300" in most locales, which is not how a
height is written on a map. `round` because `gdal_contour` writes doubles and
"1300.0000000000002 m" is the alternative. They follow the line
(`symbol-placement: "line"`), rotate with the map but stay upright to a pitched
camera (`text-rotation-alignment: "map"`, `text-pitch-alignment: "viewport"`),
and are `text-optional` — where a label collides, the line survives and the
number is dropped.

| Option | |
|---|---|
| `store` | the archives; defaults to the `CONTOUR_STORE` preset |
| `sourceInterval` | metres between adjacent contours. Enables safe thinning and snaps the index interval to a line that exists |
| `ladder` | thin by zoom, in absolute metres. Off unless given |
| `sourceLayer` | tippecanoe's `-l`, or the input file's basename when it was not passed. **The first thing to check if nothing appears** — `pmtiles show` prints it, and the extension says so in the console when a loaded archive yields no features for the name it was given |
| `elevationProperty` | omit it and `ELEV`, `elevation` and `elev` are tried in turn, which is what the default pipeline produces |
| `labels`, `labelMinZoom`, `labelSpacing`, `labelSuffix`, `labelSize`, `labelColour`, `labelMaxAngle` | index contours only, from z11, repeating every 400 screen px along the line |
| `labelFont` | defaults to the basemap's own `FONT_REGULAR`, so the name cannot drift from the glyphs it serves. A font the bundle does not have renders no text and logs one error per tile |
| `labelPitchAlignment`, `labelAllowOverlap` | the two dials for labels that go missing under terrain, in that order |
| `ring`, `maxCells` | rings attached beyond the viewport (1), and the budget of cells held at once (12) |

**Loading is a budget, not a visibility test.** Cells are attached for the
viewport plus `ring`, and evicted **least-recently-wanted only when over
`maxCells`** — so panning out of a cell and back does not tear its source down
and build it again. That matters more than it sounds: an attached off-screen
cell costs almost nothing (its source `bounds` stop MapLibre requesting tiles,
and its layers have nothing on screen to draw), while re-attaching costs a
PMTiles header read, a protocol registration and a re-parse of every tile.
Dropping on visibility bought nothing and showed up as contours blinking out and
returning a beat later.

**Wanting them at lower zooms is a re-bake, not a setting.** Nothing can be drawn
below the lowest zoom in the archive: MapLibre requests no tiles below a source's
minzoom, and a z10 tile cannot be re-cut into a z8 one on the client. Run
`tippecanoe -Z8 -z10`, which generalises the lines on the way down, then set
`archiveMinZoom: 8` on the store — that is the whole change, and no code moves.

## Questions it answers

```ts
await dem.heightAt(lon, lat);              // loads the cell if needed
dem.heightAtLoaded(lon, lat);              // resident cells only, synchronous
await dem.slopeAt(lon, lat);               // rise/run and downhill bearing

await elevationProfile(dem, waypoints, { samples: 240 });
// -> samples, length, min, max, gain, loss, voids

await lineOfSight(dem, { from, to, observerHeight: 2 });
// -> visible, clearance, the worst obstruction, and a chartable section

await viewshed(dem, { centre, radiusMetres: 5000, size: 129 }, onProgress);
```

Both of the last two include the Earth's bulge and standard atmospheric
refraction (k = 0.13, applied by inflating the radius). The **sign** of that
correction is the whole of it: the ground between two points rises *above* the
straight line joining them — 1.7 m at the middle of a 10 km line, 27 m at 40 km
— and treating it as falling away makes every long shot more visible instead of
less. Two observers on a dead-flat plain 60 km apart cannot see each other; that
case is a test.

`sightLine` is reported with the bulge already taken out, so `elevation` and
`sightLine` are directly comparable and the line is blocked exactly where the
ground is above it — on the chart as well as in the arithmetic.

**It is bare earth.** No vegetation, no buildings: a sight line through a forest
or a town is reported clear. The pathfinding graphs carry a landcover class per
node and could qualify this later.

## Requirements on the consuming application

1. **Scopes:** `api:use-datasets-read`.
2. **Resources:** every dataset this package reads must be added as a Resource
   on the OAuth app in Developer Console — and each is a *separate* dataset from
   the basemap's tiles and its glyphs, so adding those does not cover any of
   them:

   | Used by | Dataset |
   |---|---|
   | `elevation()` — terrain, hillshade, tint, slope, and every answer | the DEM chunks |
   | `contourTiles()` | the traced contour PMTiles |
   | `hillshadeTiles()` | the baked hillshade GeoTIFFs |

   **The scopes alone return 403.** This is the most common way this package
   appears broken, and it is why each extension logs and contributes nothing
   rather than failing the whole map — a missing Resource costs you the relief,
   or the contours, not the map.
3. **Peers:** `@acc/decho-basemap@>=0.8`. `react` only for `./react`. There is
   **no** maplibre-gl peer: the extension is handed the `maplibregl` namespace
   by the basemap and types the map structurally.

## Memory, and two budgets that add up

Decoded cells keep the narrowest dtype that holds them exactly: an Int16 DEM
stays Int16 (11.5 MB for a 2° cell rather than 23), and **8-bit samples — which
is what a baked hillshade is — are held as Int16 rather than widened to float**,
so the cell budget holds twice as much of it. UInt16 is deliberately *not*
narrowed: its usual nodata sentinel is 65535, which would wrap to −1 and put a
one-pixel trench through the map.


A cell in view costs its **file bytes** in the basemap byte layer's 128 MB
resident LRU *plus* its **decoded grid** here (11.5 MB for a 2° Int16 cell,
23 MB as Float32). This package's own budget is therefore in bytes, not cells —
"four cells" is 46 MB or 92 MB depending on a dtype, which is not a budget — and
defaults to 96 MB. Tune with `cellBudgetBytes`; `source.stats()` reports what is
resident.

`values` keeps the source's dtype rather than normalising to float, for the same
reason.

## Notes and limits

- **Terrain and the tactical graphics overlay agree** — checked, not assumed.
  An earlier draft of this note warned that `@acc/app6d`'s overlay
  would drift with `terrain` on, because it positions graphics with
  `map.project()`. That was wrong: since MapLibre 3, `project()` and
  `unproject()` both take terrain into account (`locationToScreenPoint(…,
  this.terrain)`), so they agree with `maplibregl.Marker`, which is what the
  same adapter uses for unit icons. Symbols and units sit on the hillside
  together.

  What terrain does change is *when* a position is stale: the ground rises as
  DEM tiles arrive, with no camera movement to trigger a redraw. That is fixed
  from `@acc/app6d@3.1.2`, which reprojects on `terrain` and `idle` as well as
  on camera events. Earlier releases leave order graphics at their sea-level
  positions until the user pans. (3.1.2 was published as
  `@tactical-graphics/app6d`; the package was renamed at 3.4.0 and the old name
  gets no further releases.)
- Tiles are PNGs encoded by hand (`core/png.ts`) rather than through a canvas.
  Canvas is colour-managed and its `getImageData` round trip is specified as
  lossy through premultiplied alpha; for a terrarium tile the "colours" *are* a
  24-bit height, so a unit of channel drift is a metre of terrain.
- Layer toggles are style, and a MapLibre style is assembled at construction.
  Toggle by flipping layer visibility on the live map, or remount it.
- A DEM cell load is deliberately **not** cancellable: one decoded cell serves
  every tile, sample and sight line over 2° of the planet, so letting an
  aborted tile cancel it would throw away work the next tile needs. The transfer
  underneath is de-duplicated by the byte layer either way.

## Development

Built and tested from the repository root; see the [root
README](../../README.md). `npm run build` here builds `@acc/decho-basemap`
first, because this package's build resolves it to its emitted declarations
rather than its source.

The GeoTIFF reader is tested against TIFFs written by
`src/core/testing/tiff.ts` — endianness, strips against tiles, tile padding,
Int16 against Float32, Deflate, the horizontal predictor — because a hand-rolled
reader is only defensible if it is tested against real files, and a writer
covers the whole matrix instead of whatever a checked-in fixture happens to be.
