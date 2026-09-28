# @acc/app6d
A reusable, framework-agnostic parametric 2D graphic engine for tactical
order graphics — shipped with a built-in APP-6D / MIL-STD-2525-style
symbol catalog, adapter-based map integration (MapLibre GL JS included),
draggable editing handles, and React hooks.

Originally extracted from a NATO exercise scenario-planning tool. Rebuilt
from the ground up to be usable in **any** map/canvas environment, with
**any** symbol set — not just the one it shipped with.

---

## Where this lives now

This package is homed in **[DK] Artifact Repo**, alongside
`@acc/decho-basemap`, and publishes to the same Foundry Artifacts npm
repository. The repository's OSDK React app is its live harness: the route at
`/symbols` renders this catalog through the published subpath specifiers,
resolved to source by the aliases in `vite.config.ts`. See the
[root README](../../README.md) for the packaging conventions, the publish
procedure and how consumers add the registry.

Nothing about the library is Foundry-specific — it makes no network calls and
touches no platform API, so a consuming app needs no scopes and no Resources.

**Versions up to 2.0.0 were published to npmjs.com** and reach Foundry through
the external npm proxy; **2.0.1 is the first release published from here**, to
the Foundry Artifacts repository. Consuming repos need that repository added
under Settings → Libraries to see it.

The source tree that moved in was labelled `1.0.2`, but the field was stale.
Reconstructing 2.0.0's TypeScript from the `sourcesContent` embedded in its
published sourcemaps and diffing it file by file gave 74 files: 52 identical,
20 differing only in brace style, and 2 differing for known reasons (a removed
dead field and a lint directive). The eight public subpaths export exactly the
same 47/117/107/0/35/15/4/4 names. It *is* the 2.0.0 source — hence 2.0.1 as a
patch on it, rather than a 1.x that `^2.0.0` consumers could never see.

### What changed when it moved here

- Built and tested with the repository's toolchain: no nested `node_modules`,
  no `package-lock.json`, no GitHub Actions workflow (Foundry CI runs
  `lint`/`test`/`build` from the root), no nested `eslint.config.js` — the root
  flat config lints `packages/*/src` with the same rules as everything else.
- `files` now ships `src` as well as `dist`, matching the sibling package, so
  the source maps `tsup` emits resolve in a consumer. The old `.npmignore`,
  which excluded `src`, is gone.
- `scripts/smoke-test.sh` copies the repository's installed `milsymbol` instead
  of installing it from the public registry, which a Code Workspace cannot
  reach. It still packs and imports the real tarball.
- One dead private field (`OrderHandleController.orders`, written and never
  read) removed, and `curly` braces applied by `eslint --fix`.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Package layout](#package-layout)
- [Install](#install)
- [Core concept: the `SymbolCatalog`](#core-concept-the-symbolcatalog)
- [Quick start — rendering a symbol](#quick-start--rendering-a-symbol)
- [Adding your own custom symbols](#adding-your-own-custom-symbols)
- [MapLibre integration](#maplibre-integration)
  - [Attaching a unit marker to a task order](#attaching-a-unit-marker-to-a-task-order)
- [React integration](#react-integration)
- [Using a different map library](#using-a-different-map-library-the-mapadapter-interface)
- [Doctrinal task lookups (real APP-6D SIDCs)](#doctrinal-task-lookups-real-app-6d-sidcs)
- [Milsymbol interoperability](#milsymbol-interoperability)
- [Semantic order builders](#semantic-order-builders)
- [Theming and scale limits](#theming-and-scale-limits)
- [Serialization / persistence](#serialization--persistence)
- [Tree-shaking](#tree-shaking)
- [Migrating from pre-1.0 versions](#migrating-from-pre-10-versions)
- [Development](#development)
- [License](#license)

---

## Why this exists

Rendering and editing NATO-style tactical graphics (Seize, Block, Screen,
Counterattack, etc.) as *parametric, draggable, zoom-aware* shapes on a map
is a surprisingly deep problem: you need procedural SVG generation, a
handle system for reshaping each graphic, screen/world coordinate
transforms that stay correct across zoom levels, and map-library glue —
without hard-coding any of it to one specific mapping library or one fixed
set of symbols.

This package solves all of that, and is explicitly designed so that:

- **The symbol catalog is just data you construct**, not something baked
  into the library or mutated through a global registry. You can use the
  built-in ~50-symbol APP-6D catalog, extend it, or build your own from
  scratch with completely different graphics for a completely different
  domain.
- **Nothing depends on shared mutable module state.** Every function that
  needs to know about symbols takes an explicit `SymbolCatalog` value as
  an argument. This makes the library safe to use across any bundler
  configuration — chunk-splitting, tree-shaking, multiple copies loaded in
  a large dependency graph — none of it matters, because there's no global
  state to duplicate or desynchronize.
- **The map integration is decoupled from MapLibre specifically** via a
  small `MapAdapter` interface. MapLibre support ships out of the box; a
  Leaflet, Mapbox GL, or plain-canvas adapter is a few dozen lines to write
  yourself if you need one.

## Package layout

- `@acc/app6d/engine` — zero-dependency graphic engine: geometry primitives, SymbolCatalog, render/getHandles/applyHandle, serialization helpers.
- `@acc/app6d/symbols` — the built-in APP-6D catalog (APP6D_CATALOG), plus tree-shakeable individual symbol modules.
- `@acc/app6d/adapter` — the MapAdapter interface. Implement this for any map/canvas backend.
- `@acc/app6d/core` — SIDC resolution, doctrinal task lookups, semantic order builders.
- `@acc/app6d/maplibre` — MapLibre GL JS adapter + one-call setup (createMaplibreTacticGraphics).
- `@acc/app6d/react` — useTacticGraphics + useOrderStore hooks.
- `@acc/app6d/milsymbol` — resolves a SIDC to either one of this library's tactical graphics or a [milsymbol](https://github.com/spatialillusions/milsymbol) unit/equipment/installation icon, behind one shared asSVG()/getAnchor()/getSize() shape.

## Install

```bash
npm install @acc/app6d
```
maplibre-gl, react, and milsymbol are optional peer dependencies — install
whichever you actually use:
```bash
npm install maplibre-gl   # if using @acc/app6d/maplibre
npm install react          # if using @acc/app6d/react
npm install milsymbol      # if using @acc/app6d/milsymbol
```
`@acc/app6d/engine`, `/symbols`, `/adapter`, and `/core` have zero runtime dependencies and work in any JS environment (Node, browser, SSR).

## Core concept: the SymbolCatalog

Everything in this library revolves around one type: `SymbolCatalog`. It's
a plain, immutable value — a name → symbol-definition mapping —
constructed once and passed explicitly into every function that needs to
know what symbols exist.

```javascript
import { SymbolCatalog } from "@acc/app6d/engine";

const catalog = new SymbolCatalog({
  "my-symbol": { title: "...", params: {...}, generate: (p) => [...], handles: (p) => [...] },
});
```

There is no global registry. You never "register" a symbol into some
shared state that other code implicitly reads from later — you build a
catalog value and pass it wherever it's needed. This is a deliberate
design choice: earlier versions of this library used a mutable registry,
and it turned out to be fragile across different bundler configurations
(see Migrating from pre-1.0 versions
if you're upgrading). A `SymbolCatalog` has no such fragility — if a
bundler ends up loading the module that constructs one more than once,
each copy just builds an identical, independent, immutable value. There's
nothing to desynchronize.

The built-in APP-6D catalog is ready-made:

```javascript
import { APP6D_CATALOG } from "@acc/app6d/symbols";

APP6D_CATALOG.list();          // ["svg-block", "svg-seize", "svg-screen-ss", ...]
APP6D_CATALOG.get("svg-seize"); // the SymbolDefinition for Seize
```

## Quick start — rendering a symbol

```javascript
import { APP6D_CATALOG } from "@acc/app6d/symbols";
import { render, renderSVG } from "@acc/app6d/engine";

// Inner <g> markup — insert via innerHTML / dangerouslySetInnerHTML
const inner = render(APP6D_CATALOG, "svg-seize", undefined, { stroke: "#4a90d9" });

// Standalone <svg> document
const svg = renderSVG(APP6D_CATALOG, "svg-block", { barrierHalf: 900 });
```

### Editing handles

Every symbol exposes a set of draggable handle descriptors — the engine
tells you where each handle is and what parameter it edits; drawing
the actual marker and wiring up drag events is up to your rendering layer
(or use the built-in OrderHandleController — see MapLibre integration).

```javascript
import { getHandles, applyHandle } from "@acc/app6d/engine";

const handles = getHandles(APP6D_CATALOG, "svg-block");
// [{ id: "A", kind: "point", pos: {x, y}, set: (pos) => ({...}) }, ...]

// User drags handle "A" to a new position:
const newParams = applyHandle(APP6D_CATALOG, "svg-block", currentParams, "A", { x: 500, y: 500 });
```

### Rendering to something other than SVG

If you need Canvas2D, WebGL, or PDF output instead of SVG, use `getParts()` to get the raw geometric description and write your own
renderer against it:

```javascript
import { getParts } from "@acc/app6d/engine";

const parts = getParts(APP6D_CATALOG, "svg-seize");
// [{ kind: "stroke", d: "M...", dashed: false }, { kind: "text", text: "S", pos: {...}, ... }, ...]
```

## Adding your own custom symbols

Because a `SymbolCatalog` is just data, extending the built-in set (or
replacing it entirely) requires no changes to the library at all:

```typescript
import { APP6D_CATALOG } from "@acc/app6d/symbols";
import type { SymbolDefinition } from "@acc/app6d/engine";

const myCustomSymbol: SymbolDefinition = {
  title: "My Custom Icon",
  params: { center: { x: 1000, y: 1000 }, radius: 400 },
  generate: (p) => [
    { kind: "stroke", d: `M${p.center.x - p.radius},${p.center.y} A${p.radius},${p.radius} 0 1,0 ${p.center.x + p.radius},${p.center.y}`, dashed: false },
  ],
  handles: (p) => [
    { id: "center", kind: "point", pos: p.center, set: (pos) => ({ center: pos }) },
  ],
};

// .extend() returns a NEW catalog — the original is untouched.
const myCatalog = APP6D_CATALOG.extend({
  "my-custom-icon": myCustomSymbol,
});

myCatalog.list(); // includes both the built-in ~50 symbols AND "my-custom-icon"
```

Building a catalog from scratch with no built-in symbols at all works the
same way — just construct a SymbolCatalog directly instead of extending `APP6D_CATALOG`:

```javascript
const domainSpecificCatalog = new SymbolCatalog({
  "floor-plan-door": { /* ... */ },
  "floor-plan-window": { /* ... */ },
});
```

This is the whole extension mechanism. No registration function, no
import-order dependency, no shared state.

## MapLibre integration

The `/maplibre` subpath wires everything together: rendering the symbols
onto the map, keeping them positioned correctly across pan/zoom, and
managing draggable edit handles.

```javascript
import { createMaplibreTacticGraphics } from "@acc/app6d/maplibre";
import { APP6D_CATALOG } from "@acc/app6d/symbols";

const handle = createMaplibreTacticGraphics(APP6D_CATALOG, map, {
  onMoveEnd: (id, end, world) => { /* persist the new [lng, lat] */ },
  onMilxParamsChange: (id, params) => { /* persist the new shape params */ },
  onScaleChange: (id, scale) => { /* persist the new size multiplier */ },
  onRemove: (id) => { /* remove the order from your state */ },
});

handle.update(placedOrders); // call whenever your order list changes
handle.setEditable(false);   // hide edit handles (e.g. read-only mode)
handle.destroy();            // clean up on unmount
```

### The PlacedOrder shape

```typescript
interface PlacedOrder {
  id: string;
  from: [number, number];   // [lng, lat]
  to: [number, number];     // [lng, lat]
  mid?: [number, number];
  colour: string;
  tacticSidc?: string;      // renderer key, e.g. "SVGSEIZE" — see note below
  tacticLabel?: string;
  milxScale?: number;
  milxParams?: Record<string, unknown>;
  fromAnchored?: boolean;   // true if `from` is externally controlled (e.g. attached to a unit marker)
  toAnchored?: boolean;
}
```

Note on `tacticSidc`: this is a synthetic renderer lookup key
derived from the catalog entry's name ("svg-seize" → "SVGSEIZE"), not a real MIL-STD-2525/APP-6 SIDC. See Doctrinal task lookups for
how to get the real doctrinal SIDC alongside it.

### Attaching a unit marker to a task order

A common pattern — especially alongside
[milsymbol](#milsymbol-interoperability) unit icons — is letting a unit
"become" a task order's position: e.g. the Seize order for a given
objective should always sit on top of whichever unit is actually
assigned to seize it, tracking that unit as it moves.

Two things you need, both explained here because getting either one
wrong is what makes this feel fiddly:

1. **`from` is not the same point as the symbol's own visual anchor.**
   Every built-in symbol's shape is authored in its own local coordinate
   space and translated into place via `from` — but the symbol's
   *declared* anchor (the point `unitAnchor` designates: a Seize's
   center, a Block's first corner, ...) usually sits some fixed offset
   away from that translation origin, not exactly on top of it. Setting
   `order.from = unit.position` directly will visibly leave the graphic
   floating near the unit rather than glued to it — sometimes by a lot,
   depending on the symbol. Use `resolveFromForUnitPosition` instead of
   assigning the unit's position straight onto `from`; it does the same
   math `milxFromForAnchorClick` uses for initial click-placement, just
   re-run on every position update instead of once:

   ```javascript
   import { resolveFromForUnitPosition } from "@acc/app6d/maplibre";

   // Call this every time the attached unit's position changes (a move
   // event, a poll, whatever your unit layer already does):
   const from = resolveFromForUnitPosition(APP6D_CATALOG, adapter, order.tacticSidc, unit.position, order.milxScale);
   onOrderUpdate(order.id, { from, fromAnchored: true });
   ```

   `adapter` is whatever `MapAdapter` you're already using (the one
   `createMaplibreTacticGraphics`/`useTacticGraphics` builds internally
   isn't exposed, so construct your own `MaplibreAdapter` — or any
   `MapAdapter` — for this call; it's cheap and stateless).

2. **Set `fromAnchored: true` while it's attached.** This hides the
   order's own move handle (and, for symbols like Seize whose "center"
   handle doubles as its move control, that handle too) so your unit
   marker and this library's own drag handling aren't fighting over the
   same point. Reshape/resize handles (radius, spine points, the scale
   handle, ...) stay interactive — only *moving* the symbol is locked to
   the unit. Set it back to `false` (or omit it) to detach and let the
   order be dragged freely again.

## React integration

```javascript
import { useTacticGraphics } from "@acc/app6d/react";
import { APP6D_CATALOG } from "@acc/app6d/symbols";

function MyMapLayer({ map, orders, onOrderUpdate }) {
  useTacticGraphics(APP6D_CATALOG, map, orders, {
    onMoveEnd: (id, end, [lng, lat]) => onOrderUpdate(id, { [end]: [lng, lat] }),
    onMilxParamsChange: (id, params) => onOrderUpdate(id, { milxParams: params }),
    onScaleChange: (id, scale) => onOrderUpdate(id, { milxScale: scale }),
    onRemove: (id) => onOrderUpdate(id, null),
    scaleRange: { min: 0.05, max: 10 }, // optional — see Theming and scale limits below
  });
  return null;
}
```

Pass a stable catalog reference (module-level `APP6D_CATALOG`, or your
own catalog built once outside the component / in a `useMemo` with no
deps) — the hook re-mounts its internal overlay whenever the catalog
reference changes.

### `useOrderStore` — optional self-managing state

For simple cases where you don't want to hand-roll add/remove/update
reducers yourself:

```javascript
import { useOrderStore } from "@acc/app6d/react";

const store = useOrderStore();
useTacticGraphics(APP6D_CATALOG, map, store.orders, {
  onMoveEnd: store.moveEnd,
  onMilxParamsChange: store.setParams,
  onScaleChange: store.setScale,
  onRemove: store.remove,
});

store.add({ id: "order-1", from: [18.8, 54.26], to: [18.8, 54.26], colour: "#4a90d9", tacticSidc: "SVGSEIZE" });
```

## Using a different map library (the `MapAdapter` interface)

MapLibre support is built on a small adapter interface — implement it
yourself to support Leaflet, Mapbox GL JS, a fixed background image with
plain screen coordinates, or anything else:

```typescript
export interface MapAdapter {
  project(world: [number, number]): { x: number; y: number };
  unproject(px: { x: number; y: number }): [number, number];
  getContainer(): HTMLElement;
  getZoom(): number;
  onCameraChange(cb: () => void): () => void; // return an unsubscribe fn
  createMarker(el: HTMLElement, world: [number, number]): MarkerHandle;
}

export interface MarkerHandle {
  setPosition(world: [number, number]): void;
  getPosition(): [number, number];
  getElement(): HTMLElement;
  remove(): void;
}
```

Once you have an adapter, use `TacticOverlay` and `OrderHandleController`
directly (these are what `createMaplibreTacticGraphics` wires together
internally):

```javascript
import { TacticOverlay, OrderHandleController, LiveOverrideStore } from "@acc/app6d/maplibre";
// (TacticOverlay/OrderHandleController/LiveOverrideStore are adapter-agnostic
// despite living under the /maplibre subpath for convenience — they accept
// any MapAdapter implementation, not just MaplibreAdapter.)

const liveStore = new LiveOverrideStore();
const overlay = new TacticOverlay(catalog, myAdapter, liveStore, { onRemove });
const handles = new OrderHandleController(catalog, myAdapter, liveStore, { onMoveEnd, onMilxParamsChange, onScaleChange, onRemove });

overlay.update(orders);
handles.sync(orders);
```

`WorldCoord` (the `[number, number]` tuple) is intentionally generic — for
map libraries it's typically `[lng, lat]`, but for a non-geographic canvas
it can just be raw `[x, y]` in whatever unit your `MapAdapter` uses.

## Doctrinal task lookups (real APP-6D SIDCs)

`tacticSidc` on a `PlacedOrder` is a synthetic renderer key, not a real
SIDC. The real doctrinal identity of a tactical task (e.g. "Occupy" → `GFTPO---------G`) lives in a separate lookup table, independent of the
symbol catalog:

```javascript
import { lookupTaskForOrder, lookupTaskByName, lookupTaskBySidc, TACTIC_TASK_CATALOG } from "@acc/app6d/core";

const task = lookupTaskForOrder("Occupy");
// { id: "occupy", name: "Occupy", sidc: "GFTPO---------G", description: "...", effect: "occupy", ... }
```

Not every registered graphic maps to exactly one doctrinal task (some are
pure control-measure graphics, or visual variants of the same underlying
concept) — `lookupTaskForOrder` returning `undefined` for those is
expected, not a bug. A common pattern is to store both identifiers
side-by-side on your own order/arrow type:

```typescript
interface MyStoredOrder {
  tacticSidc?: string;  // renderer key — for the map to draw the right shape
  docSidc?: string;     // real doctrinal SIDC — for exports, cross-referencing, filtering
}

const docSidc = lookupTaskForOrder(taskName)?.sidc;
```

Going the other way — from a real doctrinal SIDC back to a catalog entry
— use `resolveCatalogNameForSidc`. It also still accepts this library's
own synthetic renderer keys, so it's a safe drop-in wherever you're
currently keying off `tacticSidc` directly:

```javascript
import { resolveCatalogNameForSidc } from "@acc/app6d/core";

resolveCatalogNameForSidc(APP6D_CATALOG, "GFTPO---------G"); // "svg-occupy"
resolveCatalogNameForSidc(APP6D_CATALOG, "SVGSEIZE");        // "svg-seize"
resolveCatalogNameForSidc(APP6D_CATALOG, "SFGPUCI-----D---"); // undefined — a unit SIDC, not a tactical graphic
```

Not every built-in symbol has a doctrinal SIDC catalogued yet (a few are
unlabeled/generic rendering variants) — those still resolve via their
synthetic key, just not via a real SIDC.

## Milsymbol interoperability

[milsymbol](https://github.com/spatialillusions/milsymbol) renders
MIL-STD-2525/APP-6 *unit, equipment, and installation* icons from a real
SIDC — a different job from this library's *tactical graphics* (Seize,
Block, Screen, ...), which milsymbol doesn't render at all. If your app
uses both — milsymbol for unit markers, this library for the graphics
connecting/relating to them — `resolveSymbol` picks whichever one
actually covers a given SIDC and hands back a matching `asSVG()`/
`getAnchor()`/`getSize()` object either way, so placement code doesn't
need to know which library actually drew it:

```javascript
import { resolveSymbol } from "@acc/app6d/milsymbol";
import { APP6D_CATALOG } from "@acc/app6d/symbols";

// A real doctrinal SIDC for a tactical graphic — resolves against this library.
const occupy = resolveSymbol(APP6D_CATALOG, "GFTPO---------G", {
  params: { center: { x: 1050, y: 950 } }, // milxParams-shaped overrides
  style: { stroke: "#4a90d9" },
});
occupy.kind;        // "tactical-graphic"
occupy.asSVG();     // standalone <svg>...</svg>
occupy.getAnchor(); // { x, y } in the same local pixel box asSVG() renders into
occupy.getSize();   // { width, height } of that box

// A real unit SIDC — not one of this library's graphics, falls through to milsymbol.
const unit = resolveSymbol(APP6D_CATALOG, "SFGPUCI-----D---", {
  milsymbolOptions: { size: 35, uniqueDesignation: "1-8 IN" },
});
unit.kind; // "milsymbol"
```

`resolveSymbol`'s third argument is `{ params?, style?, size? }` for the
tactical-graphic branch and `{ milsymbolOptions? }` for the milsymbol
branch — pass whichever applies; the other branch's fields are ignored.

milsymbol is only imported by this subpath (same treatment as
maplibre-gl under `/maplibre`) — install it if you use `/milsymbol`, skip
it otherwise.

## Semantic order builders

For programmatic placement (e.g. from an LLM-generated plan) without
needing to know the internal parametric shape of each symbol:

```javascript
import { createOrderBuilders } from "@acc/app6d/core";
import { APP6D_CATALOG } from "@acc/app6d/symbols";

const builders = createOrderBuilders(APP6D_CATALOG);
const seizeOrder = builders.seize([18.8, 54.26], 500);      // centre point, radius in "real units"
const blockOrder = builders.block([18.7, 54.2], [18.75, 54.22]);
```

Status: these builders use approximate heuristics to map real-world
distances onto each symbol's internal parameter space (documented
in-code) — they are a convenience layer, not a calibrated projection.
Treat them as a reasonable starting point rather than precision
placement; adjust `BuilderScale.unitsPerRealUnit` to tune for your map's
coordinate system.

## Theming and scale limits

### Handle appearance

```javascript
useTacticGraphics(catalog, map, orders, {
  theme: {
    endpointHandleSize: 28,
    positionHandleSize: 24,
    sectionHandleSize: 18,
    scaleHandleSize: 16,
    handleBorderWidth: 3,
    handleFillIdle: "rgba(255,255,255,0.9)",
  },
});
```

### Resize handle bounds

By default, dragging a symbol's resize handle clamps `milxScale` between `0.001` and `3.0`. Override this if your use case needs symbols scaled up
(or down) further — e.g. depicting a large area of operations at low zoom:

```javascript
useTacticGraphics(catalog, map, orders, {
  scaleRange: { min: 0.05, max: 10 },
});
```

## Serialization / persistence

If you're persisting placed orders (e.g. to a database), use the
versioned serialization helpers rather than hand-rolling your own JSON
shape — this protects you if the internal shape ever needs to change in a
future version:

```javascript
import { serializeOrder, migrateOrder, ORDER_SCHEMA_VERSION } from "@acc/app6d/engine";

const stored = serializeOrder({ sidc, from, to, colour, milxParams });
// { schemaVersion: 1, sidc, from, to, colour, milxParams }

// Later, when loading — migrateOrder handles both current-version records
// AND legacy pre-versioning records with flat fromLat/fromLng/toLat/toLng
// fields, upgrading them to the current shape automatically.
const restored = migrateOrder(JSON.parse(storedJson));
```

## Tree-shaking

If bundle size matters and you only use a handful of symbols, import
individually rather than pulling in the full ~50-symbol catalog:

```javascript
import { blockSymbol, BLOCK_NAME } from "@acc/app6d/symbols/individual";
import { SymbolCatalog } from "@acc/app6d/engine";

const minimalCatalog = new SymbolCatalog({ [BLOCK_NAME]: blockSymbol });
```

Every built-in symbol is individually tree-shakeable this way — importing
`@acc/app6d/symbols/individual` and only referencing e.g.
`blockSymbol` pulls in just that symbol's module and its geometry
dependencies, not the other ~52.

## Migrating from pre-1.0 versions

1.0.0 is a breaking change. Earlier versions (0.x) used a mutable,
process-wide symbol registry (`registerSymbol()` / `listSymbols()` / `getSymbolDefinition()`, plus a static `TACTIC_ORDERS` export) instead of
an explicit `SymbolCatalog` value. That design turned out to be fragile
across different bundler chunk-splitting/tree-shaking configurations —
duplicated module instances could end up with disconnected copies of the
registry, causing symbols to silently vanish for some consumers while
working for others depending on build configuration.

| Before (0.x) | After (1.0+) |
| :--- | :--- |
| `registerSymbol(name, def)` | `new SymbolCatalog({ [name]: def })` or `catalog.extend({ [name]: def })` |
| `listSymbols()` | `catalog.list()` |
| `getSymbolDefinition(name)` | `catalog.get(name)` |
| `TACTIC_ORDERS` (static array) | `getTacticOrders(catalog)` |
| `render(name, ...)` | `render(catalog, name, ...)` |
| `getHandles(name, ...)` | `getHandles(catalog, name, ...)` |
| `applyHandle(name, ...)` | `applyHandle(catalog, name, ...)` |
| `isMilxOrder(sidc)` | `isMilxOrder(catalog, sidc)` |
| `resolveTacticSidc(taskName)` | `resolveTacticSidc(catalog, taskName)` |
| `useTacticGraphics(map, orders, opts)` | `useTacticGraphics(catalog, map, orders, opts)` |
| `createMaplibreTacticGraphics(map, opts)` | `createMaplibreTacticGraphics(catalog, map, opts)` |

In every case, pass `APP6D_CATALOG` from `@acc/app6d/symbols`
if you were previously relying on the built-in symbol set.

See `CHANGELOG.md` for the full version history.

## Development

Install once at the **repository root** — this directory has no
`node_modules` of its own and borrows the root toolchain:

```bash
npm install                  # from the repository root

cd packages/app6d
npm run typecheck
npm test
npm run build
npm run smoke                # packs the real tarball and imports every subpath
```

Linting is repo-wide (`npm run lint` at the root) and covers `src/` here with
the same rules as everything else. Foundry CI runs `lint`, `test` and `build`
from the root on every commit; the smoke test is deliberately manual, since it
packs a tarball and is worth running by hand before a publish.

For the publish procedure see the [root README](../../README.md). Bump the
version here and add a `CHANGELOG.md` entry in the same commit — and check
npmjs.com too while the two registries both carry this package.

## License

MIT. MIL-STD-2525/APP-6 doctrine itself is public domain; only this
implementation is copyrighted.