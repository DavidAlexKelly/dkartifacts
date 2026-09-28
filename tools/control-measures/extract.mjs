#!/usr/bin/env node
/**
 * Turn the APP-6D control-measure extracts into something authorable.
 *
 * Input, per folder in reference/control-measures/<id>/:
 *
 *   CONTROL MEASURE.txt   the name, sometimes with the doctrinal definition
 *   DRAW RULES.txt        anchor points / size-shape / orientation (240 of 346)
 *   TEMPLATE.svg          a CROPPED PDF PAGE, not symbol artwork
 *   EXAMPLE.svg           the same, with the example rendering
 *
 * The SVGs are the awkward part. Each is a page region from the publication:
 * ~360 glyph outlines in <defs>, ~1000 <use> elements drawing the page's text,
 * and ~136 inline paths that are a mix of table rules and the symbol itself,
 * all in flipped PDF coordinates. So "read the template" means: flatten the
 * transform, keep what falls inside the viewBox, discard the page furniture,
 * and normalise what is left into the library's own 0-2048 parameter box.
 *
 * Output:
 *   reference/control-measures/INDEX.json   machine-readable, one entry each
 *   reference/control-measures/COVERAGE.md  the triage table
 *
 * What this deliberately does NOT do is emit symbol definitions. An extracted
 * outline is not a parametric symbol: the library's value is geometry that
 * follows its anchors, and deciding which points are anchors and what derives
 * from them is the authoring judgement this report exists to inform.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "reference/control-measures";
const CATALOG_DIR = "packages/app6d/src/symbols/catalog/individual";
const PARAM_BOX = 2048;

// ── SVG geometry ────────────────────────────────────────────────────────────

/** matrix(a,b,c,d,e,f) applied to a point. */
const applyMatrix = (m, x, y) => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

/**
 * Every coordinate a path visits.
 *
 * A deliberately small subset of the `d` grammar: M/L/H/V/C/S/Q/T/Z, absolute
 * and relative. Anything else has its numbers consumed in pairs and its last
 * pair treated as the endpoint — approximate, but this only ever feeds bounding
 * boxes and a normalisation scale, never rendering.
 */
function pathPoints(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points = [];
  let x = 0;
  let y = 0;
  let i = 0;
  let cmd = "M";

  const num = () => Number(tokens[i++]);

  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) {
      cmd = tokens[i++];
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();

    if (upper === "H") {
      const nx = num();
      x = rel ? x + nx : nx;
    } else if (upper === "V") {
      const ny = num();
      y = rel ? y + ny : ny;
    } else if (upper === "Z") {
      // no coordinates
    } else {
      // M/L/T take one pair; C takes three; S/Q take two; A takes 7 with the
      // endpoint last. Consume pairs and keep every one for the bounding box.
      const pairs = upper === "C" ? 3 : upper === "S" || upper === "Q" ? 2 : upper === "A" ? 4 : 1;
      let lastX = x;
      let lastY = y;
      for (let p = 0; p < pairs && i + 1 < tokens.length + 1; p++) {
        if (upper === "A" && p === 0) {
          num(); num(); num(); num(); num(); // rx ry rot large sweep
        }
        const px = num();
        const py = num();
        lastX = rel ? x + px : px;
        lastY = rel ? y + py : py;
        points.push({ x: lastX, y: lastY });
      }
      x = lastX;
      y = lastY;
      if (upper === "M") {
        cmd = rel ? "l" : "L";
      }
    }
    points.push({ x, y });
  }
  return points;
}

const bboxOf = (points) => ({
  minX: Math.min(...points.map((p) => p.x)),
  minY: Math.min(...points.map((p) => p.y)),
  maxX: Math.max(...points.map((p) => p.x)),
  maxY: Math.max(...points.map((p) => p.y)),
});

/**
 * The symbol's own geometry, normalised into the parameter box.
 *
 * Page furniture is rejected by extent rather than by guessing at semantics: a
 * table rule spans the page, so anything wider or taller than the crop window
 * is not the symbol. What survives is scaled uniformly (aspect preserved —
 * squashing a symbol to fill a box would be worse than useless) and centred.
 */
function extractOutline(svg) {
  const viewBox = svg.match(/viewBox="([^"]+)"/);
  if (!viewBox) {
    return { error: "no viewBox" };
  }
  const [vx, vy, vw, vh] = viewBox[1].trim().split(/\s+/).map(Number);

  const body = svg.slice(svg.indexOf("</defs>") + 7);
  const kept = [];
  let rejectedOutside = 0;
  let rejectedFurniture = 0;

  for (const tag of body.match(/<path[^>]*>/g) ?? []) {
    const d = tag.match(/\sd="([^"]+)"/)?.[1];
    if (!d) {
      continue;
    }
    const m = tag.match(/transform="matrix\(([^)]+)\)"/);
    const matrix = m ? m[1].split(",").map(Number) : [1, 0, 0, 1, 0, 0];

    const points = pathPoints(d).map((p) => applyMatrix(matrix, p.x, p.y));
    if (points.length === 0) {
      continue;
    }
    const box = bboxOf(points);

    if (box.maxX - box.minX > vw || box.maxY - box.minY > vh) {
      rejectedFurniture++;
      continue;
    }
    if (box.maxX < vx || box.minX > vx + vw || box.maxY < vy || box.minY > vy + vh) {
      rejectedOutside++;
      continue;
    }
    kept.push({ d, points, box });
  }

  if (kept.length === 0) {
    return { error: "no geometry inside the crop", rejectedOutside, rejectedFurniture };
  }

  // Normalise from the symbol, not from the page it was printed on.
  //
  // Half these crops caught a table cell, whose borders are hairline rules
  // several times longer than anything the symbol draws. Scaling to include
  // them shrinks the symbol into a corner of the parameter box and moves its
  // centre off, which is exactly the geometry an author then measures
  // proportions from. The rules are still emitted — dropping geometry on a
  // heuristic would be worse — they just no longer set the scale.
  const isRule = (box) => {
    const long = Math.max(box.maxX - box.minX, box.maxY - box.minY);
    const thin = Math.min(box.maxX - box.minX, box.maxY - box.minY);
    return long > Math.min(vw, vh) * 0.3 && thin < Math.max(vw, vh) * 0.015;
  };
  const symbol = kept.filter((k) => !isRule(k.box));
  const all = bboxOf((symbol.length > 0 ? symbol : kept).flatMap((k) => k.points));
  const span = Math.max(all.maxX - all.minX, all.maxY - all.minY) || 1;
  const scale = PARAM_BOX / span;
  const offsetX = (PARAM_BOX - (all.maxX - all.minX) * scale) / 2;
  const offsetY = (PARAM_BOX - (all.maxY - all.minY) * scale) / 2;

  return {
    subpaths: kept.length,
    rejectedOutside,
    rejectedFurniture,
    // Rounded: this is a reference for authoring by eye and for shape
    // comparison, not a rendering asset. Sub-unit precision is noise.
    points: kept.map((k) =>
      k.points.map((p) => [
        Math.round((p.x - all.minX) * scale + offsetX),
        Math.round((p.y - all.minY) * scale + offsetY),
      ]),
    ),
  };
}

// ── Draw rules ──────────────────────────────────────────────────────────────

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

/**
 * The three fields of a draw rule, as data.
 *
 * The text is OCR'd from the publication and its quality varies: some entries
 * are a couple of stray letters, some have Cyrillic substituted mid-word
 * ("sОРmОnt's"). Every field is therefore optional and "unknown" is a valid
 * answer — quietly defaulting would put invented anchors into the report.
 */
function parseRules(text) {
  if (!text) {
    return { present: false };
  }
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length < 25) {
    return { present: true, usable: false, raw: flat };
  }

  // The publication says this six ways, and the OCR adds a seventh:
  //   "requires four anchor points"          "requires one (1) anchor point"
  //   "requires at least three anchor points"  "requires at leaTst two points"
  //   "requires at least two points, points 1 and 2, to define"
  //   "requires N anchor points, where N is between 3 and 50"
  // `at least` and a variable N are not decoration — they are the difference
  // between a fixed shape and a polyline, so both are kept rather than
  // flattened into a number.
  const anchorMatch = flat.match(
    /requires?\s+(?:(at\s+lea[a-z]?st|a\s+minimum\s+of)\s+)?([A-Za-z0-9]+)\s*(?:\(\d+\)\s*)?(?:anchor\s*)?points?/i,
  );
  const rangeMatch = flat.match(/between\s+(\d+)\s+and\s+(\d+)/i);

  let anchors = null;
  let minimum = false;
  let variable = null;
  if (anchorMatch) {
    minimum = Boolean(anchorMatch[1]);
    const word = anchorMatch[2].toLowerCase();
    const parsed = WORD_NUMBERS[word] ?? (/^\d+$/.test(word) ? Number(word) : null);
    if (parsed !== null) {
      anchors = parsed;
    } else if (rangeMatch) {
      // "N anchor points, where N is between 3 and 50" — an area or a route.
      variable = { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
    }
  }

  // Some entries lost their "Anchor Points." header to the page crop and begin
  // mid-sentence. "centred over the desired location" with a static shape is
  // unambiguously a single-anchor symbol; infer it, and say that it was
  // inferred so the report can show its working.
  let inferred = false;
  if (anchors === null && variable === null && /cent(?:re|er)ed\s+over/i.test(flat)) {
    anchors = 1;
    inferred = true;
  }

  const sizeText = flat.match(/Size\/Shape\.?\s*([^]*?)(?:Orientation\.|$)/i)?.[1]?.trim() ?? "";
  const orientText = flat.match(/Orientation\.?\s*([^]*)$/i)?.[1]?.trim() ?? "";

  return {
    present: true,
    usable: true,
    anchors: Number.isFinite(anchors) ? anchors : null,
    anchorsInferred: inferred,
    anchorsAreMinimum: minimum,
    anchorRange: variable,
    segmented: /multiple segments/i.test(flat),
    sizeStatic: /^static\b/i.test(sizeText),
    sizeDerived: /determine|defines?|connect/i.test(sizeText),
    orientationFromAnchors: /anchor points?\s+(determine|define)|determined by the anchor/i.test(orientText),
    orientationUpright: /upright/i.test(orientText),
  };
}

// ── Triage ──────────────────────────────────────────────────────────────────

/**
 * Which of the two treatments a symbol wants.
 *
 *   static   one anchor, fixed shape — emit as fixed geometry with a single
 *            point handle and milxScale. Cheap, and correct for these: a
 *            control point does not stretch.
 *   derived  two or more anchors, or a shape the anchors determine — needs a
 *            parametric definition, because that is the whole difference
 *            between a symbol you can place and one you can command with.
 *   segment  a route of repeated segments — derived, and needs a family that
 *            does not exist yet.
 *   review   the rules are missing or unusable; anchors must come from you or
 *            from reading the geometry.
 */
function triage(rules, outline) {
  if (!rules.present || !rules.usable) {
    return "review";
  }
  if (rules.segmented) {
    return "segment";
  }
  // A variable or open-ended point count is a different shape of problem from
  // "four anchors": the geometry is a polyline or an area the user extends, so
  // it needs a family that takes an arbitrary point list rather than a fixed
  // set of named handles.
  if (rules.anchorRange || (rules.anchorsAreMinimum && (rules.anchors ?? 0) >= 3)) {
    return "variable";
  }
  if (rules.anchors === null) {
    return "review";
  }
  if (rules.anchors === 1 && !rules.sizeDerived) {
    return "static";
  }
  return "derived";
}

// ── Run ─────────────────────────────────────────────────────────────────────

const existingTitles = new Map();
for (const file of readdirSync(CATALOG_DIR)) {
  if (!file.endsWith(".ts") || file.endsWith(".test.ts")) {
    continue;
  }
  const src = readFileSync(join(CATALOG_DIR, file), "utf8");
  const title = src.match(/title:\s*['"]([^'"]+)['"]/)?.[1];
  if (title) {
    existingTitles.set(title.toLowerCase().replace(/\s*\([^)]*\)/g, "").trim(), file.replace(/\.ts$/, ""));
  }
}

/**
 * Which catalog symbol, if any, this entry has already been authored as.
 *
 * The publication wraps a measure's name and its definition into one column,
 * and the parser can only guess where one ends and the other begins — so half
 * these names arrive as "Checkpoint A predetermined point on the surface of
 * the earth used as a". An exact-title lookup therefore reports symbols as
 * missing that are sitting in the catalog, which is exactly the wrong error
 * for a report whose job is to say what is left to do.
 *
 * A leading-title match fixes that, but only on a word boundary: "Clear" must
 * not claim "Clearance Line", and a title has to be worth matching on — two
 * characters of prefix would match half the publication.
 */
function matchExistingSymbol(name) {
  const key = name.toLowerCase().replace(/\s+/g, " ").trim();
  const exact = existingTitles.get(key);
  if (exact) {
    return { file: exact, exact: true };
  }
  let best = null;
  for (const [title, file] of existingTitles) {
    if (title.length < 6 || !key.startsWith(title)) {
      continue;
    }
    const next = key[title.length];
    if (next !== undefined && next !== " ") {
      continue;
    }
    // Longest title wins: "Follow and Support" over "Follow and Assume".
    if (!best || title.length > best.title.length) {
      best = { title, file };
    }
  }
  // A prefix match is a lead, not a fact: "Axis of Advance for a Feint" leads
  // to `axis-notched` because the feint IS that graphic, dashed — and the
  // report should say which of the two kinds of match it found rather than
  // let a reader assume the row is done.
  return best ? { file: best.file, exact: false } : null;
}

const folders = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort((a, b) => Number(a) - Number(b));

const entries = [];
for (const id of folders) {
  const dir = join(ROOT, id);
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");

  const measure = read("CONTROL MEASURE.txt").trim();
  const lines = measure.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // The first lines are the name, wrapped by the publication's column width;
  // a sentence marks the start of the definition, so stop there.
  const nameLines = [];
  for (const line of lines) {
    if (/[.:]$|\(AJP|^Note:/.test(line) && nameLines.length > 0) {
      break;
    }
    nameLines.push(line);
    if (nameLines.join(" ").length > 60) {
      break;
    }
  }
  const name = nameLines.join(" ").replace(/\s+/g, " ").trim();

  const rules = parseRules(read("DRAW RULES.txt"));
  const outline = extractOutline(read("TEMPLATE.svg"));
  const treatment = triage(rules, outline);
  const existing = matchExistingSymbol(name);

  entries.push({
    id,
    name,
    definition: lines.slice(nameLines.length).join(" ").trim() || null,
    rules,
    treatment,
    existingSymbol: existing ? existing.file : null,
    existingSymbolMatch: existing ? (existing.exact ? "exact" : "prefix") : null,
    outline: outline.error
      ? { error: outline.error }
      : { subpaths: outline.subpaths, points: outline.points },
  });
}

writeFileSync(join(ROOT, "INDEX.json"), JSON.stringify(entries, null, 1));

const count = (fn) => entries.filter(fn).length;
const byTreatment = (t) => entries.filter((e) => e.treatment === t);

const report = `# Control measures — extraction and triage

Generated by \`tools/control-measures/extract.mjs\` from the ${entries.length}
folders in \`reference/control-measures/\`. Re-run it after adding or correcting
source folders; \`INDEX.json\` beside this file carries the machine-readable
form, including the normalised outline points.

## Coverage

| | Count |
|---|---|
| Symbols | ${entries.length} |
| With draw rules | ${count((e) => e.rules.present)} |
| Draw rules usable | ${count((e) => e.rules.usable)} |
| Geometry extracted | ${count((e) => !e.outline.error)} |
| Geometry extraction failed | ${count((e) => e.outline.error)} |
| Already in the catalog | ${count((e) => e.existingSymbol)} |

## Triage

| Treatment | Count | Meaning |
|---|---|---|
| \`static\` | ${byTreatment("static").length} | One anchor, fixed shape. Emit as fixed geometry + one point handle + milxScale. |
| \`derived\` | ${byTreatment("derived").length} | Two or more anchors, or a shape the anchors determine. Needs a parametric definition. |
| \`variable\` | ${byTreatment("variable").length} | An open-ended point list — a polyline or an area the user extends. Needs a family taking N points. |
| \`segment\` | ${byTreatment("segment").length} | Multi-segment route. Parametric, and needs a family that does not exist yet. |
| \`review\` | ${byTreatment("review").length} | Rules missing or unusable — anchors need a human or a read of the geometry. |

## Already in the catalog

These match an existing symbol by name. Worth checking the doctrine against
what is there rather than adding a second copy — \`svg-support-by-fire-position\`
is the known case where the two disagree.

A \`prefix\` match found the catalog title at the head of a name the publication
had run together with its definition. That covers the many rows whose name and
definition share a column, but it also catches near-relations — a feint is the
axis of advance graphic, dashed, not the same entry — so read those before
counting them as done.

${entries.filter((e) => e.existingSymbol).map((e) => `- **${e.name}** (#${e.id}) → \`${e.existingSymbol}\` (${e.existingSymbolMatch}), treatment \`${e.treatment}\`${e.rules.anchors ? `, ${e.rules.anchors} anchor point(s)` : ""}`).join("\n") || "_none_"}

## Needs review

${byTreatment("review").map((e) => `- #${e.id} **${e.name || "(no name parsed)"}** — ${!e.rules.present ? "no DRAW RULES file" : !e.rules.usable ? `unusable rules: \`${(e.rules.raw ?? "").slice(0, 40)}\`` : "anchor count not stated"}${e.outline.error ? `; geometry: ${e.outline.error}` : ""}`).join("\n") || "_none_"}

## Inferred anchors

Anchor counts these entries did not state outright. The rules had lost their
header to the page crop, and a shape "centred over the desired location" is a
single-anchor symbol — worth a glance before they are authored on that basis.

${entries.filter((e) => e.rules.anchorsInferred).map((e) => `- #${e.id} **${e.name}**`).join("\n") || "_none_"}

## Multi-segment routes

${byTreatment("segment").map((e) => `- #${e.id} **${e.name}**`).join("\n") || "_none_"}
`;

writeFileSync(join(ROOT, "COVERAGE.md"), report);

console.log(`symbols            ${entries.length}`);
console.log(`with rules         ${count((e) => e.rules.present)} (usable ${count((e) => e.rules.usable)})`);
console.log(`geometry extracted ${count((e) => !e.outline.error)} (failed ${count((e) => e.outline.error)})`);
console.log(`in catalog already ${count((e) => e.existingSymbol)}`);
for (const t of ["static", "derived", "variable", "segment", "review"]) {
  console.log(`${t.padEnd(18)} ${byTreatment(t).length}`);
}
