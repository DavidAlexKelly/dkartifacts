#!/usr/bin/env node
/**
 * Look at an extracted control measure without opening the source SVG.
 *
 *   node tools/control-measures/preview.mjs 1 5 60 145
 *   node tools/control-measures/preview.mjs 109 --cols 96 --all
 *
 * INDEX.json carries each symbol's outline as subpaths of points in the
 * library's 0-2048 parameter box. That is the right form for authoring against
 * and the wrong form for reading: 30-odd polygons of four-decimal numbers say
 * nothing about what the symbol looks like. This rasterises them, so the shape
 * can be recognised (and the extraction's mistakes spotted) from a terminal.
 *
 * Two things to know about what you are looking at:
 *
 *  - The outlines come from a PDF, where strokes are filled quads. A single
 *    drawn line is therefore a long thin rectangle, and a "V" is one polygon
 *    tracing all the way round both arms. Edges are drawn, not fills, so thin
 *    shapes read as doubled lines at this resolution. That is the source, not
 *    a bug here.
 *  - Some crops caught the publication's table rules. Those span the full crop
 *    and normalise into a box around the symbol, which also means they shrink
 *    the symbol itself: geometry is scaled to fit whatever was extracted. Page
 *    furniture is dropped by default and listed as "dropped"; --all keeps it,
 *    which is how you confirm a suspicious outline is a table and not part of
 *    the graphic.
 */

import { readFileSync } from "node:fs";

const PARAM_BOX = 2048;
const INDEX = "reference/control-measures/INDEX.json";

const argv = process.argv.slice(2);
const ids = [];
let cols = 72;
let keepFurniture = false;
let parts = false;
let minSpan = 0;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--all") { keepFurniture = true; }
  else if (a === "--parts") { parts = true; }
  else if (a === "--cols") { cols = Number(argv[++i]); }
  else if (a === "--min") { minSpan = Number(argv[++i]); }
  else { ids.push(a); }
}

if (ids.length === 0) {
  console.error("usage: node tools/control-measures/preview.mjs <id...> [--cols N] [--all] [--parts] [--min SPAN]");
  process.exit(2);
}

const index = JSON.parse(readFileSync(INDEX, "utf8"));

/**
 * A table rule: long, hairline, and axis-aligned. The publication's cell
 * borders are not always the full width of the crop — plenty of these entries
 * caught one cell of a table, so its borders sit inset — but they are always
 * far longer than they are thick, and thinner than any stroke the symbol
 * itself is drawn with. A symbol's own straight lines come through the same
 * way, so anything suspicious is worth a second look with `--all`.
 */
const isFurniture = (bbox) => {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const long = Math.max(w, h);
  const thin = Math.min(w, h);
  return long > PARAM_BOX * 0.3 && thin < PARAM_BOX * 0.015;
};

const bboxOf = (pts) => ({
  minX: Math.min(...pts.map((p) => p[0])),
  minY: Math.min(...pts.map((p) => p[1])),
  maxX: Math.max(...pts.map((p) => p[0])),
  maxY: Math.max(...pts.map((p) => p[1])),
});

const round = (n) => Math.round(n);

/** Distinct mark per subpath, so a shape can be told from a placeholder letter. */
const MARKS = "123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function rasterise(subpaths, cols, box, labelled) {
  // Character cells are about twice as tall as they are wide.
  const rows = Math.max(8, Math.round(cols / 2));
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(" "));

  if (subpaths.length === 0) { return { grid, box: null }; }
  const spanX = Math.max(1, box.maxX - box.minX);
  const spanY = Math.max(1, box.maxY - box.minY);
  // Uniform scale, so the aspect ratio survives; the shape is what matters.
  const scale = Math.min((cols - 1) / spanX, (rows - 1) / spanY);
  const offX = (cols - 1 - spanX * scale) / 2;
  const offY = (rows - 1 - spanY * scale) / 2;
  const toCell = (p) => ({
    c: Math.round((p[0] - box.minX) * scale + offX),
    r: Math.round((p[1] - box.minY) * scale + offY),
  });

  const plot = (c, r, ch) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) { return; }
    grid[r][c] = ch;
  };

  // Bresenham, so a diagonal reads as a diagonal rather than a dotted trail.
  const line = (a, b, ch) => {
    let { c: c0, r: r0 } = a;
    const { c: c1, r: r1 } = b;
    const dc = Math.abs(c1 - c0);
    const dr = Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1;
    const sr = r0 < r1 ? 1 : -1;
    let err = dc - dr;
    for (;;) {
      plot(c0, r0, ch);
      if (c0 === c1 && r0 === r1) { break; }
      const e2 = 2 * err;
      if (e2 > -dr) { err -= dr; c0 += sc; }
      if (e2 < dc) { err += dc; r0 += sr; }
    }
  };

  subpaths.forEach((sub, idx) => {
    const ch = labelled ? MARKS[idx % MARKS.length] : "#";
    const cells = sub.map(toCell);
    for (let i = 1; i < cells.length; i++) { line(cells[i - 1], cells[i], ch); }
    if (cells.length > 2) { line(cells[cells.length - 1], cells[0], ch); }
  });
  return { grid, box };
}

for (const id of ids) {
  const entry = index.find((e) => String(e.id) === String(id));
  if (!entry) {
    console.log(`\n#${id} — not in INDEX.json`);
    continue;
  }
  const name = (entry.name || "").replace(/\s+/g, " ").trim();
  console.log(`\n${"═".repeat(cols)}`);
  console.log(`#${entry.id}  ${name}`);
  console.log(`treatment=${entry.treatment}  anchors=${entry.rules?.anchors ?? "?"}  ` +
    `static=${entry.rules?.sizeStatic ?? "?"}  upright=${entry.rules?.orientationUpright ?? "?"}` +
    (entry.existingSymbol ? `  already: ${entry.existingSymbol}` : ""));

  const subpaths = entry.outline?.points ?? [];
  if (subpaths.length === 0) {
    console.log("no extracted geometry");
    continue;
  }

  const kept = [];
  let dropped = 0;
  for (const sub of subpaths) {
    if (!keepFurniture && isFurniture(bboxOf(sub))) { dropped++; continue; }
    kept.push(sub);
  }
  const base = kept.length > 0 ? kept : subpaths;
  // Scale from everything that survived the furniture filter, so raising --min
  // hides small parts without resizing what is left.
  const box = bboxOf(base.flat());

  const shown = base.filter((sub) => {
    if (minSpan <= 0) { return true; }
    const b = bboxOf(sub);
    return Math.max(b.maxX - b.minX, b.maxY - b.minY) >= minSpan;
  });

  const { grid } = rasterise(shown, cols, box, parts);
  for (const row of grid) { console.log(row.join("").replace(/\s+$/, "")); }
  console.log(`bbox x ${round(box.minX)}..${round(box.maxX)}  y ${round(box.minY)}..${round(box.maxY)}` +
    `   subpaths kept ${base.length}${dropped ? `, dropped ${dropped} as page furniture` : ""}` +
    (shown.length !== base.length ? `, showing ${shown.length} over --min ${minSpan}` : ""));

  if (parts) {
    shown.forEach((sub, idx) => {
      const b = bboxOf(sub);
      console.log(`  ${MARKS[idx % MARKS.length]}  x ${String(round(b.minX)).padStart(5)}..${String(round(b.maxX)).padStart(5)}` +
        `  y ${String(round(b.minY)).padStart(5)}..${String(round(b.maxY)).padStart(5)}` +
        `  ${round(b.maxX - b.minX)}x${round(b.maxY - b.minY)}  ${sub.length} pts`);
    });
  }
}
