// geojson/flatten.ts — SVG path data to polylines.
//
// WHY THIS IS NOT geometry.ts's pathPoints()
// ------------------------------------------
// `pathPoints` exists and is right for what it does: it answers "where are
// this path's positions" for the coherence tests and the coverage tooling, and
// it says so — "curve control points count as positions here: they bound the
// curve, and no caller so far wants the flattened outline instead."
//
// A renderer is that caller. A cubic's control points are NOT on the curve, so
// drawing a polyline through them is visibly wrong — a scalloped line becomes
// a zigzag, a range fan becomes a polygon, an arc cuts the corner. On a screen
// the SVG renderer flattens curves for us; put the same path on a map as
// GeoJSON and nothing does it for us.
//
// So this is a full path reader: absolute and relative forms of every command
// the catalog emits, curves subdivided, arcs converted from SVG's endpoint
// parameterisation to a centre one and sampled.
//
// WHY IT LIVES IN ITS OWN MODULE
// ------------------------------
// It is pure, it is the only part of drawing on a map that is subtle enough to
// get quietly wrong, and it is testable without a map, a browser or a symbol.
// Everything above it — GeoJSON, layers, terrain — is plumbing by comparison.

import { P, type Pt } from "../engine/geometry";

export interface FlattenOptions {
  /**
   * Maximum distance, in the path's own units, between the flattened polyline
   * and the true curve. Smaller is smoother and heavier.
   *
   * 0.5 is half a pixel at the scale these paths are generated in, which is
   * below what any renderer can show.
   */
  tolerance?: number;
}

interface SubPath {
  points: Pt[];
  closed: boolean;
}

/**
 * Flatten path data into subpaths.
 *
 * One `d` can contain several: `M…Z M…Z` is two rings, which matters for a
 * symbol drawn as an outline plus a hole, and for anything using `lineWithGap`.
 */
export function flattenPath(d: string, options: FlattenOptions = {}): SubPath[] {
  const tolerance = options.tolerance ?? 0.5;
  const tokens = tokenise(d);

  const subpaths: SubPath[] = [];
  let current: Pt[] = [];
  let closed = false;

  let cursor = P(0, 0);
  let start = P(0, 0);
  // Reflection state for the shorthand curve commands. S and T mirror the
  // PREVIOUS control point about the current point, and are only meaningful
  // when the previous command was of the matching family — otherwise the
  // reflection is the current point itself.
  let lastCubicControl: Pt | null = null;
  let lastQuadControl: Pt | null = null;

  const flush = () => {
    if (current.length > 0) {subpaths.push({ points: current, closed });}
    current = [];
    closed = false;
  };

  const push = (pt: Pt) => {
    const last = current[current.length - 1];
    // Consecutive identical points are noise in every consumer: a zero-length
    // GeoJSON segment, a duplicate vertex, a degenerate ring.
    if (!last || last.x !== pt.x || last.y !== pt.y) {current.push(pt);}
  };

  let i = 0;
  let command = "M";

  while (i < tokens.length) {
    const token = tokens[i];
    if (typeof token === "string") {
      command = token;
      i += 1;
      if (command === "Z" || command === "z") {
        closed = true;
        push(start);
        flush();
        cursor = start;
        lastCubicControl = null;
        lastQuadControl = null;
      }
      continue;
    }

    const relative = command === command.toLowerCase();
    const abs = (x: number, y: number): Pt =>
      relative ? P(cursor.x + x, cursor.y + y) : P(x, y);
    const num = () => tokens[i++] as number;

    switch (command.toUpperCase()) {
      case "M": {
        // A moveto after the first starts a new subpath; the implicit repeats
        // of an M are linetos, which is why `command` is rewritten below.
        flush();
        cursor = abs(num(), num());
        start = cursor;
        push(cursor);
        command = relative ? "l" : "L";
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      case "L": {
        cursor = abs(num(), num());
        push(cursor);
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      case "H": {
        const x = num();
        cursor = relative ? P(cursor.x + x, cursor.y) : P(x, cursor.y);
        push(cursor);
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      case "V": {
        const y = num();
        cursor = relative ? P(cursor.x, cursor.y + y) : P(cursor.x, y);
        push(cursor);
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      case "C": {
        const c1 = abs(num(), num());
        const c2 = abs(num(), num());
        const end = abs(num(), num());
        for (const pt of cubic(cursor, c1, c2, end, tolerance)) {push(pt);}
        cursor = end;
        lastCubicControl = c2;
        lastQuadControl = null;
        break;
      }
      case "S": {
        const c1: Pt = lastCubicControl
          ? P(2 * cursor.x - lastCubicControl.x, 2 * cursor.y - lastCubicControl.y)
          : cursor;
        const c2 = abs(num(), num());
        const end = abs(num(), num());
        for (const pt of cubic(cursor, c1, c2, end, tolerance)) {push(pt);}
        cursor = end;
        lastCubicControl = c2;
        lastQuadControl = null;
        break;
      }
      case "Q": {
        const c = abs(num(), num());
        const end = abs(num(), num());
        for (const pt of quad(cursor, c, end, tolerance)) {push(pt);}
        cursor = end;
        lastQuadControl = c;
        lastCubicControl = null;
        break;
      }
      case "T": {
        const c: Pt = lastQuadControl
          ? P(2 * cursor.x - lastQuadControl.x, 2 * cursor.y - lastQuadControl.y)
          : cursor;
        const end = abs(num(), num());
        for (const pt of quad(cursor, c, end, tolerance)) {push(pt);}
        cursor = end;
        lastQuadControl = c;
        lastCubicControl = null;
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const rotation = num();
        const largeArc = num() !== 0;
        const sweep = num() !== 0;
        const end = abs(num(), num());
        for (const pt of arc(cursor, rx, ry, rotation, largeArc, sweep, end, tolerance)) {
          push(pt);
        }
        cursor = end;
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      default: {
        // An unknown command would otherwise spin forever on its operands.
        i += 1;
        break;
      }
    }
  }

  flush();
  return subpaths;
}

/** Numbers and command letters, in order. */
function tokenise(d: string): Array<string | number> {
  const out: Array<string | number> = [];
  // Numbers may be signed, fractional, exponential, and may run together
  // without separators ("1.5.5" is two numbers, "1e-3-4" is two).
  const pattern = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(d)) !== null) {
    out.push(match[1] !== undefined ? match[1] : Number(match[2]));
  }
  return out;
}

/**
 * Segment count for a curve, from the length of its control polygon.
 *
 * A control polygon is never shorter than the curve it bounds, so this never
 * under-samples — which is the failure that matters. Clamped at both ends: four
 * segments keeps a tiny curve from becoming a straight line, sixty-four keeps a
 * long one from producing thousands of vertices nobody can see.
 */
function segmentsFor(controlLength: number, tolerance: number): number {
  const n = Math.ceil(Math.sqrt(controlLength / Math.max(tolerance, 1e-6)));
  return Math.min(64, Math.max(4, n));
}

function cubic(p0: Pt, c1: Pt, c2: Pt, p1: Pt, tolerance: number): Pt[] {
  const length =
    Math.hypot(c1.x - p0.x, c1.y - p0.y) +
    Math.hypot(c2.x - c1.x, c2.y - c1.y) +
    Math.hypot(p1.x - c2.x, p1.y - c2.y);
  const steps = segmentsFor(length, tolerance);

  const out: Pt[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.push(
      P(
        u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
      ),
    );
  }
  return out;
}

function quad(p0: Pt, c: Pt, p1: Pt, tolerance: number): Pt[] {
  const length =
    Math.hypot(c.x - p0.x, c.y - p0.y) + Math.hypot(p1.x - c.x, p1.y - c.y);
  const steps = segmentsFor(length, tolerance);

  const out: Pt[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.push(
      P(
        u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
        u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
      ),
    );
  }
  return out;
}

/**
 * SVG's endpoint arc parameterisation to sampled points.
 *
 * The conversion is the one in the SVG specification's implementation notes,
 * including the radii correction: SVG requires that radii too small to span the
 * endpoints be scaled up rather than the arc be dropped, and a symbol that
 * silently loses its arc is worse than one drawn slightly wide.
 */
function arc(
  p0: Pt,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  p1: Pt,
  tolerance: number,
): Pt[] {
  // Degenerate radii mean a straight line, per the specification.
  if (rxIn === 0 || ryIn === 0) {return [p1];}

  const phi = (rotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator =
    rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coefficient =
    sign * Math.sqrt(Math.max(0, numerator) / Math.max(denominator, 1e-12));

  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;

  const angleOf = (x: number, y: number) => Math.atan2(y, x);
  const theta1 = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry);
  let deltaTheta =
    angleOf((-x1p - cxp) / rx, (-y1p - cyp) / ry) - theta1;

  if (!sweep && deltaTheta > 0) {deltaTheta -= 2 * Math.PI;}
  if (sweep && deltaTheta < 0) {deltaTheta += 2 * Math.PI;}

  const steps = segmentsFor(
    Math.abs(deltaTheta) * Math.max(rx, ry),
    tolerance,
  );

  const out: Pt[] = [];
  for (let s = 1; s <= steps; s++) {
    const theta = theta1 + (deltaTheta * s) / steps;
    const x = rx * Math.cos(theta);
    const y = ry * Math.sin(theta);
    out.push(P(cosPhi * x - sinPhi * y + cx, sinPhi * x + cosPhi * y + cy));
  }
  return out;
}
