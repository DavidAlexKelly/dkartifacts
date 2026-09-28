#!/usr/bin/env node
/**
 * The text the publication prints inside a control measure's template.
 *
 *   node tools/control-measures/text.mjs 10 105 264
 *   node tools/control-measures/text.mjs 145 --example
 *
 * This should have been the first tool written. The template SVGs draw their
 * text as ~1700 <use> elements referencing glyphs in <defs> — which is why
 * extract.mjs, reading only <path>, never saw a word of it — but each one
 * carries a `data-text` attribute with its own character and a transform with
 * its own position. Sorting those by line and joining them reads the page back
 * out.
 *
 * What that gives, per row:
 *
 *  - The symbol's fixed abbreviation, if it has one. "PP" on the passage point
 *    was a defensible guess from doctrine before this; now it is what the
 *    publication says.
 *  - Its modifier fields: a template shows H, W, T, W1 and so on placed where
 *    each belongs, which is the difference between a symbol that carries a
 *    designation and one that carries a designation, an altitude and a
 *    date-time group.
 *  - "ANCHOR POINT" annotations, which mark where the anchors actually are.
 *
 * Only text inside the crop is printed: these pages carry a whole table's
 * worth of prose around each symbol, and none of it belongs to the symbol.
 */

import { readFileSync } from "node:fs";

const ROOT = "reference/control-measures";

const argv = process.argv.slice(2);
const ids = [];
let file = "TEMPLATE.svg";
let all = false;
for (const a of argv) {
  if (a === "--example") { file = "EXAMPLE.svg"; }
  else if (a === "--all") { all = true; }
  else { ids.push(a); }
}
if (ids.length === 0) {
  console.error("usage: node tools/control-measures/text.mjs <id...> [--example] [--all]");
  process.exit(2);
}

for (const id of ids) {
  let svg;
  try {
    svg = readFileSync(`${ROOT}/${id}/${file}`, "utf8");
  } catch {
    console.log(`\n#${id} — no ${file}`);
    continue;
  }
  const viewBox = svg.match(/viewBox="([^"]+)"/);
  if (!viewBox) { console.log(`\n#${id} — no viewBox`); continue; }
  const [vx, vy, vw, vh] = viewBox[1].trim().split(/\s+/).map(Number);

  const glyphs = [];
  for (const m of svg.matchAll(/<use[^>]*data-text="([^"]*)"[^>]*transform="matrix\(([^)]+)\)"/g)) {
    const t = m[2].split(",").map(Number);
    const x = t[4];
    const y = t[5];
    // The glyph's own scale doubles as its font size, which is how a symbol's
    // label (large) is told apart from the page's body text (small).
    const size = Math.abs(t[0]);
    if (!all && (x < vx || x > vx + vw || y < vy || y > vy + vh)) { continue; }
    glyphs.push({ ch: m[1], x, y, size });
  }

  // Same baseline, left to right. The publication sets these one glyph at a
  // time, so a "line" is a cluster of y values rather than an exact match.
  glyphs.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const g of glyphs) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(g.y - line.y) <= 3) {
      line.glyphs.push(g);
    } else {
      lines.push({ y: g.y, glyphs: [g] });
    }
  }

  console.log(`\n#${id} (${file}) — ${glyphs.length} glyphs inside the crop`);
  for (const line of lines) {
    line.glyphs.sort((a, b) => a.x - b.x);
    const text = line.glyphs.map((g) => g.ch).join("").replace(/\s+/g, " ").trim();
    if (text === "") { continue; }
    const size = Math.max(...line.glyphs.map((g) => g.size));
    console.log(`  y ${String(Math.round(line.y)).padStart(5)}  ${String(Math.round(size)).padStart(3)}pt  ${text}`);
  }
}
