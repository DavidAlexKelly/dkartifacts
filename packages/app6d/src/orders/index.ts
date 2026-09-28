// @acc/app6d/orders — units, the orders given to them, and the
// arithmetic that turns one into a drawn symbol.
//
// WHY THIS IS HERE AND NOT IN A PACKAGE OF ITS OWN
// ------------------------------------------------
// It used to be the core of @acc/decho-mil-map, which existed to compose this
// package with a Foundry basemap. Once `/extension` made tactical graphics an
// add-on any map can take, what was left of that package split cleanly in two:
// a right-click workflow, which is a product decision and belongs in the
// application that made it, and this — which is doctrine and geometry, and
// belongs beside the symbols it drives.
//
// It sits naturally here because the neighbouring modules already carry half of
// it: `PlacedOrder` and `OrderHandleController` in /maplibre, `unitAttachment`,
// and TACTIC_TASK_CATALOG in /core. `assignOrder` drives the symbol's OWN
// handles (milxHandlesForOrder + applyMilxOrderHandle) rather than doing the
// maths itself, which is only correct if it lives with them: an implementation
// that reimplements that transform drifts from the renderer, and nobody notices
// until a symbol draws a hundred metres from where it was placed.
//
// This entry point is framework-free. The React workflow that used to sit on
// top of it is not here, deliberately.

export type {
  LatLng,
  MilOrder,
  MilOrderDef,
  OrderRoute,
  PlacedMilUnit,
  UnitTemplate,
} from "./types";

export { defaultOrderCatalog } from "./catalog";
export { newId } from "./id";

export {
  assignOrder,
  moveUnitOrders,
  pinAttachedOrders,
  resolveOrderSidc,
  toPlacedOrder,
  withOrderEnd,
  withOrderParams,
  withOrderScale,
  type AssignOrderArgs,
  type MoveUnitArgs,
  type PinOrdersArgs,
  type ProjectFn,
  type UnprojectFn,
} from "./orders";

// Routing is INJECTED, not implemented: real routing means terrain rasters and
// tiled pathfinding graphs, which are enrollment-specific and far heavier than
// a symbology package should carry. This declares the smallest interface it
// needs and draws a straight line when nothing is supplied — see
// @acc/decho-elevation and the pathfinding work for what plugs in.
export {
  resolveRoute,
  sampleRoute,
  straightLineRouter,
  type OrderRouteRequest,
  type OrderRouter,
} from "./routing";

export {
  unitMarkerOffset,
  unitMarkerSvg,
  type UnitMarkerOptions,
} from "./units";
