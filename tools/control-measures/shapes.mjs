#!/usr/bin/env node
/**
 * Group the extracted control measures by the shape they are drawn as.
 *
 *   node tools/control-measures/shapes.mjs             # every family
 *   node tools/control-measures/shapes.mjs cone        # one family
 *   node tools/control-measures/shapes.mjs circle --treatment static
 *
 * Authoring 346 symbols one picture at a time is the slow way round. Most of
 * them are the same handful of shapes with different letters in them, and a
 * shape is something the extraction can be *asked about* rather than eyeballed:
 * the inverted cone, for instance, is a box of 4/3 the width sitting directly
 * on a taper of 2/3, and that pair is distinctive enough to find by measurement
 * across all 346 in a second.
 *
 * That matters beyond speed. Ten of these entries lost their DRAW RULES page to
 * the crop and are triaged `review` with no anchor count — but if the geometry
 * is the same cone as ten symbols whose rules DO say "the point defines the tip
 * of the inverted cone", that is evidence about how they are anchored, not a
 * guess. #13 Rally Point, #14 Release Point, #16 Start Point, #270 Reload Point
 * and #271 Survey Control Point were all authored on exactly that basis.
 *
 * A match is a lead, not a verdict: check the shape with preview.mjs before
 * authoring against it.
 */

import { readFileSync } from "node:fs";

const INDEX = "reference/control-measures/INDEX.json";
const PARAM_BOX = 2048;

const argv = process.argv.slice(2);
const wanted = [];
let treatment = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--treatment") { treatment = argv[++i]; }
  else { wanted.push(argv[i]); }
}

const index = JSON.parse(readFileSync(INDEX, "utf8"));

const boxOf = (pts) => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, n: pts.length };
};

/** Page furniture, as in preview.mjs: long, hairline, axis-aligned. */
const isRule = (b) => Math.max(b.w, b.h) > PARAM_BOX * 0.3 && Math.min(b.w, b.h) < PARAM_BOX * 0.015;

/**
 * A box sitting directly on a taper of the same width — the inverted cone the
 * point-marker family is drawn as. Proportions are checked loosely: the crops
 * differ in scale and the OCR-era tracing is not exact, but 4/3 and 2/3 are
 * stable to about a percent across every confirmed member.
 */
function cone(boxes) {
  for (const a of boxes) {
    for (const b of boxes) {
      if (a === b || a.w < 150 || b.w < 150) { continue; }
      if (Math.abs(a.w - b.w) > 0.1 * a.w) { continue; }
      if (Math.abs(a.y1 - b.y0) > 0.06 * a.h) { continue; }
      const ra = a.h / a.w, rb = b.h / b.w;
      if (ra > 1.1 && ra < 1.6 && rb > 0.45 && rb < 0.9) {
        return `w ${Math.round(a.w)}, box ${ra.toFixed(2)}w, taper ${rb.toFixed(2)}w`;
      }
    }
  }
  return null;
}

/**
 * Round: a curve traced into many points inside a square bounding box. The
 * publication draws its circles as one path, so the point count is the tell —
 * a square of the same size arrives as five points.
 */
function circle(boxes) {
  for (const b of boxes) {
    if (b.w < 250 || b.n < 12) { continue; }
    if (Math.abs(b.w - b.h) > 0.12 * b.w) { continue; }
    return `d ${Math.round(b.w)}, ${b.n} pts`;
  }
  return null;
}

/** Four corners, right angles, square-ish. */
function square(boxes) {
  for (const b of boxes) {
    if (b.w < 250 || b.n > 6) { continue; }
    if (Math.abs(b.w - b.h) > 0.12 * b.w) { continue; }
    return `${Math.round(b.w)} square, ${b.n} pts`;
  }
  return null;
}

const FAMILIES = { cone, circle, square };

for (const [name, detect] of Object.entries(FAMILIES)) {
  if (wanted.length > 0 && !wanted.includes(name)) { continue; }
  const hits = [];
  for (const entry of index) {
    if (treatment && entry.treatment !== treatment) { continue; }
    const subs = entry.outline?.points ?? [];
    if (subs.length === 0) { continue; }
    const boxes = subs.map(boxOf).filter((b) => !isRule(b));
    const why = detect(boxes);
    if (why) { hits.push({ entry, why }); }
  }
  console.log(`\n${name} — ${hits.length} entries`);
  for (const { entry, why } of hits) {
    console.log(
      `  #${String(entry.id).padStart(4)}  ${(entry.existingSymbol ?? "—").padEnd(24)}` +
      `${entry.treatment.padEnd(9)} ${why.padEnd(28)} ${entry.name.replace(/\s+/g, " ").slice(0, 46)}`,
    );
  }
}
