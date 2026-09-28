// engine/serialization.ts — versioned persistence contract for placed
// orders. Add a new interface + bump ORDER_SCHEMA_VERSION + extend
// migrateOrder() whenever the persisted shape changes; never mutate the
// old interface in place, so historically-stored records keep parsing.
export const ORDER_SCHEMA_VERSION = 1 as const;

export interface SerializedOrderV1 {
  schemaVersion: 1;
  /** symbol/registry name or SIDC this order renders as */
  sidc: string;
  from: [number, number];
  to: [number, number];
  mid?: [number, number];
  colour: string;
  milxScale?: number;
  milxParams?: Record<string, unknown>;
}

export type SerializedOrder = SerializedOrderV1;

/**
 * Normalises any persisted order payload — including pre-versioning legacy
 * records that used flat fromLat/fromLng/toLat/toLng fields and no
 * `schemaVersion` — into the current SerializedOrder shape.
 */
export function migrateOrder(raw: unknown): SerializedOrder {
  const r = (raw ?? {}) as Record<string, unknown>;
  const version = typeof r.schemaVersion === "number" ? r.schemaVersion : 0;

  if (version === 0) {
    return {
      schemaVersion: 1,
      sidc: String(r.tacticSidc ?? r.sidc ?? ""),
      from: [Number(r.fromLng ?? 0), Number(r.fromLat ?? 0)],
      to: [Number(r.toLng ?? 0), Number(r.toLat ?? 0)],
      mid: r.midLng !== undefined && r.midLat !== undefined
        ? [Number(r.midLng), Number(r.midLat)]
        : undefined,
      colour: String(r.colour ?? "#4a7c59"),
      milxScale: typeof r.milxScale === "number" ? r.milxScale : undefined,
      milxParams: (r.milxParams as Record<string, unknown> | undefined) ?? undefined,
    };
  }

  // Already current version (or a version this function doesn't yet know
  // how to upgrade further) — trust the shape via an `unknown` intermediate,
  // since a plain Record<string, unknown> doesn't structurally overlap with
  // SerializedOrderV1's required fields and TS rightly refuses a direct cast.
  return r as unknown as SerializedOrder;
}

export function serializeOrder(o: {
  sidc: string;
  from: [number, number];
  to: [number, number];
  mid?: [number, number];
  colour: string;
  milxScale?: number;
  milxParams?: Record<string, unknown>;
}): SerializedOrder {
  return { schemaVersion: ORDER_SCHEMA_VERSION, ...o };
}