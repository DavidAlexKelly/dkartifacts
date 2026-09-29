/**
 * @acc/decho-pathfinding — framework-free core.
 *
 * Terrain-aware routing over the tiled pathfinding graphs in Foundry. There is
 * no map here: cells are fetched, decoded, searched and discarded, never
 * rendered. Reads go through @acc/decho-foundry-bytes, so they share a token,
 * an LRU, the Cache Storage tier, request de-duplication and the concurrency
 * lanes with anything else built on it — the basemap included, when present.
 *
 * The React surface lives at "@acc/decho-pathfinding/react" and is deliberately
 * not re-exported here, for the same reason the sibling packages do the same:
 * a barrel that pulled React (and, through the route layer, a live map) into
 * every consumer would put it into workers and headless callers that only
 * wanted to compute a path.
 *
 *   import { createPathfinder } from "@acc/decho-pathfinding";
 *   import { usePathfinding }   from "@acc/decho-pathfinding/react";
 */

export {
  PATHFINDING_STORE,
  configureDefaultGraphStore,
  defaultGraphStore,
  type GraphStore,
} from "./core/defaults.js";

export {
  createPathfinder,
  type Pathfinder,
  type PathfinderOptions,
} from "./core/pathfinder.js";

export {
  findRoute,
  type GeoPoint,
  type RouteOptions,
  type RouteResult,
} from "./core/route.js";

export {
  createGraphSource,
  MAX_NODES_PER_CELL,
  type CellStatus,
  type CellStatusListener,
  type GraphSource,
  type GraphSourceOptions,
  type GraphSourceStats,
  type NeighbourVisitor,
} from "./core/graphSource.js";

export {
  DEFAULT_PROFILE,
  DEFAULT_SLOPE_FLOOR,
  FOOT,
  TERRAIN_OPEN,
  TERRAIN_ROAD,
  TRACKED,
  WHEELED,
  compileProfile,
  edgeCost,
  edgeSeconds,
  type CompiledProfile,
  type VehicleProfile,
} from "./core/profiles.js";

// The adapter that satisfies @acc/app6d/orders' injected OrderRouter.
export {
  createOrderRouter,
  type LatLngLike,
  type OrderRouteLike,
  type OrderRouteRequestLike,
  type OrderRouterLike,
  type OrderRouterOptions,
} from "./core/orderRouter.js";

// The grid is exported because it is the contract between this dataset and the
// basemap's z12 cut: anything reasoning about coverage needs the same
// arithmetic, and a second copy of it is how the two quietly drift apart.
export {
  OPPOSITE,
  SIDES,
  SIDE_EAST,
  SIDE_NORTH,
  SIDE_SOUTH,
  SIDE_WEST,
  cellBounds,
  cellFor,
  cellKey,
  cellsAlongLine,
  gridMismatch,
  neighbourCell,
  parseCellKey,
  type CellBounds,
  type CellCoord,
  type CellGrid,
  type Side,
} from "./core/grid.js";

// The parser and the cell index are exported for testing, for diagnostics
// panels, and for anything that wants to read a chunk without routing over it.
export {
  assertKnownLayout,
  parseCellGraph,
  type CellGraph,
  type CellMeta,
} from "./core/format.js";

export { createLoadedCell, type BorderBand, type LoadedCell } from "./core/cell.js";

export {
  DEFAULT_STITCH_OPTIONS,
  stitchCells,
  type StitchLink,
  type StitchOptions,
  type StitchResult,
} from "./core/stitch.js";

export { simplifyPath, type Waypoint } from "./core/simplify.js";

export { EARTH_RADIUS_M, haversineM } from "./core/geo.js";

export { createMinHeap, type MinHeap } from "./core/heap.js";

export {
  MalformedGraphError,
  NoGraphDataError,
  NoNodeNearbyError,
  NoRouteError,
  PathfindingError,
  isPathfindingError,
  type PathfindingErrorKind,
} from "./core/errors.js";
