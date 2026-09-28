// @acc/app6d/core — SIDC resolution, doctrinal task lookups,
// and semantic order builders, ALL operating against an explicit
// SymbolCatalog value (no shared global state, no import side effects).
//
// If you just want the built-in APP-6D catalog with zero setup, import
// APP6D_CATALOG from "@acc/app6d/symbols" and pass it into
// whatever you call here:
//
//   import { APP6D_CATALOG } from "@acc/app6d/symbols";
//   import { resolveTacticSidc, createOrderBuilders } from "@acc/app6d/core";
//
//   const sidc = resolveTacticSidc(APP6D_CATALOG, "Seize");
//   const builders = createOrderBuilders(APP6D_CATALOG);
export * from "./tacticTaskCatalog";
export * from "./tacticOrders";
export * from "./builders";
export * from "../engine/serialization";