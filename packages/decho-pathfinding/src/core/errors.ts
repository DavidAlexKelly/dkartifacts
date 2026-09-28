/**
 * Typed failures.
 *
 * Routing fails in several genuinely different ways and a caller's response
 * differs for each: "you clicked in the ocean" is a tooltip, "the graph is
 * malformed" is a bug report, "I ran out of budget" is a retry with a bigger
 * one. A single Error with a message string collapses all of that into string
 * matching, so each mode gets a class and a `kind`.
 *
 * Cancellation deliberately does NOT get a class here — it reuses the
 * DOMException-shaped AbortError from @acc/decho-basemap, because that is what
 * MapLibre, fetch and the byte layer all already understand.
 */

export type PathfindingErrorKind =
  | "not-configured"
  | "no-data"
  | "no-node-nearby"
  | "no-route"
  | "malformed-graph";

export class PathfindingError extends Error {
  readonly kind: PathfindingErrorKind;

  constructor(kind: PathfindingErrorKind, message: string) {
    super(message);
    this.name = new.target.name;
    this.kind = kind;
  }
}

/** No pathfinding cell covers this point — ocean, or outside the cut. */
export class NoGraphDataError extends PathfindingError {
  readonly lon: number;
  readonly lat: number;

  constructor(lon: number, lat: number) {
    super(
      "no-data",
      `No pathfinding graph covers ${lat.toFixed(4)}, ${lon.toFixed(4)}. ` +
        "The cut only contains cells with routable terrain.",
    );
    this.lon = lon;
    this.lat = lat;
  }
}

/**
 * A cell exists but has no node close enough to snap to.
 *
 * Distinct from no-data on purpose: it means the point is inside a hole (a
 * lake, a built-up area) rather than outside the coverage, and the fix is to
 * click somewhere else rather than to widen the dataset.
 */
export class NoNodeNearbyError extends PathfindingError {
  readonly lon: number;
  readonly lat: number;
  readonly searchedM: number;

  constructor(lon: number, lat: number, searchedM: number) {
    super(
      "no-node-nearby",
      `No routable node within ${Math.round(searchedM)} m of ` +
        `${lat.toFixed(4)}, ${lon.toFixed(4)} — impassable terrain, or a gap in the graph.`,
    );
    this.lon = lon;
    this.lat = lat;
    this.searchedM = searchedM;
  }
}

/** Start and goal are both snapped, but no chain of edges joins them. */
export class NoRouteError extends PathfindingError {
  /** True when the search stopped at a budget rather than exhausting the graph. */
  readonly truncated: boolean;
  readonly reason: "disconnected" | "cell-budget" | "node-budget" | "time-budget";

  constructor(
    reason: NoRouteError["reason"],
    detail: string,
  ) {
    super("no-route", detail);
    this.reason = reason;
    this.truncated = reason !== "disconnected";
  }
}

/**
 * The bytes did not decode as a graph.
 *
 * Carries the diagnostics needed to tell a stride mistake from an endianness
 * mistake from a genuinely corrupt file, because from a stack trace alone
 * those three look identical and all of them produce plausible-but-wrong
 * routes if a parser guesses instead of throwing.
 */
export class MalformedGraphError extends PathfindingError {
  readonly cell: string;
  readonly detail: Record<string, unknown>;

  constructor(cell: string, message: string, detail: Record<string, unknown> = {}) {
    super("malformed-graph", `[${cell}] ${message}`);
    this.cell = cell;
    this.detail = detail;
  }
}

export function isPathfindingError(err: unknown): err is PathfindingError {
  return err instanceof PathfindingError;
}
