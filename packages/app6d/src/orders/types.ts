/**
 * The shapes a host application exchanges with <DechoMilMap/>.
 *
 * All of them are plain serialisable data: no class instances, no MapLibre
 * types, no library types leaking through. That is deliberate — a host stores
 * these in its own state, persists them to Foundry objects or a phase document,
 * and hands them straight back. `MilOrder` is converted to the tactical
 * graphics library's `PlacedOrder` internally (see core/orders.ts), so the host
 * never has to know the library's tuple order or field names.
 */

/** Geographic position. Named fields, not a tuple, because a `[lat, lng]` vs
 *  `[lng, lat]` mix-up is the single most common bug in map code. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Something the right-click palette can place. Domain data: the host owns it. */
export interface UnitTemplate {
  /** Stable key. Copied onto the placed unit as `templateId`. */
  id: string;
  label: string;
  /** APP-6D / MIL-STD-2525 unit SIDC. milsymbol renders it. */
  sidc: string;
  /** Optional grouping for the palette. Ungrouped entries land under "Units". */
  category?: string;
  /** Informational only — the SIDC is the source of truth for the glyph. */
  echelon?: string;
  description?: string;

}

/** A unit on the map. */
export interface PlacedMilUnit {
  id: string;
  /** The template this came from, when it came from one. */
  templateId?: string;
  label: string;
  sidc: string;
  lat: number;
  lng: number;
}

/**
 * An assignable order. Defaults to the library's doctrinal APP-6D task
 * catalog (see defaultOrderCatalog), but a host with its own doctrine,
 * wording or subset passes its own.
 */
export interface MilOrderDef {
  id: string;
  label: string;
  /** Optional grouping for the picker. */
  category?: string;
  /**
   * Doctrinal task name used to resolve which graphic draws this order.
   * Defaults to `label`, which is usually right ("Seize", "Block", …).
   */
  taskName?: string;
  /**
   * Explicit renderer key or doctrinal SIDC, when the catalog knows better
   * than a name lookup would. Wins over `taskName`.
   */
  tacticSidc?: string;
  description?: string;
  /**
   * Whether this order's graphic follows the unit it is assigned to.
   *
   * Left undefined, the symbol decides: `unitAnchor: 'start'` means the graphic
   * leaves its unit and goes somewhere (an axis of advance, a withdrawal), and
   * anything else describes an effect at the objective. That default is right
   * almost always; this is the escape hatch for when it is not — a rehearsal
   * axis drawn on the ground with no unit assigned yet.
   *
   * Setting it `true` for a symbol whose anchor is a derived position rather
   * than a handle does nothing: attaching re-applies every OTHER handle and so
   * needs the anchor's id. `defaultOrderCatalog` reports which those are as
   * `attachable`, so a picker can disable the choice rather than offer one that
   * silently will not take.
   */
  attachToUnit?: boolean;
  /**
   * Set by `defaultOrderCatalog`: whether this order's graphic CAN follow a
   * unit at all. False for the obstacle rows, whose position is the middle of a
   * span with no handle behind it.
   */
  attachable?: boolean;
  /** Line/graphic colour. Falls back to the component's `orderColour`. */
  colour?: string;
}

/** An order assigned to a unit, as stored by the host. */
export interface MilOrder {
  id: string;
  /**
   * The unit this order belongs to, or undefined for an order placed on the
   * map without one.
   *
   * Unassigned orders are a real case, not a degenerate one: a control measure
   * drawn during planning — a phase line, a no-fire area, an axis for a unit
   * not yet allocated — belongs to the ground rather than to anybody. Such an
   * order is never `attachedToUnit`, and the helpers that walk a unit's orders
   * (`moveUnitOrders`, `pinAttachedOrders`) skip it, because there is no unit
   * whose movement it should answer to.
   */
  unitId?: string;
  /** Catalog entry id, for round-tripping back to the definition. */
  orderId?: string;
  label: string;
  colour: string;
  /** The unit end of the order. */
  from: LatLng;
  /** The objective end. */
  to: LatLng;
  /** Renderer key resolved at assignment time. */
  tacticSidc?: string;
  /**
   * Whether this order hangs off the unit.
   *
   * True for symbols whose declared `unitAnchor` is "start" — an axis of
   * advance leaves its unit and goes somewhere. False for the ones that
   * describe an effect AT the objective (destroy, fix, occupy: "center" and
   * "midline" anchors), which are placed on the objective and stay there when
   * the unit moves. Without the distinction, walking a unit forward drags its
   * objectives across the map with it.
   */
  attachedToUnit?: boolean;
  /** Parametric overrides — spine bends, head geometry, radii, … */
  milxParams?: Record<string, unknown>;
  milxScale?: number;
  /** The route the order was assigned along, kept for redraws and reporting. */
  route?: OrderRoute;
}

/**
 * A path between two points. `waypoints` are `[lat, lng]` pairs — the order
 * Foundry-side routers in this estate already emit.
 */
export interface OrderRoute {
  waypoints: [number, number][];
  distanceKm?: number;
  durationSec?: number;
}
