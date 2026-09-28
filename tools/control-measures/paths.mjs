#!/usr/bin/env node
/**
 * The actual path data behind one control measure's template, biggest first.
 *
 *   node tools/control-measures/paths.mjs 7            # top 6 paths of #7
 *   node tools/control-measures/paths.mjs 8 --top 12 --raw
 *
 * preview.mjs answers "roughly what shape is this", which is enough to
 * recognise a symbol and not enough to author one. The difference between a
 * circle and a five-pointed star is four curve commands versus ten lines, and
 * at 40 characters wide both are a blob. This prints what the publication
 * actually drew: each path's command sequence (`M C4 Z` is a circle, `M L3 Z`
 * a quadrilateral), its bounding box in the same 0-2048 parameter box the
 * INDEX uses, and on request the numbers themselves.
 *
 * Coordinates go through the same flatten-and-normalise as extract.mjs, so
 * what is printed here lines up with INDEX.json and with anything authored
 * against it.
 */

import { readFileSync } from "node:fs";

const ROOT = "reference/control-measures";
const PARAM_BOX = 2048;

const argv = process.argv.slice(2);
const ids = [];
let top = 6;
let raw = false;
let file = "TEMPLATE.svg";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--top") { top = Number(argv[++i]); }
  else if (argv[i] === "--raw") { raw = true; }
  else if (argv[i] === "--example") { file = "EXAMPLE.svg"; }
  else { ids.push(argv[i]); }
}
if (ids.length === 0) {
  console.error("usage: node tools/control-measures/paths.mjs <id...> [--top N] [--raw] [--example]");
  process.exit(2);
}

const applyMatrix = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** Command letters and their coordinate pairs, in order. */
function parsePath(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out = [];
  let i = 0;
  let cmd = "M";
  let x = 0, y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) { cmd = tokens[i++]; continue; }
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    const pts = [];
    if (upper === "H") { const n = num(); x = rel ? x + n : n; pts.push({ x, y }); }
    else if (upper === "V") { const n = num(); y = rel ? y + n : n; pts.push({ x, y }); }
    else if (upper === "Z") { /* no coordinates */ }
    else {
      const pairs = upper === "C" ? 3 : upper === "S" || upper === "Q" ? 2 : 1;
      for (let p = 0; p < pairs; p++) {
        const px = num(), py = num();
        pts.push({ x: rel ? x + px : px, y: rel ? y + py : py });
      }
      const last = pts[pts.length - 1];
      x = last.x; y = last.y;
      if (upper === "M") { cmd = rel ? "l" : "L"; }
    }
    out.push({ cmd: upper, pts });
  }
  return out;
}

/** "M C4 Z" — the shape of the path, without its numbers. */
const shapeOf = (cmds) => {
  const parts = [];
  for (const c of cmds) {
    const last = parts[parts.length - 1];
    if (last && last.cmd === c.cmd) { last.n++; } else { parts.push({ cmd: c.cmd, n: 1 }); }
  }
  return parts.map((p) => (p.n > 1 ? `${p.cmd}${p.n}` : p.cmd)).join(" ");
};

for (const id of ids) {
  const svg = readFileSync(`${ROOT}/${id}/${file}`, "utf8");
  const viewBox = svg.match(/viewBox="([^"]+)"/);
  if (!viewBox) { console.log(`#${id} — no viewBox`); continue; }
  const [vx, vy, vw, vh] = viewBox[1].trim().split(/\s+/).map(Number);
  const body = svg.slice(svg.indexOf("</defs>") + 7);

  const paths = [];
  for (const tag of body.match(/<path[^>]*>/g) ?? []) {
    const d = tag.match(/\sd="([^"]+)"/)?.[1];
    if (!d) { continue; }
    const m = tag.match(/transform="matrix\(([^)]+)\)"/);
    const matrix = m ? m[1].split(",").map(Number) : [1, 0, 0, 1, 0, 0];
    const cmds = parsePath(d).map((c) => ({ cmd: c.cmd, pts: c.pts.map((p) => applyMatrix(matrix, p.x, p.y)) }));
    const all = cmds.flatMap((c) => c.pts);
    if (all.length === 0) { continue; }
    const box = {
      x0: Math.min(...all.map((p) => p.x)), x1: Math.max(...all.map((p) => p.x)),
      y0: Math.min(...all.map((p) => p.y)), y1: Math.max(...all.map((p) => p.y)),
    };
    if (box.x1 - box.x0 > vw || box.y1 - box.y0 > vh) { continue; }
    if (box.x1 < vx || box.x0 > vx + vw || box.y1 < vy || box.y0 > vy + vh) { continue; }
    paths.push({ cmds, box });
  }
  if (paths.length === 0) { console.log(`#${id} — nothing inside the crop`); continue; }

  // Same normalisation as extract.mjs: scale from the symbol, ignoring the
  // page's hairline rules, so these numbers match INDEX.json.
  const isRule = (b) =>
    Math.max(b.x1 - b.x0, b.y1 - b.y0) > Math.min(vw, vh) * 0.3
    && Math.min(b.x1 - b.x0, b.y1 - b.y0) < Math.max(vw, vh) * 0.015;
  const body2 = paths.filter((p) => !isRule(p.box));
  const src = body2.length > 0 ? body2 : paths;
  const all = {
    x0: Math.min(...src.map((p) => p.box.x0)), x1: Math.max(...src.map((p) => p.box.x1)),
    y0: Math.min(...src.map((p) => p.box.y0)), y1: Math.max(...src.map((p) => p.box.y1)),
  };
  const span = Math.max(all.x1 - all.x0, all.y1 - all.y0) || 1;
  const scale = PARAM_BOX / span;
  const ox = (PARAM_BOX - (all.x1 - all.x0) * scale) / 2;
  const oy = (PARAM_BOX - (all.y1 - all.y0) * scale) / 2;
  const N = (p) => [Math.round((p.x - all.x0) * scale + ox), Math.round((p.y - all.y0) * scale + oy)];

  console.log(`\n#${id} — ${paths.length} paths inside the crop (${file})`);
  const ranked = paths
    .map((p) => ({ ...p, area: (p.box.x1 - p.box.x0) * (p.box.y1 - p.box.y0) }))
    .sort((a, b) => b.area - a.area)
    .slice(0, top);
  for (const p of ranked) {
    const b = { ...N({ x: p.box.x0, y: p.box.y0 }), 2: 0 };
    const [x0, y0] = N({ x: p.box.x0, y: p.box.y0 });
    const [x1, y1] = N({ x: p.box.x1, y: p.box.y1 });
    void b;
    console.log(`  ${shapeOf(p.cmds).padEnd(18)} x ${String(x0).padStart(5)}..${String(x1).padStart(5)}  y ${String(y0).padStart(5)}..${String(y1).padStart(5)}${isRule(p.box) ? "  (rule)" : ""}`);
    if (raw) {
      console.log("      " + p.cmds.map((c) => `${c.cmd}${c.pts.map(N).map((q) => q.join(",")).join(" ")}`).join(" "));
    }
  }
}
