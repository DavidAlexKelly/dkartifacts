# @acc/decho-pathfinding

Terrain-aware routing over the tiled pathfinding graphs in Foundry.

**Headless: there is no map here.** Graph cells are fetched, decoded, searched
and discarded — never rendered, never added to a style, never given to MapLibre.
The core imports neither `maplibre-gl` nor `react`, so it runs in a worker, a
script or an app with no map at all. Drawing the result is one optional import
away, and even that types the map structurally.

Every read goes through `@acc/decho-foundry-bytes`, so graph cells share an
access token, a resident LRU, the Cache Storage tier, request de-duplication and
the concurrency lanes with anything else built on it — `@acc/decho-basemap`
included, when both are present. Like the basemap, it makes no external network
calls.

It is also the router `@acc/decho-mil-map` declares and deliberately does not
implement.

## Quick start

```tsx
// once, at application startup — the SAME call the basemap needs, no second one
import { configureFoundryBytes } from "@acc/decho-foundry-bytes";
configureFoundryBytes({ foundryUrl, getToken: auth, platformClient });
```

```tsx
import { usePathfinding } from "@acc/decho-pathfinding/react";
import { useRouteLayer } from "@acc/decho-pathfinding/map";

const { route, result, routing, error } = usePathfinding();
useRouteLayer(map, result?.waypoints ?? null);

await route({ lat: 48.85, lon: 2.35 }, { lat: 49.1, lon: 2.9 }, { profile: TRACKED });
```

Or, with no React and no map:

```ts
import { createPathfinder, WHEELED } from "@acc/decho-pathfinding";

const pathfinder = createPathfinder({ profile: WHEELED });
const { waypoints, distanceM, etaS } = await pathfinder.route(from, to);
```

## Composing with the military map

`@acc/decho-mil-map` accepts an injected `OrderRouter` and draws a straight line
when there is none. This package produces one, and neither package imports the
other — the shapes match structurally, and the app is what wires them together:

```tsx
import { useOrderRouter } from "@acc/decho-pathfinding/react";

const { router } = useOrderRouter({
  profileFor: ({ unit }) => profileForUnit(unit),
  onError: (err) => toast(String(err)),
});

<DechoMilMap router={router} units={units} orders={orders} … />;
```

Assigned orders now follow terrain. Remove the prop and everything still works,
with straight lines.

## Three layers, pick your altitude

| Layer | Import | Use when |
|---|---|---|
| `createGraphSource` + `findRoute` | `.` | You want to own the cell cache, prefetching, or several profiles over one copy of the graph |
| `createPathfinder` | `.` | No React, or a worker, or a script |
| `useOrderRouter` / `usePathfinding` | `.../react` | You want routing in a React app |
| `useRouteLayer` / `attachViewportPrefetch` | `.../map` | You have a live map to draw on |

Three surfaces, in order of how much they assume. A consumer resolves only what
it imports, so a routing worker never pulls in the map glue — that is the point
of routing not being a map feature.

Nothing in any of them imports `maplibre-gl`. Even the `/map` entry types the
handful of methods it uses structurally, so drawing the result in deck.gl, a
canvas overlay or a table of waypoints costs nothing.

### Warming cells as the user moves

Routing already warms the corridor between the two points it is given. If
routing is the *point* of a screen, the first click can be made instant too:

```ts
const detach = attachViewportPrefetch(map, pathfinder.source, { minZoom: 8 });
```

Off by default, and guarded by zoom: a 2° cell is a continent at z4, and
prefetching a viewport full of them is neither useful nor affordable. Above the
threshold it warms at most a handful of cells, and never more than stay
resident.

## Mobility profiles

Every cell declares the cost model and stores only its raw inputs:

```
dist_m * (1 + k_vehicle * slope) * m[vehicle][terrain]
```

`k_vehicle` and `m[vehicle][terrain]` are supplied per query, so one graph
serves every vehicle and a new mobility class is an object literal:

```ts
const HEAVY: VehicleProfile = {
  id: "heavy",
  kVehicle: 1.2,
  terrain: { 1: 1.6, 2: 1 },   // 1 = open, 2 = road
  maxSlope: 0.25,              // stricter than the data's 0.4
  speedMps: { 1: 5, 2: 9 },    // optional, for ETA
};
```

`FOOT`, `WHEELED` and `TRACKED` are shipped as reasonable starting points. They
are this package's opinion, not the dataset's — the chunks carry no mobility
table.

**Two traps the package guards, worth knowing about:**

- `slope` is signed and stored **per direction** (`from→to` and `to→from` are
  separate rows). With `max_slope` 0.4 in the data, a profile with
  `kVehicle > 2.5` would drive `1 + k·slope` negative on a descent, and a
  negative edge does not crash Dijkstra — it silently invalidates it. Costs are
  clamped at `slopeFloor`, and the A* heuristic is derived from the same floor
  so the two cannot disagree.
- A profile may be stricter about slope than the data, never looser: edges above
  the cell's `max_slope` were never written.

## How a route is computed

1. **Snap** both endpoints to the nearest node, via a per-cell bucket index.
   Beyond `snapRadiusM` you get `NoNodeNearbyError` rather than a route from
   40 km away.
2. **Warm the corridor** — cells along the straight line, prefetched in the
   background exactly as the basemap prefetches neighbouring archives.
3. **A\*** in metre-equivalents, with the heuristic multiplied by the cheapest
   per-metre cost the profile can produce, which keeps the result provably
   optimal. `heuristicWeight > 1` trades that for speed, explicitly.
4. **Load cells as the frontier reaches them.** A node's border mask answers
   "does expanding this need a neighbouring cell?" in one array read, so the
   await is skipped for almost every node.
5. **Simplify** the grid staircase away with Douglas–Peucker in metres,
   defaulting to a third of the node spacing. Every retained vertex is still an
   original graph node.

Budgets — `maxCells`, `maxExpandedNodes`, `timeBudgetMs` — are reported, not
hidden: `NoRouteError.reason` distinguishes `disconnected` from `cell-budget`,
`node-budget` and `time-budget`, and `result.truncated` says when a limit
changed the answer. Every call takes an `AbortSignal`.

## The data, and what this package infers

`Pathfinding` in Offline World, one directory per cell:

```
pathfinding/c091_r018/meta.json    bbox, spacing_m, max_slope, counts, format
pathfinding/c091_r018/nodes.bin    NODE v1: lon,f32 lat,f32 elev,f32 flags,u8
pathfinding/c091_r018/edges.bin    EDGE v1: from,u32 to,u32 dist,f32 slope,f32 terrain,u8
```

Cells are cut on the **same 2° grid as the basemap's z12 layer**
(`gridOrigin -180, 85`). That is a convention, so it is checked: a cell whose
declared bbox disagrees with where the grid says it is fails loudly rather than
routing 2° adrift.

**Strides are derived, not assumed.** 13 and 17 are unaligned, so a generator
that padded to 16/20 would produce files a hardcoded parser reads as noise —
plausible coordinates, silently wrong routes. `meta.json` carries exact record
counts, so `stride = byteLength / count`, and endianness is settled by checking
that decoded coordinates land inside the cell's own bbox. A layout that decodes
under neither endianness throws `MalformedGraphError` with the numbers it saw.

**`flags` is ignored for passability.** The dataset drops impassable ground
rather than flagging it (an arctic cell has 1 782 nodes where a full lattice
would have ~22 000), so nothing here guesses at a blocked bit. Mis-guessing one
would silently delete valid routes.

### Cross-cell stitching, and why it is the weak point

Node indices are cell-local and **no cell contains an edge leaving it**. Loaded
side by side the cells are disjoint graphs, so this package reconstructs the
join: border bands, sorted along each edge, merged against the facing band of
the neighbour, linked to the nearest few counterparts. `dist` is real
great-circle distance and `slope` the real gradient between the two nodes'
stored elevations — the same inputs the generator's own cost model consumes.
Only `terrain` is inferred, generously: if both endpoints touch a road edge, the
link is a road.

The link radius is **measured, not assumed**. A radius fixed at a multiple of
the declared `spacing_m` produced *zero* links between cells whose lattice was
anisotropic, and the failure was silent — routing simply stopped at the
boundary, as though the terrain were impassable. So if the nominal radius finds
nothing, the closest real pair across the seam sets the radius instead, up to a
ceiling that stops a genuine coverage gap being bridged by an invented 50 km
edge. When that happens it logs, because it means the declared spacing and the
real one disagree.

**If the pipeline can ever be changed, emit halo edges** — per cell, the edges
that leave it — and this entire mechanism becomes exact and free. Failing that,
a `pathfinding/manifest.json` listing the cells that exist (with their sizes)
would remove the 404 probing, let prefetch spend a byte budget, and give the
persistent cache a size source. Both are additive; the runtime tolerates their
absence today.

## Requirements on the consuming application

1. **Scope:** `api:use-datasets-read`.
2. **Resource:** the pathfinding dataset must be added as a Resource on the OAuth
   app in Developer Console. **This is a different dataset from the basemap's** —
   adding the basemap's Resource does not cover it, and the scope alone returns
   403. This is the single most common way this package appears broken.
3. **Peers:** `@acc/decho-foundry-bytes@>=0.1.0` — *not* the basemap. React is
   optional, and only needed for the `/react` entry.

## Cost of a cell

A full land cell at 1500 m spacing is roughly 22 000 nodes and 180 000 edges —
about 3.5 MB of source bytes, an order of magnitude smaller than a z12 basemap
archive. Parsed, it becomes columnar typed arrays in CSR form; the graph source
keeps 24 of them (96 MB) by default, which is a budget separate from the byte
layer's own resident cache of raw bodies.

## Publishing

Identical to the sibling packages — see `@acc/decho-basemap`'s README for the
Code Workspace token dance, which is not the one the Artifacts UI prints.

```bash
cd packages/decho-pathfinding
npm run build      # builds @acc/decho-basemap first; see the note in package.json
npm publish --registry "$REG/repositories/ri.artifacts.main.repository.df396b79-3da5-473f-91c2-7be67d95c46c/contents/release/npm/"
```
