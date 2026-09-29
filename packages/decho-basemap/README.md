# @acc/decho-basemap

A MapLibre vector basemap served **entirely from Foundry**. Tiles, glyphs and
sprites are read from datasets or media sets over the platform's own APIs, so
the map makes no external network calls, works offline from the public
internet, and is unaffected by the restrictive default Content Security Policy
that blocks CDN basemaps.

Lives in `src/lib/` for now; it is written to be extracted into its own
repository and published to the project's Artifacts npm repository without
changes. Nothing in here imports from `@/`.

## Quick start

```tsx
// once, at application startup
import { configureBasemap } from "@acc/decho-basemap";
import { auth, foundryUrl, platformClient } from "@/client";

configureBasemap({ foundryUrl, getToken: auth, platformClient });
```

```tsx
// anywhere
import { DechoBasemap } from "@acc/decho-basemap/react";

<DechoBasemap spawnLat={48.8566} spawnLong={2.3522} spawnZoom={12} />;
```

### Props for the common case

| Prop | Meaning |
|---|---|
| `rid` | Dataset holding `manifest.json` + the PMTiles chunks |
| `mediaSetRid` | Media set holding the same layout, when there is no dataset |
| `assetsRid`, `spritePath` | Glyph/sprite bundle |
| `spawnLat`, `spawnLong`, `spawnZoom` | Opening view |

All optional — with no props at all you get the preset planet basemap. The
`spawn*` props are flat scalars because that is what callers usually have to
hand (URL params, object properties, form fields), and because a `[lon, lat]`
tuple in JSX invites the classic transposition. They compose with `center`
rather than replacing it, so `center={[lon, lat]} spawnZoom={9}` does what it
looks like.

For anything more expressive — the fixed-grid scheme, a non-default manifest
path — pass a full store descriptor instead:

```tsx
import { THEATRE_STORE } from "@acc/decho-basemap";

<DechoBasemap tiles={THEATRE_STORE} spawnLat={60} spawnLong={25} spawnZoom={9} />;
```

`tiles` wins over `rid` if both are given, and `assets` over `assetsRid`.
Passing `assets={null}` means "no labels", which is different from omitting it.

## Three layers, pick your altitude

| Layer | Import | Use when |
|---|---|---|
| `<DechoBasemap />` | `.../react` | You want a map. Props for centre, zoom, flavor, controls |
| `useBasemap(ref, opts)` | `.../react` | You own the container and want the `maplibregl.Map` |
| `createBasemap(ml, opts)` | `.` | No React, or you build the `Map` yourself |

Each is a thin wrapper over the one below it; you can drop a level at any point
without losing anything.

### Adding your own layers, markers and interaction

The component never hides the map:

```tsx
<DechoBasemap
  flavor={MILITARY_TOPO}
  lang="en"
  onMapReady={(map) => {
    initMgrsOverlay(map);
    map.addSource("orders", { type: "geojson", data });
    map.on("click", handleClick);
  }}
>
  <MyHud />          {/* children render above the canvas */}
</DechoBasemap>
```

or hold it imperatively via `ref.current.map`. For heavier applications use the
hook and keep full control of construction order.

## "Style is not done loading"

A MapLibre `Map` is usable the instant its constructor returns; its **style is
not**, even when the style is passed as an object rather than a URL. Every
method that mutates the style — `addSource`, `addLayer`, `setLayerZoomRange`,
`setPaintProperty`, `setTerrain`, `setProjection` — throws until it is.

That produced an intermittent "Basemap unavailable / Style is not done loading"
here for as long as `globe` had existed: the projection was set on the line
after the constructor, and won or lost a race with the style depending on how
warm the cache was.

`useBasemap` now awaits the style before it touches the projection, attaches any
extension, publishes the map or calls `onMapReady`. So **the style is loaded**
wherever you get the map from this package, and adding a layer in `onMapReady`
is safe.

Building your own map from `createBasemap()`? The same four lines are exported:

```ts
import { whenStyleLoaded } from "@acc/decho-basemap";

const map = new maplibregl.Map({ container, style });
await whenStyleLoaded(map);
map.addLayer(myLayer);
```

It resolves immediately when the style is already up, handles the style
finishing between the check and the subscription (the race a naive
`map.once("load")` loses), and resolves `false` after ten seconds rather than
hanging on a style that never completes.

## Extensions

Add-ons join a map instead of wrapping it:

```tsx
import { DechoBasemap } from "@acc/decho-basemap/react";
import { elevation } from "@acc/decho-elevation/extension";

<DechoBasemap
  extensions={[elevation({ terrain: true, hillshade: true })]}
  spawnLat={61.5} spawnLong={9} spawnZoom={9}
/>;
```

An extension contributes to the style **before** the `Map` is constructed, then
attaches to the live one:

```ts
interface BasemapExtension {
  readonly id: string;
  style?(ctx): StyleContribution;                    // sources, layers, terrain, sky
  attach?(map, ctx): void | (() => void);            // returns its own teardown
}
```

Two phases rather than one because relief, terrain and contours are *style*, not
decoration: hillshade belongs under the labels and over the landcover fills, and
the anchors below resolve that from the flavor's own layer list so an extension
never hardcodes a layer id that changes with the flavor. Declaring terrain in the
style also avoids the restyle `setTerrain` costs after first paint.

| `before` | Resolves to | For |
|---|---|---|
| `"labels"` | the first **symbol** layer | anything that *shades* the ground — hillshade, a going wash, a translucent overlay |
| `"ground"` | the first **line** layer | anything that *is* the ground — a landuse colour plate, a texture |
| a layer id | that layer | when you control the layer list |
| omitted | the top | markers, graphics, anything over everything |

`"ground"` exists because an opaque fill anchored at `"labels"` sits on top of
the roads and the buildings and hides them. A Protomaps layer list opens with
background, earth, landcover and the landuse fills, and the first line layer is a
runway or a road — so that index is exactly the boundary between the ground and
the things drawn on it.

Ordering is the array's order — for layers anchored at the same place, for
`attach`, and in reverse for teardown. Colliding source or layer ids, two
extensions both claiming terrain, and an anchor the flavor does not have all
**throw** at setup; a failing `attach` is logged and costs only that add-on. The
reasoning is in `core/extensions.ts`.

`mergeExtensionStyle` and `attachExtensions` are exported, so an application
building its own map from `createBasemap()` gets the same composition.

## The drawing toolbar

`drawingTools` renders a toolbar of **icons**, not words: five tools, a delete
and a clear, at 28 pixels each. A word per tool is five different widths, wraps
at the first translation, and spends a third of the top of the map saying what
the shapes say better. Every button carries a `title` and an `aria-label`, so
the words are one hover away and a screen reader still hears them.

The glyphs are hand-drawn `<path>` elements rather than an icon set: this
package has no icon dependency, and the CI code scan blocks
`dangerouslySetInnerHTML`, so a string of SVG is not an option either. They are
stroked with `currentColor`, which is why the selected tool needs no second
icon.

The surface is **dark and translucent**, frosted with `backdrop-filter` — a
solid slab hides the terrain you are drawing on, and an unblurred translucent
one has road labels running through its text. Colours come from
`DEFAULT_SURFACE_THEME`, which is the same palette as the military unit
menus, so a map showing both looks like one product:

```tsx
<DechoBasemap drawingTools drawingToolbarTheme={{ accent: "#c8a94a" }} />
```

```ts
import { DEFAULT_SURFACE_THEME } from "@acc/decho-basemap/react";
// { background, border, text, muted, accent, accentBackground, blur }
```

Spread it over your own floating panels and they will match the toolbar rather
than approximate it. The individual icons are exported too, for anyone
replacing the toolbar (drop to `useBasemap` and render your own controls
against the `drawing` state) but keeping the iconography.

### Putting your own control on the bar

`toolbarItems` appends to the end of the toolbar, after a separator — which is
where an add-on's switch belongs, beside the map controls rather than in a
panel in another corner:

```tsx
<DechoBasemap
  drawingTools
  toolbarItems={
    <MapToolbarButton label="3D buildings" active={on} onClick={toggle}>
      <BuildingsIcon />
    </MapToolbarButton>
  }
/>
```

`MapToolbarButton` is exported so your control is the same 28-pixel square with
the same radius and active state, rather than a near-miss that reads as bolted
on. `label` is required and becomes both the tooltip and the accessible name;
passing `active` makes it announce as a toggle. The bar renders for
`toolbarItems` even when `drawingTools` is off, and the separator only appears
when there is something to separate from.

## Operational overlays from the archive's own tiles

Three more extensions that cost no dataset, no download and no dependency,
because every property they filter on is already in the vector tiles:

```tsx
<DechoBasemap extensions={[wetGaps(), chokePoints(), going()]} />
```

| | Reads | Answers |
|---|---|---|
| `wetGaps()` | `water.kind_detail`, `intermittent` | What it takes to cross. A ditch, a canal and a river are all `kind: water` and are three different problems; `intermittent` is drawn dashed, because a wadi is an obstacle in spring and nothing in August |
| `chokePoints()` | `roads.is_bridge`, `is_tunnel` | Where a route depends on one structure. A normal basemap draws a bridge exactly like the road either side of it, so it is invisible precisely when it matters |
| `going()` | `landuse.kind` | Trafficability and concealment in one field — forest is slow with cover, bare rock is fast with none |

Each is an `OverlayExtension`: `setVisible()` flips one layout property per
layer on a live map, so toggling costs no restyle and no refetch, exactly as
`buildings3d` does.

### Census first — the overlays are only as good as the tiles

```ts
describeSourceLayer(map, { sourceId: "protomaps", sourceLayer: "landuse" });
// → { zoom, features, kinds: { forest: 412, wetland: 8, … }, kindDetails, properties }

describeOverlayLayers(map, "protomaps");  // all five layers at once
```

**`landcover` is z0–z7 only.** An archive cut at z12 has none of it at any zoom
a planner uses, so the obvious layer for a going map renders nothing while
looking like a broken style — which is why `going()` reads `landuse` instead.
Whether a given archive populated *that* is a question only the census answers,
and `/demo` prints it under the toggles. `properties` matters too: no `is_bridge`
in the list means `chokePoints()` has nothing to filter on.

### One thing the overlays reveal

The `Pathfinding` dataset's `meta.json` lists the kinds it treats as impassable:
basin, building, building_part, canal, ditch, dock, drain, lake, ocean, playa,
reservoir, river, riverbank, stream, water.

**No `wetland` and no `glacier`** — both of which are `landuse` kinds this
schema carries. A route will cross a marsh or an icefield without comment.
`going()` colours them, which makes the gap visible; closing it belongs in the
graph build, not in a style.

## Ground colour and ground textures

Farmland yellow, woodland green, marsh blue-green — then trees, wheat, reeds and
houses printed on top, so the plate says what the ground **is** and not only what
colour it is.

```tsx
import { landusePatterns } from "@acc/decho-basemap";

<DechoBasemap extensions={[landusePatterns({ ground: true })]} />
```

Another `OverlayExtension` over `landuse.kind`, so it costs no dataset and no
download, and `setVisible()` toggles the icons without a restyle. Eight textures
ship:

| Texture | `landuse.kind` |
|---|---|
| tree | `forest`, `wood` |
| bush | `scrub`, `heath` |
| wheat | `farmland`, `allotments`, `farmyard` |
| fruit tree | `orchard`, `vineyard` |
| reeds | `wetland`, `marsh`, `swamp`, `bog` |
| house | `residential`, `neighbourhood` |
| factory | `industrial`, `commercial`, `retail` |
| crossed sabres | `military` |

`nature_reserve`, `park`, `grass` and `meadow` are deliberately **not** mapped: a
nature reserve is as often moorland as woodland, and drawing trees on it would
be the map asserting something the tiles never said. Pass `kinds` to say
otherwise — it replaces the map rather than merging into it, because removing a
mapping has to be possible.

```tsx
landusePatterns({
  ground:  true,                                 // or a colour; off by default
  minZoom: 12,                                   // default 10
  iconSize: 14,                                  // default 11 CSS px
  tileSize: 80,                                  // default 64 — bigger is sparser
  opacity: 0.5,                                  // default 0.65, the ink
  colours: { wetland: "#2f6f66" },               // the ink colour
  plate:   { farmland: "#efdca8" },              // the ground colour, or false
  icons:   { military: MY_OWN_ICON },            // one path-data string
  kinds:   { forest: "woodland", wood: "woodland" },
})
```

Four things about it are worth knowing before you tune it.

**It paints the ground colour, because the flavor does not.** Protomaps' `landuse`
layers are park, urban_green, hospital, industrial, school, beach, zoo, aerodrome,
runway, pedestrian and pier — that is the whole list. **`farmland`, `orchard`,
`farmyard`, `wetland`, `heath`, `scrub` and `residential` get no fill at all**:
they are the `earth` colour, which is `#e2dfda`, one grey for a wheat field, a
marsh and a housing estate alike. So the extension contributes two layers — an
opaque colour plate, then the icons over it — and the plate is the ground colour
rather than a tint of one. `plate: false` turns it off; `going()` is still the
thing for trafficability colours instead of natural ones.

Two layers rather than one because `fill-color` is ignored on any layer that sets
`fill-pattern`.

**It anchors at `"ground"`, not `"labels"`.** Every other extension here shades
the ground and sits just under the labels; these two layers *are* the ground, so
they go in with the flavor's own landuse fills, under the roads and the buildings.
An opaque plate at the label boundary covers a town. The consequence worth
knowing: relief lands **on** the textures, because hillshade anchors at
`"labels"` — which is the right way round.

**`setVisible()` is the icons; the colour stays.** "Farmland is yellow" is a fact
about the map, not an overlay to be read one at a time — and it is what should
remain when the icons are switched off or when the map zooms out past their floor.
`setPlateVisible()` is there for a caller who really does want the flavor's bare
ground back.

`ground` deals with the other half of the same problem: what shows where there is
no landuse polygon at all. It repaints the flavor's `earth` and `background` to
`NATURAL_GROUND`, a light grass green, because the default grey reads as pavement
once the fields and woods around it are natural colours. **Off by default** — an
extension restyling a layer it did not contribute is a surprise, and the flavor is
the proper place for a base colour:

```tsx
<DechoBasemap flavor={{ ...namedFlavor("light"), earth: "#e2ecd5" }} />
```

**Every texture sits at different offsets in the tile.** Each texture is its own
pattern image and MapLibre tiles them all on the same screen-space grid, so two
textures placing an icon at the same fraction of the tile print at the same pixel
wherever their polygons meet or overlap — a wood inside a military area, houses
over farmland. The tile is therefore a shared seating plan: sixteen slots on a
staggered lattice, two dealt to each texture, which guarantees a quarter-tile
(16px at the default) between any two icons of any two textures. Passing
`placements` overrides that and puts every texture in the same place — only
sensible on a single-texture map.

**Spacing is in screen pixels.** A `fill-pattern` tiles in screen space, so the
icons stay the same size and the same distance apart at every zoom and a wood
gets denser *on the ground* as you zoom out. That is why the icons are off below
**z10**: far enough out, every polygon is a solid mat of them with an unreadable
map underneath. The plate has no such floor. Ground-fixed spacing is not
available: it would need one symbol per tree, and MapLibre has no
`symbol-placement: fill`.

**The artwork is generated, not fetched.** Each icon is SVG path data drawn with
`Path2D` onto a canvas at attach time and registered with `map.addImage`. The
sprite was the obvious home and could not be used: it lives in a dataset this
package does not own, there is one sheet per flavor, and a consumer passing
their own `assetsRid` would get eight missing images. Generating them also means
the ink colour and the device pixel ratio are ours to choose.

One consequence of that, and it is the only subtle thing here: **a pattern is
resolved when a tile is parsed, not when it is drawn.** Images are added at
attach — before the first tiles finish — and `styleimagemissing` catches
anything that got there first. On a map you assemble yourself, the extension
needs `addImage`/`hasImage`/`removeImage` on the object you hand `attach()`; a
real `maplibregl.Map` has all three, and without them it logs once and leaves
the ground flat.

## 3D buildings

```tsx
import { buildings3d } from "@acc/decho-basemap";

<DechoBasemap extensions={[buildings3d()]} />;
```

No new dataset, no new dependency, no extra bytes: the Protomaps `buildings`
layer already in the archive carries `height` and `min_height`, which is
precisely what MapLibre's `fill-extrusion` wants. This is three dozen lines of
layer spec over tiles that are already being downloaded.

**What it will actually look like.** Two properties of the archive decide that,
and neither is a rendering choice:

- The schema holds **merged** buildings at z0–14 — adjacent and even
  disconnected buildings fused into one polygon — and individual OSM buildings
  only from **z15**. An archive cut at z12 therefore contains the merged tier at
  z12 generalisation. Extruded, that is city-block **massing**: a terrace is one
  slab, not thirty houses.
- MapLibre overzooms above a source's maxzoom, so at display z16 the geometry is
  still the z12 geometry, scaled up. More zoom does not buy more buildings.

Massing is genuinely useful — urban terrain, dead ground, what a street can see
— and it is not what "3D buildings" usually means. Individual footprints need
the archive re-cut to z15+, which is a much larger archive and a data decision.

**Measure before deciding**, because the answer is per-archive:

```ts
import { describeBuildingCoverage } from "@acc/decho-basemap";

describeBuildingCoverage(map, { sourceId: "protomaps" });
// { zoom, features, withHeight, withMinHeight, kinds, medianHeight }
```

It reads the tiles already in memory, so it costs nothing. The `/` harness route
prints it under the toggle. Two results are worth knowing in advance: **0
features** means the cut dropped the layer at these zooms, and **withHeight far
below features** means most buildings have no OSM height and will all come out
at `defaultHeight` — a uniform slab city, which looks like a bug here and is
not one.

| Option | Default | |
|---|---|---|
| `minZoom` | 14 | Where extrusions start. `fill-extrusion` is the most expensive layer type MapLibre has |
| `defaultHeight` | 9 | Metres when OSM has none — the common case, not an edge case |
| `exaggeration` | 1 | 1 is honest; 1.2 reads better in flat cities |
| `colour`, `opacity`, `verticalGradient` | | Opacity fades in over half a zoom level, since the property cannot vary per feature |
| `includeParts` | false | `building_part` overlaps its parent building; expect z-fighting where 3D mapping is partial |
| `visible` | true | Initial state. The layer is contributed either way — see below |
| `handOffFlatLayer` | `"buildings"` | Stops the flavor's flat fill where the extrusion starts, so it does not show as an edge around every roof. Restored on teardown |

### Switching 2D and 3D without rebuilding the map

A MapLibre style is assembled once, at construction, so the obvious way to add
a layer is to rebuild the map — which throws away every downloaded tile, the
camera, the drawing and any state the host hung off the map instance, for a
switch the user expects to be instant.

So the layer is **always** contributed and the extension flips its visibility:

```tsx
const extension = useMemo(() => buildings3d({ visible: false }), []);
useEffect(() => extension.setVisible(on), [on, extension]);

<DechoBasemap extensions={[extension]} /* no key: never remounted */ />
```

One layout property, no restyle, no refetch — a hidden layer is not drawn and
its source is the basemap's own tiles, which are downloaded anyway. The flat
building fill hands back and forth with it, so this is a true 2D/3D switch
rather than two overlapping representations of the same footprints.

Keep the extension instance stable (`useMemo` with no dependencies): a new one
per render would claim the same layer id. `setVisible` before the map exists is
remembered and applied on attach.

It composes with terrain from `@acc/decho-elevation`: MapLibre places extrusions
on the terrain surface, so buildings stand on the hillside rather than at sea
level.

```tsx
<DechoBasemap extensions={[elevation({ terrain: true }), buildings3d()]} />
```

Extrusions only read as 3D from an oblique camera, and enabling the layer does
not tilt the map — `map.easeTo({ pitch: 55 })`.

## Tile stores

A basemap is a **store** plus a resolver that maps `(z, x, y)` to an archive
file. Two kinds exist:

- **`manifest`** — the cut is described by `manifest.json` next to the chunks:
  per-zoom cell sizes, path template, and an allow-list of cells that exist.
  Prefer this.
- **`fixed-grid`** — a hardcoded bbox and cols×rows grid per zoom. Supported so
  older datasets can be adopted without re-cutting them.

Presets for this enrollment are exported from `core/defaults.ts`
(`PLANET_STORE`, `THEATRE_STORE`, `ASSET_STORE`) and can be replaced wholesale
with `configureDefaultStores()` or per call via the `tiles` / `assets` props.

## The byte layer moved out

Everything to do with reading files from Foundry — the token, both cache tiers,
request de-duplication, the concurrency lanes and the typed errors — now lives
in **`@acc/decho-foundry-bytes`**, because a second package needed it
(`@acc/decho-pathfinding` reads graph cells the same way) and depending on a map
renderer to fetch a file is backwards.

Nothing changed for consumers of this package. The whole surface is re-exported
here under both its new names and its old ones, and the aliases are permanent:

| Was | Is now | Still exported here |
|---|---|---|
| `configureBasemap` | `configureFoundryBytes` | yes |
| `describeBasemapError` | `describeFoundryError` | yes |
| `BasemapError` and friends | `FoundryBytesError` and friends | yes |
| `isArchivePath` | `isLargeFilePath` | yes |
| `ARCHIVE_LANE_LIMIT` / `ASSET_LANE_LIMIT` | `LARGE_LANE_LIMIT` / `SMALL_LANE_LIMIT` | yes |

Each alias is the same object, so `instanceof` works across both spellings. An
application that also uses `@acc/decho-pathfinding` should prefer configuring
through `@acc/decho-foundry-bytes` directly — one call serves every package
built on it, and there must only ever be one copy of it resolved.

The section below describes that layer; it is kept here because it is the reason
this basemap is shaped the way it is.

## Why the transfer layer looks the way it does

Foundry's file-content endpoint **does not honour HTTP `Range`** — it answers
`200` with the whole body (measured on the Accenture enrollment, 2026-08-27).
Everything follows from that:

- the archive must be **pre-chunked**, because the transfer unit is a file;
- a single shared **probe** settles ranged-vs-whole-file before any tile is
  requested, otherwise a screenful of tiles each get their own full copy of the
  same archive;
- bodies are cached in an **LRU** (128 MB) over **Cache Storage** keyed by the
  dataset transaction RID, so an archive is downloaded once per user, ever;
- concurrent readers of one archive **share one request**, refcounted, so
  MapLibre's per-tile aborts cancel the download only when every tile using it
  has gone;
- transfers run in two **lanes** — large archives (4 at a time) and small
  assets like glyphs (6) — so labels never queue behind a 25 MB basemap chunk.

If the platform ever starts honouring `Range`, the probe detects it and the
whole whole-file path stops being used, with no code change.

## Requirements on the consuming application

1. **Scopes:** `api:use-datasets-read`, plus `api:mediasets-read` for media set
   stores.
2. **Resources:** the tile and asset datasets must be added as Resources on the
   OAuth app in Developer Console. **The scopes alone return 403** — this is
   the single most common setup failure.
3. **Peers:** `maplibre-gl@^5 || ^6` (the protocol handler must receive an
   `AbortController`), `pmtiles@^4`, `@protomaps/basemaps@^5`.
4. **On `maplibre-gl` 6, tell MapLibre where its worker is — once, in the app.**
   6 is ESM-only and loads its worker from a separate file that bundlers do
   not pick up on their own; without this the map stays blank with "Worker
   failed to load" in the console. With Vite, at the top of the app's entry:

   ```ts
   import { setWorkerUrl } from "maplibre-gl";
   import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

   setWorkerUrl(workerUrl);
   ```

   `?worker&url`, not `?url`: the worker imports a shared chunk, and only the
   worker pipeline bundles it in. Other bundlers:
   [MapLibre's installation notes](https://maplibre.org/maplibre-gl-js/docs/#installation).
   It is the app's to do rather than this package's because the import is
   bundler-specific. On 5 there is nothing to set.

## Package notes

Why the manifest and build are the way they are.

- **`src/` is shipped** in the tarball: the `.js.map` and `.d.ts.map` files point at `../src/*`, so without it every stack trace and go-to-definition in a consumer dead-ends. It also makes the tarball a complete, relocatable copy of the package.
- **Build:** `npm run build` is `tsc -b tsconfig.build.json`. The build config references `@acc/decho-foundry-bytes`, so `tsc -b` builds it first when it is out of date and compiles against its emitted declarations rather than its source. The build info file is written into `dist/` (so deleting `dist` always forces a rebuild) and excluded from the tarball.
- **`@osdk/*` peers are `^2.0.0`**, never the exact minors this repo happens to have: pinning those (as basemap 0.1.0 did) made the package uninstallable, with an ERESOLVE conflict, in an app one minor behind. The upper bound is the next major, which is allowed to break.
- **Sibling `@acc/*` peers are bounded at the next version allowed to break.** For a `0.x` package that is the next minor, so `^0.1.0` rather than `>=0.1.0`: an open range would accept a breaking release this package was never tested against. Widen the range in a release of this package once it has been checked against the new sibling.
- **React is `^18.0.0 || ^19.0.0`**, the same range across every package in this repo. It is optional: only `./react` needs it.
- **`"sideEffects": ["*.css"]`:** `./react` imports MapLibre's stylesheet.

## Publishing a new version

Published to the Foundry Artifacts npm repository
`ri.artifacts.main.repository.df396b79-3da5-473f-91c2-7be67d95c46c`.

⚠️ **The publish instructions shown in the Artifact repository UI do not work
from a Code Workspace.** They target `https://accenture.palantirfoundry.com`,
which does not resolve from inside the container (`ENOTFOUND`) — workspaces
reach Artifacts through an internal mesh endpoint in `$FOUNDRY_ARTIFACTS_URL`.
Use those instructions verbatim only when publishing from a machine that can
reach the public host.

From a Code Workspace terminal:

```bash
# 1. Generate a token on the Artifact repository's Publish tab.
#    Do NOT paste it into a file in this repo, and revoke it when finished.
npm config set --location=user -- \
  '//waypoint-envoy.rubix-system.svc.cluster.local:8443/compute/fc27e2/foundry/foundry-artifacts-api-mesh/artifacts/api/repositories/ri.artifacts.main.repository.df396b79-3da5-473f-91c2-7be67d95c46c/contents/release/npm/:_authToken' \
  "<TOKEN>"

# 2. Bump "version" in package.json, then:
cd packages/decho-basemap
npm run build
REG=$(printf '%s' "$FOUNDRY_ARTIFACTS_URL" | sed -E 's|https://[^@]*@|https://|')
npm publish --registry "$REG/repositories/ri.artifacts.main.repository.df396b79-3da5-473f-91c2-7be67d95c46c/contents/release/npm/"

# 3. Remove the token again.
npm config delete --location=user -- '//waypoint-envoy...<same key as above>'
```

Two details that cost time the first time round:

- The `_authToken` key must match the **full registry path**, not just the
  `/artifacts/api/` prefix — npm does not walk up path segments to find
  credentials, so a shorter key silently yields `ENEEDAUTH`.
- `$FOUNDRY_ARTIFACTS_URL` embeds `user:<token>@` basic-auth credentials. npm
  includes that userinfo when matching the auth key, so it must be stripped
  (the `sed` above) or the configured token is never applied.

`publishConfig.registry` in `package.json` points at the **public** URL, which
is correct for publishing from outside Foundry and is overridden by the
`--registry` flag above.

## Notes and limits

- Cache Storage is per-origin, so two apps on different Foundry subdomains do
  not share downloaded archives.
- One glyph protocol serves one asset dataset per page; registering a second,
  different one throws rather than silently serving the wrong fonts.
- Fontstack arrays must have exactly one entry (`FONT_REGULAR`, `FONT_MEDIUM`,
  `FONT_ITALIC`). MapLibre joins multi-entry arrays into a single name like
  `"A,B"`, which resolves to nothing and renders no text at all.
