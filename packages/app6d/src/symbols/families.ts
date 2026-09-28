// symbols/families.ts — shared geometry-generator "families" used by
// multiple APP-6D symbols (Block/Penetrate/Clear all share blockFamily,
// etc). Exported so custom catalogs can reuse them too.
import {
  Pt, P, add, sub, mul, dist, norm, lerp, perp, rot, angleOf, onCircle, f,
  project, polyD, lineD, chevron, lineWithGap, labelGapHalf, offsetPolyline, right,
} from "../engine/geometry";
import type { Part, Params, EngineHandle } from "../engine/types";

const stroke = (d: string, dashed = false): Part => ({ kind: 'stroke', d, dashed });
const fillP = (d: string): Part => ({ kind: 'fill', d });
const textP = (text: string, pos: Pt, size: number, rotate = 0): Part =>
  ({ kind: 'text', text, pos, size, rotate });

export { stroke, fillP, textP };

/** A full ring, as two half arcs: one arc that ends where it started draws nothing. */
export const circleD = (c: Pt, r: number): string =>
  `M${f(c.x - r)},${f(c.y)} A${f(r)},${f(r)} 0 1,0 ${f(c.x + r)},${f(c.y)}`
  + ` A${f(r)},${f(r)} 0 1,0 ${f(c.x - r)},${f(c.y)}`;

export const hPoint = (key: string, p: Params): EngineHandle => ({
  id: key, kind: 'point',
  pos: p[key] as Pt,
  set: (pos) => ({ [key]: pos }),
});
export const hScalar = (id: string, pos: Pt, set: (pos: Pt) => Params): EngineHandle =>
  ({ id, kind: 'scalar', pos, set });

/**
 * The axis's head frame: where the arrowhead starts, and which way it points.
 *
 * Anything an axis symbol draws NEAR ITS HEAD — a main-effort notch, a
 * counterattack's fire brace — has to be built from this rather than written
 * down as absolute coordinates. A spine is re-fitted to a route the moment the
 * symbol is placed on a map, and absolute sub-geometry stays behind at the
 * position the symbol was authored in: the axis follows the route and the
 * notch is left floating over open country, looking exactly like extra
 * geometry that is not part of the symbol.
 */
export function axisHead(p: { spine: Pt[]; headLen: number }): {
  tip: Pt;
  base: Pt;
  dir: Pt;
  normal: Pt;
} {
  const tip = p.spine[p.spine.length - 1];
  const prev = p.spine[p.spine.length - 2];
  const dir = norm(sub(tip, prev));
  return { tip, base: sub(tip, mul(dir, p.headLen)), dir, normal: perp(dir) };
}

/**
 * The second chevron of a main attack, sitting on the head's base and
 * pointing along the axis — the mark that distinguishes the main effort from
 * a supporting one.
 *
 * Spans the body's full width and reaches half the head's length forward,
 * which is exactly what this symbol's hand-authored coordinates described
 * before they were derived: for the pristine params the two agree to within
 * half a unit.
 */
export function axisMainEffortNotch(p: {
  spine: Pt[];
  headLen: number;
  halfWidth: number;
}): Pt[] {
  const { base, dir, normal } = axisHead(p);
  return [
    add(base, mul(normal, p.halfWidth)),
    add(base, mul(dir, p.headLen / 2)),
    add(base, mul(normal, -p.halfWidth)),
  ];
}

/** Axis-of-advance arrow: open tail, mitred body, broad head. Last spine point = tip. */
export function axisOfAdvance(p: { spine: Pt[]; halfWidth: number; headLen: number; headHalf: number; dashed?: boolean }): Part {
  const tip = p.spine[p.spine.length - 1];
  const prev = p.spine[p.spine.length - 2];
  const dEnd = norm(sub(tip, prev));
  const base = sub(tip, mul(dEnd, p.headLen));
  const body = p.spine.slice(0, -1).concat([base]);
  const L = offsetPolyline(body, p.halfWidth);
  const R = offsetPolyline(body, -p.halfWidth);
  const nEnd = perp(dEnd);
  const pts = [
    ...L,
    add(base, mul(nEnd, p.headHalf)),
    tip,
    add(base, mul(nEnd, -p.headHalf)),
    ...R.slice().reverse(),
  ];
  return stroke(polyD(pts), p.dashed);
}

/* ── Block / Penetrate / Clear family ── */
export function blockFamily(p: Params): Part[] {
  const dir = norm(sub(p.B, p.A));
  const n = perp(dir);
  const parts: Part[] = [];
  parts.push(stroke(lineD(add(p.B, mul(n, p.barrierHalf)), add(p.B, mul(n, -p.barrierHalf)))));
  const offsets: number[] = p.arrowCount === 3 ? [-p.railOffset, 0, p.railOffset] : [0];
  for (const off of offsets) {
    const a = add(p.A, mul(n, off)), b = add(p.B, mul(n, off));
    if (off === 0) {
      const mid = lerp(a, b, 0.5);
      lineWithGap(a, b, mid, labelGapHalf(p.label, p.labelSize)).forEach(d => parts.push(stroke(d)));
      parts.push(textP(p.label, mid, p.labelSize));
    } else {parts.push(stroke(lineD(a, b)));}
    if (p.chevLen) {parts.push(stroke(chevron(b, dir, p.chevLen, p.chevSpread)));}
  }
  return parts;
}
export function blockHandles(p: Params): EngineHandle[] {
  const n = perp(norm(sub(p.B, p.A)));
  const hs = [
    hPoint('A', p), hPoint('B', p),
    hScalar('barrierHalf', add(p.B, mul(n, p.barrierHalf)),
      (pos) => ({ barrierHalf: Math.max(40, Math.abs(project(pos, p.B, n))) })),
  ];
  if (p.arrowCount === 3) {hs.push(
    hScalar('railOffset', add(p.A, mul(n, p.railOffset)),
      (pos) => ({ railOffset: Math.max(40, Math.abs(project(pos, p.A, n))) })));}
  return hs;
}

/* ── Breach / Bypass / Canalize family ── */
export function bracketFamily(p: Params): Part[] {
  const axis = norm(sub(p.P2, p.P1));
  const openDir = perp(axis);
  const C1 = sub(p.P1, mul(openDir, p.depth));
  const C2 = sub(p.P2, mul(openDir, p.depth));
  const parts: Part[] = [];
  parts.push(stroke(lineD(p.P1, C1)));
  parts.push(stroke(lineD(p.P2, C2)));
  const mid = lerp(C1, C2, 0.5);
  lineWithGap(C1, C2, mid, labelGapHalf(p.label, p.labelSize)).forEach(d => parts.push(stroke(d)));
  parts.push(textP(p.label, mid, p.labelSize));
  for (const [end, sgn] of [[p.P1, 1], [p.P2, -1]] as Array<[Pt, number]>) {
    if (p.endStyle === 'arrow') {
      parts.push(stroke(chevron(end, openDir, p.headLen, 45)));
    } else {
      const sd = rot(axis, sgn * p.slashAngle);
      parts.push(stroke(lineD(add(end, mul(sd, -p.slashLen / 2)), add(end, mul(sd, p.slashLen / 2)))));
    }
  }
  return parts;
}
export function bracketHandles(p: Params): EngineHandle[] {
  const od = perp(norm(sub(p.P2, p.P1)));
  return [
    hPoint('P1', p), hPoint('P2', p),
    hScalar('depth', sub(lerp(p.P1, p.P2, 0.5), mul(od, p.depth)),
      (pos) => ({ depth: Math.max(50, -project(pos, lerp(p.P1, p.P2, 0.5), od)) })),
  ];
}

/* ── Point glyphs (Destroy / Interdict / Neutralize) ── */
export interface GlyphLocal {
  strokes: Array<{ pts: Pt[]; dashed?: boolean; closed?: boolean }>;
  fills?: Pt[][];
  /** Rings — the publication draws these as four cubic segments; here, arcs. */
  circles?: Array<{ c: Pt; r: number; dashed?: boolean }>;
  /** Text the symbol always carries, e.g. Destroy's "D". */
  label?: { text: string; pos: Pt; size: number };
  /**
   * Where a caller-supplied designation goes (`params.label`), for the point
   * graphics whose only text is the user's: a checkpoint's number, a contact
   * point's identifier. Baking that into the definition the way `label` does
   * would make every instance of the symbol say the same thing.
   */
  labelSlot?: { pos: Pt; size: number };
}
export function pointGlyph(local: GlyphLocal): (p: Params) => Part[] {
  return (p) => {
    const g = (q: Pt): Pt => add(p.center, rot(mul(q, p.scale), p.rotation));
    const parts: Part[] = [];
    for (const s of local.strokes) {parts.push(stroke(polyD(s.pts.map(g), s.closed), s.dashed));}
    for (const ring of (local.circles || [])) {parts.push(stroke(circleD(g(ring.c), ring.r * p.scale), ring.dashed));}
    for (const poly of (local.fills || [])) {parts.push(fillP(polyD(poly.map(g), true)));}
    if (local.label) {parts.push(textP(local.label.text, g(local.label.pos), local.label.size * p.scale, p.rotation));}
    if (local.labelSlot && p.label) {
      parts.push(textP(String(p.label), g(local.labelSlot.pos), (p.labelSize ?? local.labelSlot.size) * p.scale, p.rotation));
    }
    return parts;
  };
}
/**
 * A regular star's vertices, outer point first, in local glyph coordinates.
 *
 * The publication's five-pointed stars are regular: measured off #8's template,
 * the inner vertices sit at 0.382 of the outer radius, which is the pentagram's
 * own ratio (1/φ²) rather than anything the draughtsman chose.
 */
export function starPoints(outer: number, points = 5, innerRatio = 0.382): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : outer * innerRatio;
    // -90° puts a point at the top, which is how every one of them is drawn.
    out.push(onCircle(P(0, 0), r, -90 + (180 / points) * i));
  }
  return out;
}

export function glyphHandles(unit: number) {
  return (p: Params): EngineHandle[] => [
    hPoint('center', p),
    hScalar('sizeRotate', add(p.center, rot(P(unit * p.scale, 0), p.rotation)), (pos) => {
      const v = sub(pos, p.center);
      return { scale: Math.max(0.05, Math.hypot(v.x, v.y) / unit), rotation: angleOf(v) };
    }),
  ];
}

/* ── Range fans (circular and sector) ── */

/**
 * Concentric range rings about a position, whole or cut to a sector.
 *
 * One weapon or sensor, several ranges: the rings are a list, so a fan with
 * four ranges is four numbers rather than four symbols. A sector fan is the
 * same thing with `sweep` under 360, which adds the two bounding radials —
 * drawn from the outermost ring inwards, because that is the extent the sector
 * is describing.
 *
 * `radii` are local units, scaled and turned with `scale` and `rotation` like
 * any other point glyph, so the whole fan tracks its centre.
 */
export function rangeFanFamily(p: Params): Part[] {
  const centre = p.center as Pt;
  const scale = (p.scale as number) ?? 1;
  const rotation = (p.rotation as number) ?? 0;
  const radii = ((p.radii as number[]) ?? []).map((r) => r * scale).sort((a, b) => a - b);
  const sweep = (p.sweep as number) ?? 360;
  const start = ((p.start as number) ?? 0) + rotation;
  const parts: Part[] = [];

  for (const r of radii) {
    if (sweep >= 360) {
      parts.push(stroke(circleD(centre, r)));
      continue;
    }
    const from = onCircle(centre, r, start);
    const to = onCircle(centre, r, start + sweep);
    parts.push(stroke(`M${f(from.x)},${f(from.y)} A${f(r)},${f(r)} 0 ${sweep > 180 ? 1 : 0},1 ${f(to.x)},${f(to.y)}`));
  }
  if (sweep < 360 && radii.length > 0) {
    const outer = radii[radii.length - 1];
    for (const deg of [start, start + sweep]) {
      parts.push(stroke(lineD(centre, onCircle(centre, outer, deg))));
    }
  }

  const labels = (p.labels as string[]) ?? [];
  const size = (p.labelSize as number) ?? 200;
  labels.forEach((text, i) => {
    const r = radii[i];
    if (!text || r === undefined) { return; }
    // On the ring it belongs to, at the middle of the arc — derived, so a fan
    // that is re-aimed or resized carries its range labels with it.
    parts.push(textP(text, onCircle(centre, r - size * 0.7, start + sweep / 2), size * scale, 0));
  });
  return parts;
}

export function rangeFanHandles(p: Params): EngineHandle[] {
  const centre = p.center as Pt;
  const scale = (p.scale as number) ?? 1;
  const radii = (p.radii as number[]) ?? [];
  const outer = Math.max(...radii, 1);
  return [
    hPoint('center', p),
    hScalar('sizeRotate', onCircle(centre, outer * scale, (p.rotation as number) ?? 0), (pos) => {
      const v = sub(pos, centre);
      return { scale: Math.max(0.05, dist(pos, centre) / outer), rotation: angleOf(v) };
    }),
  ];
}

/* ── Circle-task family (Retain/Contain/Isolate/Occupy/Secure/Seize) ── */
export function circleHandles(p: Params): EngineHandle[] {
  return [
    hPoint('center', p),
    hScalar('radius', onCircle(p.center, p.radius, 45),
      (pos) => ({ radius: Math.max(40, dist(pos, p.center)) })),
    hScalar('gapAngle', onCircle(p.center, p.radius, p.gapAngle),
      (pos) => ({ gapAngle: angleOf(sub(pos, p.center)) })),
  ];
}

/* ── Axis family (Counterattack / Main Attack / Aviation Axis / notched) ── */
export function axisHandles(p: Params): EngineHandle[] {
  const hs: EngineHandle[] = (p.spine as Pt[]).map((pt, i) => ({
    id: `spine${i}`, kind: 'point',
    pos: pt,
    set: (pos) => { const s = (p.spine as Pt[]).slice(); s[i] = pos; return { spine: s }; },
  }));
  const a = p.spine[0], b = p.spine[1];
  const n01 = perp(norm(sub(b, a)));
  hs.push(hScalar('halfWidth', add(lerp(a, b, 0.35), mul(n01, p.halfWidth)),
    (pos) => ({ halfWidth: Math.max(20, Math.abs(project(pos, lerp(p.spine[0], p.spine[1], 0.35), n01))) })));
  const tip = p.spine[p.spine.length - 1], prev = p.spine[p.spine.length - 2];
  const dEnd = norm(sub(tip, prev)), base = sub(tip, mul(dEnd, p.headLen));
  hs.push(hScalar('head', add(base, mul(perp(dEnd), p.headHalf)), (pos) => ({
    headLen: Math.max(40, -project(pos, tip, dEnd)),
    headHalf: Math.max(40, Math.abs(project(pos, tip, perp(dEnd)))),
  })));
  return hs;
}

/* ── Retrograde arc family (Delay/Withdraw/Withdraw Under Pressure) ── */
export function retrogradeArcFamily(p: Params): Part[] {
  const d = norm(sub(p.B, p.A)), n = perp(d);
  const E = add(p.B, mul(n, 2 * p.r));
  const parts: Part[] = [];
  if (p.label) {
    const mid = lerp(p.A, p.B, 0.5);
    lineWithGap(p.A, p.B, mid, labelGapHalf(p.label, p.labelSize)).forEach((dd) => parts.push(stroke(dd)));
    parts.push(textP(p.label, mid, p.labelSize));
  } else {
    parts.push(stroke(lineD(p.A, p.B)));
  }
  parts.push(stroke(chevron(p.A, mul(d, -1), p.headLen, p.headSpread)));
  parts.push(stroke(`M${p.B.x.toFixed(1)},${p.B.y.toFixed(1)} A${p.r.toFixed(1)},${p.r.toFixed(1)} 0 1,0 ${E.x.toFixed(1)},${E.y.toFixed(1)}`));
  return parts;
}
export function retrogradeArcHandles(p: Params): EngineHandle[] {
  const d = norm(sub(p.B, p.A)), n = perp(d);
  return [
    hPoint('A', p), hPoint('B', p),
    hScalar('r', add(p.B, add(mul(n, p.r), mul(d, p.r))), (pos) => {
      const dd = norm(sub(p.B, p.A)), nn = perp(dd), v = sub(pos, p.B);
      return { r: Math.max(30, (v.x * (nn.x + dd.x) + v.y * (nn.y + dd.y)) / 2) };
    }),
  ];
}

/* ── Organic blob area glyph (ATK/OBJ/AA/ASLT PSN) ── */
export function blobPoints(center: Pt, r: number, wobble: number, n = 16): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i;
    const w = 1 + wobble * (0.5 * Math.sin(a * 3 * Math.PI / 180) + 0.3 * Math.sin(a * 5 * Math.PI / 180 + 1) + 0.2 * Math.sin(a * 7 * Math.PI / 180 + 2));
    pts.push(onCircle(center, r * w, a));
  }
  return pts;
}
export function blobFamily(p: Params): Part[] {
  const pts = blobPoints(p.center, p.radius, p.wobble);
  const parts: Part[] = [stroke(polyD(pts, true))];
  if (Array.isArray(p.label)) {
    const lines: string[] = p.label;
    lines.forEach((line, i) =>
      parts.push(textP(line, add(p.center, P(0, (i - (lines.length - 1) / 2) * p.labelSize * 1.15)), p.labelSize)));
  } else if (p.label) {
    parts.push(textP(p.label, p.center, p.labelSize));
  }
  return parts;
}
export function blobHandles(p: Params): EngineHandle[] {
  return [
    hPoint('center', p),
    hScalar('radius', onCircle(p.center, p.radius, 30), (pos) => ({ radius: Math.max(80, dist(pos, p.center)) })),
    hScalar('wobble', onCircle(p.center, p.radius, 150),
      (pos) => ({ wobble: Math.max(0, Math.min(0.6, dist(pos, p.center) / p.radius - 1)) })),
  ];
}

/* ── Repeated tick/decoration row along a line (wire/minefield/lane) ── */
export function tickRowFamily(p: Params): Part[] {
  const dir = norm(sub(p.B, p.A)), n = perp(dir);
  const parts: Part[] = [stroke(lineD(p.A, p.B), !!p.dashed)];
  for (let i = 0; i < p.count; i++) {
    const t = (i + 0.5) / p.count;
    const c = lerp(p.A, p.B, t);
    switch (p.tickShape) {
      case 'x':
        parts.push(stroke(lineD(
          add(c, add(mul(dir, -p.tickSize), mul(n, -p.tickSize))),
          add(c, add(mul(dir, p.tickSize), mul(n, p.tickSize))),
        )));
        parts.push(stroke(lineD(
          add(c, add(mul(dir, -p.tickSize), mul(n, p.tickSize))),
          add(c, add(mul(dir, p.tickSize), mul(n, -p.tickSize))),
        )));
        break;
      case 'square':
        parts.push(stroke(polyD([
          add(c, add(mul(dir, -p.tickSize), mul(n, -p.tickSize))),
          add(c, add(mul(dir, p.tickSize), mul(n, -p.tickSize))),
          add(c, add(mul(dir, p.tickSize), mul(n, p.tickSize))),
          add(c, add(mul(dir, -p.tickSize), mul(n, p.tickSize))),
        ], true)));
        break;
      case 'triangle':
        parts.push(fillP(polyD([
          add(c, mul(n, -p.tickSize)),
          add(c, mul(n, p.tickSize)),
          add(c, mul(dir, p.tickSize * 1.4)),
        ], true)));
        break;
      case 'chevron': {
        const side = i % 2 === 0 ? 1 : -1;
        parts.push(stroke(chevron(add(c, mul(n, side * p.tickSize)), mul(n, side), p.tickSize, 40)));
        break;
      }
      // Teeth standing on ONE side of the line, as the antitank ditches are
      // drawn: hollow while the ditch is under construction, filled once it is
      // complete. The distinction is the whole difference between the two
      // symbols, so it is a shape here rather than a caller's fill flag.
      case 'tooth':
      case 'tooth-filled': {
        const teeth = polyD([
          add(c, mul(dir, -p.tickSize)),
          add(c, mul(n, -p.tickSize * 1.3)),
          add(c, mul(dir, p.tickSize)),
        ], true);
        parts.push(p.tickShape === 'tooth-filled' ? fillP(teeth) : stroke(teeth));
        break;
      }
      // A pair of posts per station — the double fence, against the single
      // fence's one.
      case 'double-bar': {
        for (const side of [-1, 1]) {
          const at = add(c, mul(dir, side * p.tickSize * 0.55));
          parts.push(stroke(lineD(add(at, mul(n, -p.tickSize)), add(at, mul(n, p.tickSize)))));
        }
        break;
      }
      case 'bar':
      default:
        parts.push(stroke(lineD(add(c, mul(n, -p.tickSize)), add(c, mul(n, p.tickSize)))));
        break;
    }
  }
  if (p.headArrow) {parts.push(stroke(chevron(p.B, dir, p.tickSize * 1.4, 40)));}
  return parts;
}
export function tickRowHandles(p: Params): EngineHandle[] {
  const dir = norm(sub(p.B, p.A)), n = perp(dir);
  return [
    hPoint('A', p), hPoint('B', p),
    hScalar('tickSize', add(lerp(p.A, p.B, 0.5 / p.count), mul(n, p.tickSize)),
      (pos) => ({ tickSize: Math.max(15, Math.abs(project(pos, lerp(p.A, p.B, 0.5), n))) })),
  ];
}

/* ── Gate / crossing-point bracket ── */
export function gateBracketFamily(p: Params): Part[] {
  const axis = norm(sub(p.P2, p.P1));
  const openDir = perp(axis);
  const C1 = sub(p.P1, mul(openDir, p.depth));
  const C2 = sub(p.P2, mul(openDir, p.depth));
  const parts: Part[] = [
    stroke(lineD(p.P1, C1)),
    stroke(lineD(p.P2, C2)),
    stroke(lineD(C1, C2)),
  ];
  for (const [corner, sgn] of [[p.P1, 1], [p.P2, -1]] as Array<[Pt, number]>) {
    const tip = add(corner, mul(axis, sgn * p.flagLen));
    const wing = add(corner, mul(openDir, -p.flagLen * 0.5));
    parts.push(fillP(polyD([corner, tip, wing], true)));
  }
  return parts;
}
/**
 * A crossing point's own position: the middle of the gap, as a handle.
 *
 * A gate, a lane, a crossing site is a PLACE — a unit is given the job of
 * holding or operating it, and it is the one thing on the map that should
 * follow that unit. `midline` described the right position but resolved to a
 * derived point with no id, which is exactly the case an order cannot attach
 * to; and without it, moving a gate meant dragging both its ends.
 */
const spanCentreHandle = (a: Pt, b: Pt, keys: [string, string]): EngineHandle => {
  const centre = lerp(a, b, 0.5);
  return {
    id: 'center',
    kind: 'point',
    pos: centre,
    set: (pos) => {
      const shift = sub(pos, centre);
      return { [keys[0]]: add(a, shift), [keys[1]]: add(b, shift) };
    },
  };
};

export function gateBracketHandles(p: Params): EngineHandle[] {
  const axis = norm(sub(p.P2, p.P1)), openDir = perp(axis);
  return [
    spanCentreHandle(p.P1 as Pt, p.P2 as Pt, ['P1', 'P2']),
    hPoint('P1', p), hPoint('P2', p),
    hScalar('depth', sub(lerp(p.P1, p.P2, 0.5), mul(openDir, p.depth)),
      (pos) => ({ depth: Math.max(40, -project(pos, lerp(p.P1, p.P2, 0.5), openDir)) })),
    hScalar('flagLen', add(p.P1, mul(axis, p.flagLen)),
      (pos) => ({ flagLen: Math.max(30, Math.abs(project(pos, p.P1, axis))) })),
  ];
}

/* ── Filled lane marker with opposing end caps ── */
export function laneMarkerFamily(p: Params): Part[] {
  const dir = norm(sub(p.B, p.A)), n = perp(dir);
  const parts: Part[] = [];
  parts.push(fillP(polyD([
    add(p.A, mul(n, p.bandHalf)), add(p.B, mul(n, p.bandHalf)),
    add(p.B, mul(n, -p.bandHalf)), add(p.A, mul(n, -p.bandHalf)),
  ], true)));
  const capA = add(p.A, mul(dir, p.capLen));
  const capB = sub(p.B, mul(dir, p.capLen));
  parts.push(fillP(polyD([p.A, add(capA, mul(n, p.capHalf)), add(capA, mul(n, -p.capHalf))], true)));
  parts.push(fillP(polyD([p.B, add(capB, mul(n, p.capHalf)), add(capB, mul(n, -p.capHalf))], true)));
  return parts;
}
export function laneMarkerHandles(p: Params): EngineHandle[] {
  const dir = norm(sub(p.B, p.A)), n = perp(dir);
  return [
    spanCentreHandle(p.A as Pt, p.B as Pt, ['A', 'B']),
    hPoint('A', p), hPoint('B', p),
    hScalar('bandHalf', add(lerp(p.A, p.B, 0.5), mul(n, p.bandHalf)),
      (pos) => ({ bandHalf: Math.max(20, Math.abs(project(pos, lerp(p.A, p.B, 0.5), n))) })),
    hScalar('capLen', add(p.A, mul(dir, p.capLen)),
      (pos) => ({ capLen: Math.max(30, Math.abs(project(pos, p.A, dir))) })),
  ];
}

/* ── Two-way route/axis ── */
export function twoWayArrowFamily(p: Params): Part[] {
  const dir = norm(sub(p.B, p.A));
  return [
    stroke(lineD(p.A, p.B)),
    stroke(chevron(p.A, mul(dir, -1), p.headLen, p.headSpread)),
    stroke(chevron(p.B, dir, p.headLen, p.headSpread)),
  ];
}
export function twoWayArrowHandles(p: Params): EngineHandle[] {
  return [
    hPoint('A', p), hPoint('B', p),
    hScalar('headLen', add(p.B, mul(norm(sub(p.A, p.B)), p.headLen)),
      (pos) => ({ headLen: Math.max(40, dist(pos, p.B)) })),
  ];
}

/* ── Zigzag + hook family (Screen / Guard / Cover) ── */
/**
 * The zigzag itself: A to B by way of `peaks` alternating deflections of
 * `amp`. Shared, because the screen/guard/cover posts hang hooks off the end
 * of one of these and the obstacle line is one on its own — and a zigzag
 * computed twice is a zigzag that eventually disagrees with itself.
 */
export function zigzagPoints(A: Pt, B: Pt, peaks: number, amp: number): Pt[] {
  const n = perp(norm(sub(B, A)));
  const pts: Pt[] = [A];
  for (let k = 1; k <= peaks; k++) {
    pts.push(add(lerp(A, B, k / (peaks + 1)), mul(n, (k % 2 ? 1 : -1) * amp)));
  }
  pts.push(B);
  return pts;
}

/** A zigzag between two anchors, and nothing else. */
export function zigzagFamily(p: Params): Part[] {
  const parts: Part[] = [
    stroke(polyD(zigzagPoints(p.A as Pt, p.B as Pt, p.peaks as number, p.amp as number)), Boolean(p.dashed)),
  ];
  if (p.label) {
    parts.push(textP(String(p.label), lerp(p.A as Pt, p.B as Pt, 0.5), (p.labelSize as number) ?? 240));
  }
  return parts;
}

export function zigzagHandles(p: Params): EngineHandle[] {
  const dir = norm(sub(p.B as Pt, p.A as Pt)), n = perp(dir);
  const firstPeakBase = lerp(p.A as Pt, p.B as Pt, 1 / ((p.peaks as number) + 1));
  return [
    hPoint('A', p), hPoint('B', p),
    hScalar('amp', add(firstPeakBase, mul(n, p.amp as number)),
      (pos) => ({ amp: Math.max(20, Math.abs(project(pos, firstPeakBase, n))) })),
  ];
}

export function zigzagHookFamily(p: Params): Part[] {
  const parts: Part[] = [];
  for (let c = 0; c < p.copies; c++) {
    const off = P(c * p.spacing, 0);
    const A = add(p.A, off), B = add(p.B, off);
    const dir = norm(sub(B, A));
    parts.push(stroke(polyD(zigzagPoints(A, B, p.peaks, p.amp))));
    const hookDir = rot(dir, p.hookAngle);
    const hookMid = add(B, mul(hookDir, p.hookLen));
    const backDir = rot(dir, -p.hookAngle * 0.6);
    const hookEnd = add(B, mul(backDir, p.hookLen * 0.75));
    parts.push(stroke(polyD([hookMid, B, hookEnd])));
    if (p.label) {parts.push(textP(p.label, lerp(A, B, 0.5), p.labelSize));}
  }
  return parts;
}
export function zigzagHookHandles(p: Params): EngineHandle[] {
  const dir = norm(sub(p.B, p.A)), n = perp(dir);
  const firstPeakBase = lerp(p.A, p.B, 1 / (p.peaks + 1));
  return [
    hPoint('A', p), hPoint('B', p),
    hScalar('amp', add(firstPeakBase, mul(n, p.amp)),
      (pos) => ({ amp: Math.max(20, Math.abs(project(pos, firstPeakBase, n))) })),
    hScalar('hookLen', add(p.B, mul(rot(dir, p.hookAngle), p.hookLen)),
      (pos) => ({ hookLen: Math.max(20, dist(pos, p.B)) })),
    hScalar('spacing', add(p.A, P(p.spacing, 0)),
      (pos) => ({ spacing: Math.max(100, pos.x - p.A.x) })),
  ];
}

/* ── Labelled areas (Free Fire Area / No Fire Area / obstacle zones …) ── */

/**
 * An area the user draws, with a block of text inside it.
 *
 * The publication's fire-support and obstacle zones are all this shape: a
 * closed ring of however many points the ground needs, and a label block —
 * "FFA", the establishing unit, a date-time group — that the rules say "shall
 * be movable and scalable as a block within the area".
 *
 * Movable is the interesting word. The block's position is stored as a
 * fraction of the ring's own extent, not as a point: an area redrawn around
 * different terrain, or dragged across the map, keeps its label in the same
 * relative place instead of leaving it behind on open ground. That is the same
 * rule the axis symbols learned the hard way.
 */
export const ringCentre = (ring: Pt[]): Pt => ({
  x: ring.reduce((s, q) => s + q.x, 0) / ring.length,
  y: ring.reduce((s, q) => s + q.y, 0) / ring.length,
});

const ringExtent = (ring: Pt[]): Pt => P(
  Math.max(...ring.map((q) => q.x)) - Math.min(...ring.map((q) => q.x)) || 1,
  Math.max(...ring.map((q) => q.y)) - Math.min(...ring.map((q) => q.y)) || 1,
);

const labelLines = (label: unknown): string[] => {
  if (Array.isArray(label)) { return label.filter(Boolean).map(String); }
  return label ? [String(label)] : [];
};

/** Ray casting — is this point inside the ring? */
export function pointInRing(point: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Where the label block sits, given the ring and the stored fraction.
 *
 * "Within the area" is the rule, and it is enforced rather than assumed: a
 * three-line block dragged towards a corner of a large area does not fit when
 * the same area is redrawn small, so the offset is eased back towards the
 * centre until the whole block is inside the ring. Better a caption that
 * drifts back into its area than one that hangs outside it, captioning
 * somebody else's ground.
 */
export function areaLabelPos(p: Params): Pt {
  const ring = p.ring as Pt[];
  const centre = ringCentre(ring);
  const extent = ringExtent(ring);
  const off = (p.labelOffset as Pt) ?? P(0, 0);
  const lines = labelLines(p.label);
  const size = (p.labelSize as number) ?? 240;
  const halfBlock = lines.length > 1 ? ((lines.length - 1) / 2) * size * 1.25 : 0;

  for (let t = 1; t > 0; t -= 0.1) {
    const anchor = add(centre, P(off.x * extent.x * t, off.y * extent.y * t));
    if (pointInRing(add(anchor, P(0, -halfBlock)), ring)
      && pointInRing(add(anchor, P(0, halfBlock)), ring)) {
      return anchor;
    }
  }
  return centre;
}

/**
 * A starting ring, inside the parameter box, for area symbols whose real shape
 * is whatever the user draws. Shared here rather than in one symbol's file, so
 * that importing one area symbol does not drag another one in with it.
 */
export const AREA_RING_DEFAULT: Pt[] = [
  P(420, 560), P(1100, 420), P(1650, 700), P(1560, 1350), P(900, 1600), P(430, 1200),
];

export function areaFamily(p: Params): Part[] {
  const ring = p.ring as Pt[];
  const parts: Part[] = [stroke(polyD(ring, true), Boolean(p.dashed))];
  const lines = labelLines(p.label);
  if (lines.length > 0) {
    const size = (p.labelSize as number) ?? 240;
    const anchor = areaLabelPos(p);
    lines.forEach((text, i) => {
      parts.push(textP(text, add(anchor, P(0, (i - (lines.length - 1) / 2) * size * 1.25)), size));
    });
  }
  return parts;
}

export function areaHandles(p: Params): EngineHandle[] {
  const ring = p.ring as Pt[];
  const centre = ringCentre(ring);
  const handles: EngineHandle[] = [
    // The area's own anchor: drag it and the whole ring follows.
    //
    // Two things need this and neither works without a handle behind the
    // anchor. Assigning an order to a unit glues the symbol's declared anchor
    // to that unit, and doing so re-applies every OTHER handle — which you
    // cannot express without knowing which handle is the anchor, so a centroid
    // with no id cannot be attached to anything. And a user who has drawn a
    // six-point area and wants it fifty metres north should not have to drag
    // six vertices to get it there.
    {
      id: 'center',
      kind: 'point' as const,
      pos: centre,
      set: (pos: Pt) => ({
        ring: ring.map((q) => add(q, sub(pos, centre))),
      }),
    },
    ...ring.map((pt, i) => ({
      id: `ring${i}`,
      kind: 'point' as const,
      pos: pt,
      set: (pos: Pt) => {
        const next = ring.slice();
        next[i] = pos;
        return { ring: next };
      },
    })),
  ];
  if (labelLines(p.label).length > 0) {
    handles.push(hScalar('label', areaLabelPos(p), (pos) => {
      const extent = ringExtent(ring);
      return { labelOffset: P((pos.x - centre.x) / extent.x, (pos.y - centre.y) / extent.y) };
    }));
  }
  return handles;
}

/* ── Labelled lines (Phase Line / Line of Departure / Limit of Advance …) ── */

/**
 * A line through its anchors with its designation posted at both ends.
 *
 * A large block of the publication's control measures are exactly this, and
 * their draw rules are word-for-word identical: "requires at least two points,
 * points 1 and 2, to define the line. Additional points can be defined to
 * extend the line… The end-of-line information will typically be posted at the
 * ends of the line as it is displayed on the screen." What distinguishes a
 * phase line from a limit of advance is the text, not the geometry.
 *
 * The spine is a polyline of any length, and it is called `spine` on purpose:
 * that is the name the axis family already uses, so these symbols are covered
 * by spineCoherence.test.ts without it having to know they exist. The labels
 * are placed from the spine's own ends and turned to its own direction — post
 * them at absolute coordinates and they would be left behind the first time
 * the line was fitted to terrain.
 */
export function labelledLineFamily(p: Params): Part[] {
  const spine = p.spine as Pt[];
  const parts: Part[] = [stroke(polyD(spine), Boolean(p.dashed))];
  const text = p.label ? String(p.label) : '';
  if (text === '' || spine.length < 2) {
    return parts;
  }
  const size = (p.labelSize as number) ?? 260;
  const ends: Array<[Pt, Pt]> = [
    [spine[0], spine[1]],
    [spine[spine.length - 1], spine[spine.length - 2]],
  ];
  // Several of the fire-support lines are capped with a bar across each end —
  // the FSCL, the FSSL and the no-fire line all draw one in the publication's
  // examples. Derived from the end and its own direction, so a line refitted
  // to terrain keeps its caps square to itself.
  const tick = (p.endTick as number) ?? 0;
  if (tick > 0) {
    for (const [end, inward] of ends) {
      const n = perp(norm(sub(end, inward)));
      parts.push(stroke(lineD(add(end, mul(n, tick)), add(end, mul(n, -tick)))));
    }
  }
  for (const [end, inward] of ends) {
    const along = norm(sub(end, inward));
    // Centred on the end and set off to one side of the line, which is where
    // the publication puts it: in #95's example the text sits about 1.6 of its
    // own height clear of the line, centred on the endpoint, not beyond it.
    const pos = add(end, mul(right(along), size * 1.1));
    // Turned with the line, but never upside down: a phase line running east
    // to west is still read left to right.
    let deg = angleOf(along);
    if (deg > 90) { deg -= 180; }
    if (deg < -90) { deg += 180; }
    parts.push(textP(text, pos, size, deg));
  }
  return parts;
}

/**
 * A line of scallops: the forward edge of the battle area, and the
 * forward-line-of-own-troops graphics built the same way.
 *
 * Semicircular bumps along the spine, all on one side, drawn as arcs rather
 * than as a polyline approximation of arcs. The publication's FEBA example is
 * one path of five curve segments spanning 723 units at 55 tall — five bumps
 * whose radius is half their spacing — so the radius derives from the spacing,
 * and the spacing from the spine. Nothing is fixed but the count.
 */
export function scallopLineFamily(p: Params): Part[] {
  const spine = p.spine as Pt[];
  const parts: Part[] = [];
  const bumps = Math.max(1, (p.bumps as number) ?? 6);
  const sweep = (p.side as number) === -1 ? 1 : 0;
  const dashed = Boolean(p.dashed);

  // Bumps are distributed per segment in proportion to its length, so a bent
  // spine scallops evenly instead of crowding them into the short leg.
  const lengths = spine.slice(1).map((pt, i) => dist(spine[i], pt));
  const total = lengths.reduce((s, l) => s + l, 0) || 1;
  for (let s = 0; s + 1 < spine.length; s++) {
    const a = spine[s], b = spine[s + 1];
    const n = Math.max(1, Math.round((lengths[s] / total) * bumps));
    const r = lengths[s] / n / 2;
    for (let i = 0; i < n; i++) {
      const from = lerp(a, b, i / n);
      const to = lerp(a, b, (i + 1) / n);
      // `alternate` puts the bumps on both sides in turn — the line of contact,
      // where the two forces are each side of the same trace, rather than a
      // FEBA, whose bumps all face the enemy.
      const bulge = p.alternate && i % 2 === 1 ? 1 - sweep : sweep;
      parts.push(stroke(`M${f(from.x)},${f(from.y)} A${f(r)},${f(r)} 0 0,${bulge} ${f(to.x)},${f(to.y)}`, dashed));
    }
  }

  const text = p.label ? String(p.label) : '';
  if (text !== '' && spine.length >= 2) {
    const size = (p.labelSize as number) ?? 260;
    for (const [end, inward] of [[spine[0], spine[1]], [spine[spine.length - 1], spine[spine.length - 2]]] as Array<[Pt, Pt]>) {
      const along = norm(sub(end, inward));
      let deg = angleOf(along);
      if (deg > 90) { deg -= 180; }
      if (deg < -90) { deg += 180; }
      parts.push(textP(text, add(end, mul(right(along), size * 1.1)), size, deg));
    }
  }
  return parts;
}

/** Anchor handles for any spine-based symbol, and nothing else. */
export function polylineHandles(p: Params): EngineHandle[] {
  return (p.spine as Pt[]).map((pt, i) => ({
    id: `spine${i}`,
    kind: 'point' as const,
    pos: pt,
    set: (pos: Pt) => {
      const next = (p.spine as Pt[]).slice();
      next[i] = pos;
      return { spine: next };
    },
  }));
}

/* ── Inverted-cone point markers (Checkpoint / Linkup Point / Passage Point …) ── */

/**
 * The single largest family of APP-6D point control measures: a box carrying a
 * designation, tapering to a point at the bottom. The publication's draw rules
 * put it the other way round — "the point defines the tip of the inverted
 * cone" — and that is the important part, because the tip, not the box, is
 * where the thing being marked actually is.
 *
 * So `tip` is the anchor and everything else is measured from it. Rotation is
 * about the tip too: several of these ("will be rotated in 90 degree
 * increments") point the box off to one side so it does not cover the ground
 * it refers to, and a symbol that rotated about its box centre would drag its
 * tip off the location while doing so.
 *
 * The proportions come from the extracted templates, which are consistent to
 * within half a percent across the family: measured on #1, #9 and #105, the
 * box is 4/3 of the width tall and the taper another 2/3. `size` is the width;
 * `boxRatio` and `taperRatio` are there for the handful of entries that turn
 * out to differ, not as something each symbol should restate.
 */
export const CONE_BOX_RATIO = 4 / 3;
export const CONE_TAPER_RATIO = 2 / 3;

export interface ConeFrame {
  /** Anchor: the bottom point. */
  tip: Pt;
  /** Closed outline, from the tip round the box and back. */
  outline: Pt[];
  /** Box centre — where the designation sits. */
  labelPos: Pt;
  /** Midpoint of the top edge, the far end of the symbol from the tip. */
  top: Pt;
  /** Tip to top edge. */
  height: number;
}

export function coneFrame(p: Params): ConeFrame {
  const width = p.size as number;
  const taper = width * (p.taperRatio ?? CONE_TAPER_RATIO);
  const box = width * (p.boxRatio ?? CONE_BOX_RATIO);
  const rotation = (p.rotation as number) ?? 0;
  // Local coordinates, tip at the origin, box upwards (screen y grows down).
  const g = (x: number, y: number): Pt => add(p.tip as Pt, rot(P(x, y), rotation));
  const half = width / 2;
  return {
    tip: p.tip as Pt,
    outline: [
      g(0, 0),
      g(half, -taper),
      g(half, -(taper + box)),
      g(-half, -(taper + box)),
      g(-half, -taper),
    ],
    labelPos: g(0, -(taper + box / 2)),
    top: g(0, -(taper + box)),
    height: taper + box,
  };
}

export function coneMarkerFamily(p: Params): Part[] {
  const frame = coneFrame(p);
  const parts: Part[] = [stroke(polyD(frame.outline, true), Boolean(p.dashed))];
  // Empty is the honest default for the ones whose only text is the caller's
  // designation: an unlabelled cone is incomplete, a cone labelled with a
  // guess is wrong.
  if (p.label) {
    parts.push(textP(String(p.label), frame.labelPos, p.labelSize ?? (p.size as number) * 0.5, (p.rotation as number) ?? 0));
  }
  return parts;
}

export function coneMarkerHandles(p: Params): EngineHandle[] {
  const frame = coneFrame(p);
  const ratioSum = (p.taperRatio ?? CONE_TAPER_RATIO) + (p.boxRatio ?? CONE_BOX_RATIO);
  return [
    hPoint('tip', p),
    // One handle for both, as elsewhere in the catalog: how big and which way
    // are the only two things a static point graphic has to say.
    hScalar('sizeRotate', frame.top, (pos) => {
      const v = sub(pos, p.tip as Pt);
      return {
        size: Math.max(80, dist(pos, p.tip as Pt) / ratioSum),
        // Local "up" is -y, which is -90°; the offset makes an unrotated drag
        // straight up read as rotation 0.
        rotation: angleOf(v) + 90,
      };
    }),
  ];
}