// engine/geometry.ts — pure 2D math used by the parametric graphic engine.
// Zero dependencies. Safe to import standalone if you're writing your own
// SymbolDefinition and want the same primitives the built-in catalog uses.
export type Pt = { x: number; y: number };

export const DEG = Math.PI / 180;
export const P = (x: number, y: number): Pt => ({ x, y });
export const add = (a: Pt, b: Pt): Pt => P(a.x + b.x, a.y + b.y);
export const sub = (a: Pt, b: Pt): Pt => P(a.x - b.x, a.y - b.y);
export const mul = (a: Pt, k: number): Pt => P(a.x * k, a.y * k);
export const vlen = (a: Pt): number => Math.hypot(a.x, a.y);
/** Scalar product. With a unit vector, this is "how far along that direction". */
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
export const dist = (a: Pt, b: Pt): number => vlen(sub(a, b));
export const norm = (a: Pt): Pt => { const l = vlen(a) || 1; return P(a.x / l, a.y / l); };
export const lerp = (a: Pt, b: Pt, t: number): Pt => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
/** left normal (screen coords, y down) */
export const perp = (a: Pt): Pt => P(a.y, -a.x);
/** right normal */
export const right = (a: Pt): Pt => P(-a.y, a.x);
export const rot = (a: Pt, deg: number): Pt => {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return P(a.x * c - a.y * s, a.x * s + a.y * c);
};
export const angleOf = (a: Pt): number => Math.atan2(a.y, a.x) / DEG;
export const onCircle = (c: Pt, r: number, deg: number): Pt =>
  P(c.x + r * Math.cos(deg * DEG), c.y + r * Math.sin(deg * DEG));
export const f = (n: number): number => Math.round(n * 100) / 100;

/** Escape a string for safe use as SVG/XML text content (between tags). */
export const escapeXmlText = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Escape a string for safe use inside a double-quoted SVG/XML attribute value. */
export const escapeXmlAttr = (s: string): string => escapeXmlText(s).replace(/"/g, '&quot;');

/** scalar projection of (pos - origin) onto unit direction `dir` */
export function project(pos: Pt, origin: Pt, dir: Pt): number {
  const v = sub(pos, origin);
  return v.x * dir.x + v.y * dir.y;
}

/**
 * Every position a path's `d` string visits.
 *
 * Command-aware, which is the entire point: `A rx ry rotation large sweep x y`
 * carries five numbers that are not a coordinate, so pairing numbers off
 * blindly turns a ring into a scatter of points near the origin. Anything
 * measuring a symbol — bounds, hit-testing, the coherence tests that assert
 * geometry followed its anchors — needs the positions and only the positions.
 *
 * Curve control points count as positions here: they bound the curve, and no
 * caller so far wants the flattened outline instead.
 */
export function pathPoints(d: string): Pt[] {
  const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
  const points: Pt[] = [];
  let cmd = 'M';
  let i = 0;
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) { cmd = tokens[i++]; continue; }
    if (cmd.toUpperCase() === 'A') { i += 5; }
    const x = Number(tokens[i++]);
    const y = Number(tokens[i++]);
    if (Number.isFinite(x) && Number.isFinite(y)) { points.push(P(x, y)); }
  }
  return points;
}

export const polyD = (pts: Pt[], closed = false): string =>
  'M' + pts.map(p => `${f(p.x)},${f(p.y)}`).join(' L') + (closed ? ' Z' : '');
export const lineD = (a: Pt, b: Pt): string => polyD([a, b]);

/** open chevron arrowhead pointing along dir */
export function chevron(tip: Pt, dir: Pt, len: number, spread: number): string {
  const back = mul(norm(dir), -1);
  return polyD([
    add(tip, mul(rot(back, -spread), len)),
    tip,
    add(tip, mul(rot(back, spread), len)),
  ]);
}

/** straight line split by a gap centred near gapCenter (label knockout) */
export function lineWithGap(a: Pt, b: Pt, gapCenter: Pt, gapHalf: number): string[] {
  const d = norm(sub(b, a)), L = dist(a, b);
  const t = Math.max(gapHalf, Math.min(L - gapHalf,
    (gapCenter.x - a.x) * d.x + (gapCenter.y - a.y) * d.y));
  return [lineD(a, add(a, mul(d, t - gapHalf))), lineD(add(a, mul(d, t + gapHalf)), b)];
}

export const labelGapHalf = (label: string, size: number): number =>
  label.length * size * 0.36 + size * 0.55;

/**
 * Circle arc(s) drawn in the doctrinal "MilX direction" (from angle
 * a0 = gapAngle - gapHalf, sweeping 360 - 2*gapHalf degrees), with optional
 * extra gaps carved out (label knockouts). Returns an array of path `d`
 * strings — one per contiguous arc segment.
 */
export function circleArcs(
  c: Pt, r: number, gapAngle: number, gapHalf: number,
  extraGaps?: Array<{ angle: number; half: number }>,
): string[] {
  const a0 = gapAngle - gapHalf;
  const S = 360 - 2 * gapHalf;
  let intervals: Array<[number, number]> = [[0, S]];
  for (const g of (extraGaps || [])) {
    const tg = ((a0 - g.angle) % 360 + 360) % 360;
    const cut: [number, number] = [tg - g.half, tg + g.half];
    const next: Array<[number, number]> = [];
    for (const [s, e] of intervals) {
      if (cut[1] <= s || cut[0] >= e) { next.push([s, e]); continue; }
      if (cut[0] > s) {next.push([s, cut[0]]);}
      if (cut[1] < e) {next.push([cut[1], e]);}
    }
    intervals = next;
  }
  return intervals.filter(([s, e]) => e - s > 0.5).map(([s, e]) => {
    const p0 = onCircle(c, r, a0 - s), p1 = onCircle(c, r, a0 - e);
    const large = (e - s) > 180 ? 1 : 0;
    return `M${f(p0.x)},${f(p0.y)} A${f(r)},${f(r)} 0 ${large},0 ${f(p1.x)},${f(p1.y)}`;
  });
}

/** direction a circle-task arrowhead points at the gap edge (flow arrives there) */
export const gapArrowDir = (deg: number): Pt => P(-Math.sin(deg * DEG), Math.cos(deg * DEG));

/** polyline offsetting used by axis-of-advance style arrows */
export function offsetPolyline(pts: Pt[], w: number): Pt[] {
  const n = pts.length, out: Pt[] = [];
  const segN: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {segN.push(perp(norm(sub(pts[i + 1], pts[i]))));}
  for (let i = 0; i < n; i++) {
    if (i === 0) { out.push(add(pts[0], mul(segN[0], w))); continue; }
    if (i === n - 1) { out.push(add(pts[n - 1], mul(segN[n - 2], w))); continue; }
    const p1 = add(pts[i], mul(segN[i - 1], w)), d1 = sub(pts[i], pts[i - 1]);
    const p2 = add(pts[i], mul(segN[i], w)), d2 = sub(pts[i + 1], pts[i]);
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-6) { out.push(p1); continue; }
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
    out.push(add(p1, mul(d1, t)));
  }
  return out;
}