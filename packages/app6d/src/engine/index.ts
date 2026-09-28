// @acc/app6d/engine — generic, domain-agnostic parametric
// graphic engine: geometry primitives, the SymbolCatalog value type
// (engine/catalog.ts — construct one and pass it explicitly, no shared
// state), rendering, and a versioned serialization contract. Zero
// dependencies. No APP-6D knowledge lives here — see
// @acc/app6d/symbols for the built-in catalog.
export * from "./geometry";
export * from "./types";
export * from "./catalog";
export * from "./render";
export * from "./serialization";