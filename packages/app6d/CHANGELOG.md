# Changelog

All notable changes to this project are documented here.

## Unreleased

### Breaking

- Peers are bounded by major instead of open-ended: `maplibre-gl`
  `^3.0.0 || ^4.0.0 || ^5.0.0` (was `>=3.0.0`), `milsymbol` `^3.0.0` (was
  `>=3.0.0`), `react` `^18.0.0 || ^19.0.0` (was `>=18.0.0`). No version that
  was ever tested is excluded; an untested future major now is.

### Changed

- `maplibre-gl` peer also accepts 6 (`^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0`).
  The MapLibre adapter imports it as a namespace, since 6 is ESM-only with no
  default export; that works on every supported major.
- `"sideEffects": false` (was `true`). Nothing in the package runs at import
  time, so bundlers can now drop the parts of the catalog a consumer does not
  import.
- Doc comments in `./orders` no longer describe the deprecated
  `@acc/decho-mil-map` as if it were current.

## 3.7.0

**Graphics that are in the world, not on the glass.** `createMaplibreTacticGraphics`
and `tacticGraphics()` take a renderer:

```ts
tacticGraphics({ catalog, orders, renderer: "layers", layers: { textFont: ["Noto Sans Regular"] } })
```

The symptom this fixes, reported exactly: *"they move and resize when I rotate
the camera."* That is `TacticOverlay` working as designed — it fits every symbol
in screen pixels and redraws on each camera event, so a graphic is a picture
over the map rather than a thing on the ground. Pitch or rotate and it slides,
because it was never anywhere.

`renderer: "layers"` puts the geometry in a GeoJSON source with `fill` and
`line` layers instead. MapLibre's RenderToTexture pass draws vector layers into
a texture and drapes it over the terrain mesh, so a symbol follows the ground
along its whole length — over the ridge and down into the valley, sampling the
DEM continuously — foreshortens with pitch, and is hidden behind terrain in
front of it. It is converted when the ORDERS change and never on a camera event,
which is what "present in the world" means.

**Editing still works.** The handles are `OrderHandleController`'s DOM markers
either way, and MapLibre markers are already terrain-aware. Only the visual
changes.

**No z coordinate, deliberately.** MapLibre 5.24 has no `line-z-offset`, no
`elevationReference`, and reads nothing from `coordinates[2]`; draping derives
height itself. Baking a height per anchor would be actively worse — an axis of
advance three kilometres long crosses a valley, and two endpoint heights would
float its middle above the valley floor. Height belongs to the terrain, not to
the order.

Two layers for lines rather than one, because `line-dasharray` cannot be
data-driven: a dashed and a solid symbol sharing a layer would both take
whichever the layer declared. Text is opt-in via `textFont`, because which glyph
stack exists is the host's business and a `symbol` layer naming a missing one
renders nothing at all.

`"overlay"` remains the default. Nothing existing changes unless it asks.

## 3.6.0

`orderToGeoJSON` and `ordersToGeoJSON` — a placed order as features on the
ground, which completes the conversion half of drawing on 3D terrain.

```ts
import { ordersToGeoJSON } from "@acc/app6d/geojson";

map.getSource("orders").setData(
  ordersToGeoJSON(APP6D_CATALOG, orders, {
    project: (w) => map.project(w),
    unproject: (p) => map.unproject([p.x, p.y]).toArray(),
    zoom: map.getZoom(),
  }),
);
```

**It reuses this package's own placement transform rather than deriving one.**
`renderOnMap` places a symbol by an affine transform — anchor, zoom scale,
param origin — and `MILX_ORIGIN`, `MilxTransform`, `milxTransformFor`,
`milxToScreen` and `screenToMilx` are now exported from `/core` so a second
renderer can use the same one. Two renderers that derive the same placement
independently agree right up until someone retunes `pxPerUnit`, at which point
one moves and the other does not, and the symptom is a graphic subtly misplaced
in one view only. Sharing it makes that impossible rather than unlikely.

**A correction to 3.5.0's notes.** I wrote that a sizing decision came with the
renderer: screen-sized overlay against ground-sized layers. That was wrong, and
writing the test found it. `milxTransformFor` scales by 2^(zoom - baseZoom), so
a symbol grows on screen as you zoom in and therefore covers constant ground —
the overlay has always been ground-fixed, and the geography produced here
inherits that for free. Pinned across three zoom levels, because baked geometry
that shifted with zoom would mean panning out silently moved every control
measure onto different terrain.

Still no renderer: this converts, nothing draws through it, and the overlay is
untouched.

## 3.5.0

`@acc/app6d/geojson` — a symbol's geometry as geography, which is the first
half of drawing on 3D terrain.

```ts
import { partsToGeoJSON } from "@acc/app6d/geojson";
const data = partsToGeoJSON(parts, (pt) => map.unproject([pt.x, pt.y]).toArray());
```

**Why an overlay cannot do 3D.** `TacticOverlay` draws symbols as SVG over the
canvas. Their positions are already correct with terrain on — MapLibre's
`project` accounts for it — but an SVG is always parallel to the screen, so a
symbol cannot foreshorten when the camera pitches and cannot be hidden behind a
ridge. Neither is fixable inside the overlay. A shape that lies on the ground
has to reach the renderer *as* ground: GeoJSON in a `line` or `fill` layer,
which MapLibre drapes over the terrain mesh.

**The part that was subtle.** `geometry.ts` already has `pathPoints`, and it is
the wrong tool here by its own admission — "curve control points count as
positions here … no caller so far wants the flattened outline instead". A
renderer is that caller: a cubic's control points are not on the curve, so a
polyline through them turns a scalloped line into a zigzag and cuts the corner
off every arc. So `geojson/flatten.ts` is a full path reader — absolute and
relative forms of every command the catalog emits, curves subdivided against a
tolerance, and arcs converted from SVG's endpoint parameterisation to a centre
one, including the specification's radii correction. Sixteen tests, because
this is the layer where being quietly wrong is easy.

Pure and framework-free: it knows nothing about MapLibre, takes a function from
a point to a longitude and latitude, and is therefore usable for a shapefile
export or a geometry column as readily as for a layer.

**This is a foundation, not the feature.** Nothing renders through it yet, and
nothing existing changed — the overlay is untouched. What remains is a layer
renderer over the top, wired into `/extension` as an opt-in alongside the
overlay.

I thought a sizing decision came with it — screen-sized overlay against
ground-sized layers — and that was wrong. `milxTransformFor` scales by
2^(zoom - baseZoom), so a symbol grows on screen as you zoom in and covers
constant ground: the overlay has always been ground-fixed, and the geography
this produces inherits that. 3.6.0's tests pin it across three zoom levels.

## 3.4.0

**Renamed: `@tactical-graphics/app6d` is now `@acc/app6d`.**

```diff
- import { APP6D_CATALOG } from "@tactical-graphics/app6d/symbols";
+ import { APP6D_CATALOG } from "@acc/app6d/symbols";
```

No code changed. Every subpath, export and signature is identical to 3.3.0; the
version line continues rather than restarting, so 3.4.0 is the same library that
was at 3.3.0 and can be read that way.

Two reasons. The scope: this was the only package here outside `@acc/`, a
holdover from when it lived somewhere else, and a package's scope should say who
owns it rather than what it was called first. And the name: "tactical graphics"
described the package when it drew control measures and nothing else. It now
also resolves unit icons through milsymbol and, since 3.3.0, carries the
units-and-orders model — so the old name described about two thirds of it.
`app6d` is the standard it implements, which is the part that will not change.

**`@tactical-graphics/app6d` will receive no further releases.** Its published
versions keep working — versions in an Artifacts repository are immutable and
nothing has been withdrawn — but 3.3.0 is the last of them. The registry cannot
be made to say so: `npm deprecate` is rejected there with a 400, because
deprecating rewrites the package document. So this entry is the notice.

That also retires the npmjs.com line deliberately, which had been an open
question since 2.0.1 was first published here. It sat at 2.0.0 while this
repository moved to 3.x, and a scope change ends the ambiguity: there is one
home for this package now.

## 3.3.0

`@acc/app6d/orders` — units, the orders given to them, and the
arithmetic that turns one into a drawn symbol. It absorbs the core of
`@acc/decho-mil-map`, which is now deprecated.

```ts
import { assignOrder, defaultOrderCatalog, type PlacedMilUnit } from "@acc/app6d/orders";
```

That package existed to compose this one with a Foundry basemap. Once 3.2.0's
`/extension` made tactical graphics an add-on any map can take, the composing
job was gone, and what remained split along a line worth stating: doctrine and
geometry on one side, one product's interaction model on the other. This is the
first half. The second — a right-click workflow and its menus — was never
library material and moved into the application that has an opinion about it.

It belongs here because it was already reaching across a package boundary for
half of itself: `PlacedOrder` and `OrderHandleController` in `/maplibre`,
`unitAttachment`, `TACTIC_TASK_CATALOG` in `/core`. `assignOrder` drives a
symbol's OWN handles rather than doing the maths itself, and that is only
correct while it lives with them — an implementation that reimplements the
transform drifts from the renderer, and nobody notices until a symbol draws a
hundred metres from where it was placed.

Framework-free, like every entry point here except `/react`. Routing stays
injected: the `OrderRouter` interface comes along, and a symbology package still
has no business knowing what a terrain raster is.

Nothing existing changed. Additive.

## 3.2.0

`@acc/app6d/extension` — this package as a map add-on.

```tsx
<DechoBasemap extensions={[elevation(), buildings3d(), tacticGraphics({ catalog, orders })]} />
```

`createMaplibreTacticGraphics` already did the work; what it did not do was fit
the shape a host map framework hands add-ons. `tacticGraphics()` is that object:
an `id`, an `attach` that mounts the overlay and returns its teardown, and
`update`/`setEditable` that are safe to call before a map exists, because a host
driving this from component state cannot know which came first.

**It adds no dependency.** This package stays Foundry-agnostic — importing a
basemap library to draw a control measure would be backwards — and it does not
need to import one. The contract is satisfied structurally, which two things
make free: the overlay is SVG and DOM so there is no `style()` to type at all,
and TypeScript checks method parameters bivariantly, so `attach(map:
maplibregl.Map)` is accepted where `attach(map: ExtensionMap)` is expected. The
consuming repository type-checks the assignment in its own composition test, so
drift between the two contracts fails there rather than at a consumer.

## 3.1.2

Order graphics now follow the ground when 3D terrain is on.

`project()` was never the problem — MapLibre has passed `map.terrain` into it
since v3, so the overlay's positions were already terrain-aware and already
agreed with the `maplibregl.Marker` this adapter uses for unit icons. The gap
was in *when* they were recomputed: `onCameraChange` subscribed to camera
events only, and terrain moves the ground without moving the camera. Turning
terrain on, changing its exaggeration, or simply waiting for DEM tiles to load
left every graphic at its sea-level position until the user happened to pan.

It now also listens for `terrain` and `idle`. Not `data`, which is the precise
event for tile arrival and fires per tile — far too often to reproject an SVG
overlay on, where `idle` fires once things settle and the answer stops changing.

Found while auditing `@acc/decho-elevation` against this package rather than by
anyone hitting it.

## 3.1.1

Dragging a second handle no longer reverts the first.

Move one of an order's handles and it committed correctly; move another and the
symbol jumped back to where it started, the first edit gone. A handle's
listeners are attached once, when its marker is created, and later syncs only
reposition the marker — so the `order` those listeners closed over was the one
that existed when the handle first appeared. The second drag read
`order.milxParams` from that stale object, applied its own delta to the
pre-first-drag params, and committed the result.

`OrderHandleController` now keeps the current state of each order by id, set on
every `sync()`, and every drag reads from it at pointerdown rather than from
its closure. The scale handle and the position handle had the same fault for
the same reason — scaling or moving twice in a row measured the second drag
against the first's starting point.

Worth recording how this hid: while a drag's live override outlived the drag,
it happened to carry the committed params forward, so the stale closure was
invisible. 3.0.1 fixed that leak — correctly, since it also froze attached
graphics mid-drag — and in doing so exposed this. The field that makes the fix
possible had also been deleted at some point as dead weight, which it was at
the time: written by `sync()` and never read.

## 3.1.0

The catalog goes from 53 symbols to 149, covering 106 of the APP-6D
publication's 346 control-measure rows.

### Added

Six families, each authored once and shared by every symbol that is that shape:

- `coneMarkerFamily` — the inverted-cone point markers (checkpoint, rally
  point, passage point and thirteen more). Anchored at the TIP, and rotating
  about the tip, because that is where the thing being marked actually is.
- `labelledLineFamily` — a polyline with its designation posted at both ends and
  optional end caps: phase line, LD, LD/LC, LOA, FCL, FSCL, FSSL, NFL and the
  rest.
- `scallopLineFamily` — the forward edge of the battle area, the forward line of
  own troops, and the line of contact, whose bumps alternate sides.
- `areaFamily` — a ring of any length with a label block held as a fraction of
  the ring's extent, so it travels with the area instead of being left behind.
  Forty-five zones and areas use it.
- `rangeFanFamily` — concentric range rings, whole or cut to a sector.
- `zigzagFamily` and new `tickRowFamily` shapes (teeth, paired posts) for the
  obstacle lines.

Also `pathPoints()` in `engine/geometry`: reads the positions back out of a
path's `d`, arc parameters included. `pointGlyph` gained rings, closed strokes
and a caller-supplied label slot.

### Changed — read this if you attach units to symbols

- Drawn areas now expose a `center` point handle that moves the whole ring. It
  is their unit anchor: `unitAnchor: 'center'` previously resolved to a centroid
  with no handle behind it, which cannot be attached to, because attaching
  re-applies every other handle and needs the anchor's id.
- The five retrograde arcs (retirement, delay, withdraw, withdraw-under-
  pressure, retrograde notch) moved from `midline` to `start`. A retrograde is
  performed BY a unit, from A towards B.
- The gate crossing and lane marker moved from `midline` to a new `center`
  handle, for the same reason as the areas: a crossing site is a place a unit
  can be given.
- `resolveUnitAnchorHandle` resolves `start` to a `tip` handle when there is no
  `spine0`, `A` or `P1`.
- The aviation axis of advance was authored outside the 0-2048 parameter box (to
  x 2503, y 2172) and rendered clipped, with its tail — the unit's own position
  — off frame. Same shape, scaled into the box.
- Several point markers gained the abbreviation the publication prints for them:
  AMN, CKP, PD, SCP, ACP. These were previously empty.

## 3.0.1

A drag's live override no longer outlives the drag.

`OrderHandleController` paints a drag in progress by writing the in-flight
params into `LiveOverrideStore`, which `TacticOverlay` merges over the stored
order on every repaint. On commit it called `onMilxParamsChange` and left the
override in place; on cancel it wrote the pre-drag params back as an override
rather than removing one. Either way the order was pinned to those params for
the rest of the session: the host's committed params arrived and were painted
over, the attached unit walked away and the graphic never followed, and
anything re-pinning the anchor had no visible effect.

It looked like attachment breaking after the first handle drag, which is
exactly what it was, one layer down. Both paths now clear the override — the
stored order is the truth the moment a drag ends.

Two tests drive a handle through a full press-move-release in jsdom and assert
the store is empty afterwards; both fail against the old behaviour.

## 3.0.0

Axis symbols no longer carry sub-geometry as absolute coordinates. A spine is
re-fitted the moment a symbol is placed on a map — to a route, to a drag, to a
unit that has moved — and anything written down as a fixed point stayed behind
at the position it was authored in. The axis followed the unit while a stray
chevron sat in open country: half a symbol tracking the map and half of it not,
which reads as geometry belonging to something else entirely.

Two symbols were affected, and they are precisely the two that looked broken in
use:

- **`svg-main-attack`** stored `notch: { top, tip, bottom }`. Those three
  points are the head base ± `halfWidth`, reaching `headLen / 2` forward, so
  they are now derived from the head via `axisMainEffortNotch`. The pristine
  symbol is unchanged to within one unit — the authored notch was asymmetric by
  exactly that (260 above the axis, 261 below), a hand-drawing artefact the
  derivation removes.
- **`svg-counterattack-by-fire`** stored `fire.pos`, an absolute point just past
  the pristine tip. It now stores `fire.standoff`, a distance along the axis
  beyond the head, and the brace is built from the head's frame. Its drag
  handle slides it along the axis rather than anywhere on the plane — which is
  the only question that was ever being asked of it.

BREAKING: `params.notch` and `params.fire.pos` are gone. Stored orders carrying
either are not rejected, they are ignored — and since the values could only
ever be correct for a symbol that had never been placed, ignoring them renders
those orders correctly for the first time.

Also added `axisHead` and `axisMainEffortNotch` to the families module, `dot`
to the geometry module, and a test that bends every axis symbol's spine far
from where it was authored and asserts nothing is left behind. That covers the
family, including symbols added later.

## 2.2.0

- `fromAnchored` now withholds the symbol's DECLARED unit-anchor handle, not
  just one called "center".

  The intent was already written down — "something else now owns this order's
  position; don't draw a handle that would fight it for control" — but the
  implementation hardcoded `"center"`. That covered the 18 centre-anchored
  symbols and left the 23 "start"-anchored ones — every axis of advance, every
  attack — with a draggable `spine0`/`A`/`P1` sitting exactly under the
  attached unit marker. Two controls for one point: drag either and they part
  company, which is precisely what an attached graphic must never do.

  Reshape and resize handles stay interactive, and the objective end stays
  draggable: anchoring the unit end freezes that end, not the graphic.

## 2.1.0

Unit attachment was reachable but not quite usable: the pieces existed and a
consumer still could not glue a graphic to a unit correctly. Both gaps were
found building `@acc/decho-mil-map` on top of this package.

- Added `getUnitAnchorHandleId(catalog, name, overrides?)` and
  `resolveUnitAnchorHandle(catalog, name, overrides?)`. `getSymbolAnchorPoint`
  returned the anchor as a POINT, which is enough to place a symbol once and
  not enough to keep it attached: moving a unit means dragging the anchor
  handle and leaving every other handle alone, and you cannot express that
  without the handle's id. Consumers were otherwise re-deriving the resolution
  rules — spine0, else A, else P1, and so on — from that function's prose.
  `getSymbolAnchorPoint` is now a one-line wrapper over the shared resolver, so
  the two cannot disagree.

- `milxFromForAnchorClick` and `resolveFromForUnitPosition` accept the order's
  params. They previously computed the anchor from the symbol's DEFAULTS, so
  for any order that had been edited or fitted to a route — where the anchor
  handle has by definition moved — they solved for the wrong offset and left
  the graphic sitting beside the unit it was supposed to be glued to. The new
  argument is optional and last, so this is additive.

## 2.0.1

First release published from **[DK] Artifact Repo**, where this package now
lives, to the Foundry Artifacts npm repository
`ri.artifacts.main.repository.df396b79-3da5-473f-91c2-7be67d95c46c`. Earlier
versions were published to npmjs.com and reach Foundry through the external
npm proxy.

The source tree that moved in carried `version: 1.0.2` in its `package.json`,
but that field was stale: reconstructing 2.0.0's TypeScript from the
`sourcesContent` in its published sourcemaps and diffing it file by file shows
74 source files, 52 byte-identical and the rest differing only in brace style.
This release is therefore 2.0.0's code, and is versioned as a patch on it
rather than as a 1.x, so that `^2.0.0` consumers are not stranded on an
identical build.

- Removed `OrderHandleController.orders`, a private field written by `sync()`
  and never read.
- Brace style normalised to the home repository's lint rules. No behavioural
  change; the public surface is byte-for-byte the same 47/117/107/0/35/15/4/4
  exports across the eight subpaths as 2.0.0.
- The tarball now ships `src/` as well as `dist/`, so the sourcemaps resolve in
  a consumer.

## 2.0.0

Published from the standalone repository; not documented here at the time.

## 1.0.1

- Fixed `fromAnchored` being silently ignored for every built-in tactical
  graphic: `OrderHandleController` only honored it on the plain-arrow
  fallback path, so the move handle (and, for symbols like Seize whose
  "center" handle doubles as its move control, that handle too) stayed
  draggable even when something else — e.g. an attached unit marker —
  was supposed to own the order's position. Also added
  `resolveFromForUnitPosition` (`@acc/app6d/maplibre`), the
  live/continuous counterpart to `milxFromForAnchorClick`: assigning a
  unit's position straight onto `order.from` leaves most symbols visibly
  offset from the unit (their declared anchor sits a fixed, symbol-specific
  distance from the translation origin `from` actually controls) — this
  function does the correct math on every position update instead of just
  at initial placement. See the README's "Attaching a unit marker to a
  task order" section.
- Added `@acc/app6d/milsymbol`: `resolveSymbol(catalog, sidc,
  options)` resolves a SIDC to whichever library actually covers it — one
  of this library's own tactical graphics (via a real doctrinal SIDC or
  this library's synthetic renderer key) or a
  [milsymbol](https://github.com/spatialillusions/milsymbol) unit/
  equipment/installation icon — behind one shared `asSVG()`/`getAnchor()`/
  `getSize()` shape. milsymbol is an optional peer dependency, same
  treatment as maplibre-gl/react. Also adds `core`'s
  `resolveCatalogNameForSidc` (real SIDC/synthetic key -> catalog name)
  and `getSymbolAnchorPoint` (a symbol's declared anchor point in its own
  param space), and backfills `meta.sidcTaskId` on 41 more built-in
  symbols so real-SIDC resolution covers 46 of the 53 built-in symbols
  (the remaining 7 are unlabeled/generic rendering variants with no
  distinct doctrinal SIDC of their own).
- Fixed `unitAnchor` metadata on several built-in symbols (Screen, Guard,
  Cover, Seize, Occupy, Secure, Fortified Area, Ambush, Fix, Counterattack
  By Fire) where the declared anchor mode didn't match any handle the
  symbol's `handles()` actually exposes, causing click-to-place drift
  between the cursor and the shape's visual anchor (worst cases were
  ~1000px off at high zoom). `milxFromForAnchorClick` now also falls back
  to first/last-point-handle and centroid resolution when a symbol's
  handle names don't follow the `A`/`B`/`P1`/`P2`/`spine*`/`center`
  convention, so this class of bug can't reoccur silently.
- Escaped user-controlled text (labels, colours, order ids) before
  interpolating it into SVG markup strings, closing a stored-XSS vector
  for consumers that pass user-supplied label/colour values through to
  `render()`/`TacticOverlay`.
- Memoized the SIDC → catalog-name lookup per `SymbolCatalog` reference
  instead of rebuilding it on every call (it sits on the drag/pointermove
  hot path).
- Removed an accidental self-dependency on `@acc/app6d` in
  `package.json`.

## 1.0.0

- Breaking change: replaced the mutable, process-wide symbol registry
  (`registerSymbol()` / `listSymbols()` / `getSymbolDefinition()`, plus a
  static `TACTIC_ORDERS` export) with an explicit, immutable
  `SymbolCatalog` value passed into every function that needs to resolve
  symbols. See the README's "Migrating from pre-1.0 versions" section for
  the full API mapping.
- Added the MapLibre adapter, `TacticOverlay`/`OrderHandleController`
  overlay, React hooks (`useTacticGraphics`/`useOrderStore`), and the
  `MapAdapter` interface for supporting other map/canvas backends.
- Added doctrinal task lookups (`lookupTaskForOrder` etc.) and semantic
  order builders (`createOrderBuilders`) under `/core`.
- Added versioned serialization helpers (`serializeOrder`/`migrateOrder`)
  for persisting placed orders across schema changes.
