#!/usr/bin/env node
/**
 * Write src/PackageApps/tacticalGraphics/SYMBOLS.md — what is in the catalog,
 * what state each symbol is in, and what is still missing.
 *
 *   cd packages/app6d && npm run build   # dist is the input
 *   node tools/control-measures/symbols-doc.mjs            # from the repo root
 *
 * Generated rather than written, for the same reason COVERAGE.md is: a
 * hand-maintained list of 149 symbols is a list that disagrees with the catalog
 * within a week, and quietly. Everything here is read from the built package
 * and from INDEX.json — the family from a symbol's params, the anchor from its
 * declared unitAnchor, the label from its defaults, the reference row from the
 * coverage matcher — so the only way for it to be wrong is for the catalog to
 * be wrong.
 *
 * What it deliberately does NOT do is grade the symbols. "Implemented" here
 * means "in the catalog and drawing"; whether the graphic matches the doctrine
 * is a judgement each symbol's own file records in prose, and the notes column
 * points at the evidence rather than restating it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OUT = "src/PackageApps/tacticalGraphics/SYMBOLS.md";

let symbols;
let tasks;
try {
  // Literal specifiers, resolved relative to this file. The build path is
  // fixed, so composing it at runtime bought nothing and cost a code-scan
  // finding — a non-literal require() is a real hazard in general, even where
  // the string is a constant here, and being cwd-independent is a bonus.
  symbols = require("../../packages/app6d/dist/symbols/index.cjs").APP6D_SYMBOLS;
  tasks = require("../../packages/app6d/dist/core/index.cjs").TACTIC_TASK_CATALOG;
} catch (err) {
  console.error("Build the package first: cd packages/app6d && npm run build");
  console.error(String(err));
  process.exit(1);
}

const index = JSON.parse(readFileSync("reference/control-measures/INDEX.json", "utf8"));

/** Reference rows, by the catalog file the coverage matcher tied them to. */
const rowsByFile = new Map();
for (const entry of index) {
  if (!entry.existingSymbol) { continue; }
  const list = rowsByFile.get(entry.existingSymbol) ?? [];
  list.push(entry);
  rowsByFile.set(entry.existingSymbol, list);
}

/**
 * Which family a symbol belongs to, from the shape of its params. Ordered:
 * a scalloped line also has a spine, and a range fan also has a centre.
 */
function familyOf(p) {
  if (p.tip) { return "Inverted cone point markers"; }
  if (p.ring) { return "Drawn areas"; }
  if (p.radii) { return "Range fans"; }
  if (p.spine && typeof p.bumps === "number") { return "Scalloped lines"; }
  if (p.spine && p.halfWidth === undefined) { return "Labelled lines"; }
  if (p.spine) { return "Axis of advance and attack graphics"; }
  if (p.A && typeof p.count === "number") { return "Obstacle rows"; }
  if (p.center && typeof p.radius === "number") { return "Circle-task graphics"; }
  if (p.center) { return "Centre-anchored point glyphs"; }
  // A/B is the older two-anchor convention, P1/P2 the breach-and-gate one.
  if ((p.A && p.B) || (p.P1 && p.P2)) { return "Two-anchor graphics"; }
  return "Bespoke geometry";
}

const FAMILY_ORDER = [
  "Inverted cone point markers",
  "Centre-anchored point glyphs",
  "Labelled lines",
  "Scalloped lines",
  "Drawn areas",
  "Obstacle rows",
  "Range fans",
  "Axis of advance and attack graphics",
  "Circle-task graphics",
  "Two-anchor graphics",
  "Bespoke geometry",
];

const labelOf = (p) => {
  const raw = Array.isArray(p.label) ? p.label.join(" ") : p.label;
  if (raw === undefined) { return "—"; }
  if (raw === "" || raw === null) { return "_caller's_"; }
  return `\`${raw}\``;
};

const taskName = (id) => tasks.find((t) => t.id === id)?.name;

const { resolveUnitAnchorHandle } = require("../../packages/app6d/dist/core/index.cjs");
const catalog = require("../../packages/app6d/dist/symbols/index.cjs").APP6D_CATALOG;

const rows = [];
for (const [name, def] of Object.entries(symbols)) {
  const file = name.replace(/^svg-/, "");
  const refs = rowsByFile.get(file) ?? [];
  // Whether the unit anchor is a handle or a position derived from several.
  // Only a handle can be attached to: gluing a symbol to a unit re-applies
  // every other handle, which needs the anchor's id.
  const resolved = resolveUnitAnchorHandle(catalog, name);
  const derived = resolved === undefined || resolved.id === undefined;
  rows.push({
    name,
    title: def.title,
    family: familyOf(def.params),
    anchor: def.unitAnchor
      ? `${def.unitAnchor}${derived ? " _(derived)_" : ` → \`${resolved.id}\``}`
      : "—",
    handles: def.handles(def.params).length,
    label: labelOf(def.params),
    dashed: def.params.dashed === true,
    refs: refs.map((r) => `#${r.id}`),
    task: def.meta?.sidcTaskId,
  });
}

const byFamily = new Map();
for (const row of rows) {
  const list = byFamily.get(row.family) ?? [];
  list.push(row);
  byFamily.set(row.family, list);
}

const authored = new Set(index.filter((e) => e.existingSymbol).map((e) => e.id));
const missingByTreatment = new Map();
for (const entry of index) {
  if (authored.has(entry.id)) { continue; }
  const list = missingByTreatment.get(entry.treatment) ?? [];
  list.push(entry);
  missingByTreatment.set(entry.treatment, list);
}

const tasksWithGraphic = new Set(rows.map((r) => r.task).filter(Boolean));
const tasksWithout = tasks.filter((t) => !tasksWithGraphic.has(t.id));

const lines = [];
const out = (s = "") => lines.push(s);

out("# Task symbols — what is implemented, and in what state");
out();
out("Generated by `node tools/control-measures/symbols-doc.mjs` from the built");
out("package and `reference/control-measures/INDEX.json`. Re-run it after adding");
out("symbols; do not hand-edit, because a hand-maintained list of this length");
out("disagrees with the catalog within a week and does it quietly.");
out();
out("The `/symbols` page of the harness app renders every one of these live —");
out("this document is the inventory, that page is the picture.");
out();
out("## How to read it");
out();
out("| Column | Meaning |");
out("|---|---|");
out("| **Symbol** | The catalog name, and what `paramsFor`/`getParts` take. |");
out("| **Reference** | The row(s) in the APP-6D extract this was authored from. Blank means it came from `TACTIC_TASK_CATALOG` or is a plain shape the publication assumes rather than tabulates. |");
out("| **Anchor** | `unitAnchor`, and the handle it resolves to. This is where a unit sits once an order is assigned, and an ordinary drag handle until then — `start` on the cone markers is their tip, `start` on an axis is the arrow's tail. `_(derived)_` means it resolves to a position with no handle behind it: the midpoint of an obstacle row, say, which is the right place for the symbol and not something a unit can be glued to. |");
out("| **Handles** | How many drag handles the symbol exposes at its defaults. |");
out("| **Label** | The text it draws by default. _caller's_ means the slot exists and starts empty because the only text the symbol carries is a designation, an altitude or a date-time group. `—` means it draws no text at all. |");
out("| **Task** | The `TACTIC_TASK_CATALOG` id this graphic satisfies, where it has one. |");
out();
out("Every symbol listed is in the catalog and drawing: `catalogSanity.test.ts`");
out("asserts that each one produces finite geometry inside the parameter box with");
out("handles that land where they are dragged, and it enumerates the catalog, so");
out("nothing here is untested. Whether a graphic matches its doctrine is a");
out("separate question, and each symbol's own file records the evidence it was");
out("authored from — the abbreviations in particular, several of which were read");
out("out of the publication's own templates with `tools/control-measures/text.mjs`.");
out();
out(`## Summary`);
out();
out("| | Count |");
out("|---|---|");
out(`| Symbols in the catalog | ${rows.length} |`);
out(`| Reference rows authored | ${authored.size} of ${index.length} |`);
out(`| Doctrinal tasks with a graphic | ${tasksWithGraphic.size} of ${tasks.length} |`);
out(`| Families | ${byFamily.size} |`);
out();

const FAMILY_NOTES = {
  "Inverted cone point markers": "A box tapering to the anchor. The tip is where the thing being marked actually is, and rotation is about the tip, so turning the box aside does not move the location. `coneMarkerFamily`.",
  "Centre-anchored point glyphs": "Fixed local geometry — ring, star, box, cross — scaled and turned about a centre. `pointGlyph`.",
  "Labelled lines": "A polyline with its designation posted at both ends, and optionally a bar across each end. Extra anchors extend the line. `labelledLineFamily`.",
  "Scalloped lines": "Semicircular bumps along the spine: one side for the forward edge and forward line, alternating for the line of contact. `scallopLineFamily`.",
  "Drawn areas": "A ring of however many points the ground needs, with a label block held as a fraction of the ring's extent so it travels with the area. `areaFamily`.",
  "Obstacle rows": "A line with something repeated along it — ticks, crosses, teeth, posts. `tickRowFamily`.",
  "Range fans": "Concentric range rings about a position, whole or cut to a sector. `rangeFanFamily`.",
  "Axis of advance and attack graphics": "The pre-existing spine-based arrows. `spineCoherence.test.ts` guards them; see the notch history in `HANDOVER.md` for why.",
  "Circle-task graphics": "The pre-existing task circles with a gap and an arrowhead — Retain, Contain, Isolate, Occupy, Secure, Seize and their neighbours.",
  "Two-anchor graphics": "Older symbols parameterised by two named points rather than a spine.",
  "Bespoke geometry": "Params named for the symbol's own shape rather than a family's. `svg-support-by-fire-position` is the known case where the catalog and the publication's draw rules disagree — see `HANDOVER.md`.",
};

for (const family of FAMILY_ORDER) {
  const list = byFamily.get(family);
  if (!list) { continue; }
  list.sort((a, b) => a.title.localeCompare(b.title));
  out(`## ${family} — ${list.length}`);
  out();
  if (FAMILY_NOTES[family]) {
    out(FAMILY_NOTES[family]);
    out();
  }
  out("| Symbol | Title | Reference | Anchor | Handles | Label | Task |");
  out("|---|---|---|---|---|---|---|");
  for (const r of list) {
    out(`| \`${r.name}\` | ${r.title}${r.dashed ? " _(dashed)_" : ""} | ${r.refs.join(", ") || "—"} | ${r.anchor} | ${r.handles} | ${r.label} | ${r.task ? `\`${r.task}\`` : "—"} |`);
  }
  out();
}

out("## Not implemented");
out();
out("The rows of the extract with no symbol behind them, by the triage in");
out("`reference/control-measures/COVERAGE.md`. The counts are the honest state of");
out("the reference, not a backlog estimate: a large share of what is left cannot");
out("be authored from these files at all, because the crop windows for those rows");
out("do not contain their artwork. `HANDOVER.md` has the detail and the test that");
out("established it.");
out();
out("| Treatment | Rows left | What that means |");
out("|---|---|---|");
const MEANING = {
  static: "One anchor, fixed shape. Mostly the maritime and air point graphics, whose crops are empty.",
  derived: "Two or more anchors determine the shape. Several are readable and worth doing.",
  variable: "Open-ended point list. Most of the readable ones are done; the rest carry patterns (mines, smoke) this extraction flattens away.",
  segment: "Multi-segment routes. Needs a family that routes through waypoints with a width.",
  review: "Rules missing or unusable. Some are duplicates of rows already authored; the geometry has to be read before anything else can be said.",
};
for (const [treatment, list] of [...missingByTreatment].sort((a, b) => b[1].length - a[1].length)) {
  out(`| \`${treatment}\` | ${list.length} | ${MEANING[treatment] ?? ""} |`);
}
out();
out(`### Doctrinal tasks still without a graphic — ${tasksWithout.length}`);
out();
out("`TACTIC_TASK_CATALOG` entries a caller can select but nothing can draw.");
out("Each needs a doctrinal source beyond this extraction.");
out();
for (const t of tasksWithout) {
  out(`- **${t.name}** (\`${t.id}\`, ${t.category})`);
}
out();

writeFileSync(OUT, lines.join("\n") + "\n");
console.log(`${OUT}: ${rows.length} symbols, ${byFamily.size} families, ${authored.size} reference rows, ${tasksWithout.length} tasks without a graphic`);
