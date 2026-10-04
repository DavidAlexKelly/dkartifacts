#!/usr/bin/env node
/**
 * Build a countries dataset for @acc/decho-countries.
 *
 *   node scripts/build-data.mjs --out ./countries-data --world-bank
 *
 * then upload everything under ./countries-data to a Foundry dataset, keeping
 * the folder structure, and pass its RID to the package:
 *
 *   countries({ store: { kind: "dataset", datasetRid: "ri.foundry.main.dataset.…" } })
 *
 * Runs on a machine with internet access — it downloads its sources; the
 * dataset it writes is what the browser reads, with no internet needed then.
 *
 * OPTIONS
 *   --out <dir>        where to write the dataset files
 *   --scales <list>    Natural Earth scales, least detailed first.
 *                      Default 50m,10m: 1:50m from zoom 0, 1:10m from zoom 5.
 *   --views <list>     "all" (default): the de facto view plus every Natural
 *                      Earth point of view that draws borders differently;
 *                      "default": just the de facto view; or codes: US,IN,CN.
 *   --world-bank       replace Natural Earth's 2019 population and GDP with
 *                      the World Bank's latest, and add land area, total area
 *                      and GDP per person. Without it, total area is computed
 *                      from the outlines and the rest is Natural Earth's.
 *   --cache <dir>      keep downloads here and reuse them (default .ne-cache)
 *   --builtin <file>   instead of a dataset, write the package's built-in
 *                      world (1:110m, default view only) as a TS module.
 *
 * WHAT IT WRITES (with --out)
 *   manifest.json                 views, region schemes, sources
 *   countries.json                one record per country
 *   views/<view>/<scale>.geojson  outlines; views that draw identically share
 *                                 one folder
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  SOURCES,
  WORLD_BANK_INDICATORS,
  areaKm2,
  assignIds,
  assignmentFor,
  buildManifest,
  capitalsFrom,
  joinWorldBank,
  planViews,
  recordFrom,
  viewCollection,
} from "./lib.mjs";

const NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master";
const WB_BASE = "https://api.worldbank.org/v2";

/** Where each scale takes over, and how finely its coordinates are kept. */
const SCALES = {
  "110m": { minZoom: 0, decimals: 2 },
  "50m": { minZoom: 2.5, decimals: 3 },
  "10m": { minZoom: 5, decimals: 4 },
};

function parseArgs(argv) {
  const args = { scales: "50m,10m", views: "all", cache: ".ne-cache", worldBank: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) {throw new Error(`${flag} needs a value`);}
      return value;
    };
    if (flag === "--out") {args.out = next();}
    else if (flag === "--scales") {args.scales = next();}
    else if (flag === "--views") {args.views = next();}
    else if (flag === "--cache") {args.cache = next();}
    else if (flag === "--builtin") {args.builtin = next();}
    else if (flag === "--world-bank") {args.worldBank = true;}
    else if (flag === "--help" || flag === "-h") {args.help = true;}
    else {throw new Error(`unknown option ${flag}`);}
  }
  return args;
}

// ── Network and files ───────────────────────────────────────────────────────
//
// Every fetch and every file read or write goes through the four helpers
// below, and each checks what it is given: fetches only reach the two
// sources this script reads, and files only land inside the folder they were
// meant for. The code scan's rules for these (SSRF, non-literal fs paths)
// match on syntax, so the one line in each helper that makes the call is
// marked `nosemgrep` — `nosemgrep` must be the line immediately above it.

/** The only origins this script fetches from. */
const ALLOWED_ORIGINS = new Set([new URL(NE_BASE).origin, new URL(WB_BASE).origin]);

async function fetchAllowed(url) {
  const parsed = new URL(url);
  if (!ALLOWED_ORIGINS.has(parsed.origin)) {
    throw new Error(`refusing to fetch ${parsed.origin}: not one of this script's sources`);
  }
  // Origin checked against ALLOWED_ORIGINS just above; paths are built from constants.
  // nosemgrep
  return fetch(parsed);
}

/** `file` resolved against `base`, provided it stays inside `base`. */
function inside(base, file) {
  const root = path.resolve(base);
  const target = path.resolve(root, file);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`refusing to touch ${target}: it is outside ${root}`);
  }
  return target;
}

async function readText(base, file) {
  const target = inside(base, file);
  // Contained by inside() just above.
  // nosemgrep
  return fs.readFile(target, "utf8");
}

async function writeText(base, file, text) {
  const target = inside(base, file);
  // Contained by inside() just above.
  // nosemgrep
  await fs.mkdir(path.dirname(target), { recursive: true });
  // nosemgrep
  await fs.writeFile(target, text);
}

async function download(url, cacheDir, name) {
  try {
    return JSON.parse(await readText(cacheDir, name));
  } catch {
    // Not cached yet.
  }
  console.log(`  downloading ${url}`);
  const response = await fetchAllowed(url);
  if (!response.ok) {throw new Error(`${url}: HTTP ${response.status}`);}
  const text = await response.text();
  await writeText(cacheDir, name, text);
  return JSON.parse(text);
}

const naturalEarth = (cache, file) => download(`${NE_BASE}/geojson/${file}.geojson`, cache, `${file}.geojson`);

async function naturalEarthVersion() {
  try {
    const response = await fetchAllowed(`${NE_BASE}/VERSION`);
    return response.ok ? (await response.text()).trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Every page of a World Bank API list. */
async function worldBankList(url) {
  const rows = [];
  for (let page = 1; ; page++) {
    const response = await fetchAllowed(`${url}${url.includes("?") ? "&" : "?"}format=json&per_page=1000&page=${page}`);
    if (!response.ok) {throw new Error(`${url}: HTTP ${response.status}`);}
    const [meta, list] = await response.json();
    rows.push(...(list ?? []));
    if (!meta || page >= meta.pages) {return rows;}
  }
}

async function fetchWorldBank() {
  const indicators = {};
  for (const indicator of Object.keys(WORLD_BANK_INDICATORS)) {
    console.log(`  World Bank ${indicator}`);
    indicators[indicator] = await worldBankList(`${WB_BASE}/country/all/indicator/${indicator}?mrnev=1`);
  }
  console.log("  World Bank country list");
  const countries = await worldBankList(`${WB_BASE}/country`);
  return { indicators, countries };
}

/**
 * Records for every id any view or scale draws — the union, since a finer
 * scale has small territories a coarser one leaves out, and a view can create
 * an id (a disputed area no country owns) the default does not have.
 */
function buildRecords(scaleData, capitals) {
  const records = new Map();
  for (const { features, adm0ToId, views } of scaleData) {
    const bySovereignName = new Map(features.map((f) => [f.properties.ADMIN, adm0ToId.get(f.properties.ADM0_A3)]));
    const ownIds = new Set(adm0ToId.values());
    features.forEach((feature, index) => {
      const p = feature.properties;
      for (const view of views) {
        const id = view.assignment[index];
        if (records.has(id)) {continue;}
        // A feature counted under another country's id in this view only
        // lends its properties when that id has no feature of its own.
        if (id !== adm0ToId.get(p.ADM0_A3) && ownIds.has(id)) {continue;}
        records.set(id, recordFrom(p, id, { capital: capitals.get(id), sovereignId: bySovereignName.get(p.SOVEREIGNT) }));
      }
    });
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Total area from the most detailed default-view outlines, where nothing better is known. */
function addOutlineAreas(records, collection, scaleName) {
  const areas = new Map();
  for (const feature of collection.features) {
    areas.set(feature.properties.id, (areas.get(feature.properties.id) ?? 0) + areaKm2(feature.geometry));
  }
  for (const record of records) {
    const area = areas.get(record.id);
    if (area && !record.figures.totalAreaKm2) {
      record.figures.totalAreaKm2 = {
        value: Math.round(area),
        source: "Natural Earth",
        note: `computed from the 1:${scaleName} outline`,
      };
    }
  }
}

const writeJson = (base, file, value) => writeText(base, file, JSON.stringify(value));

async function buildBuiltin(args) {
  console.log("Building the built-in 1:110m world");
  const features = (await naturalEarth(args.cache, "ne_110m_admin_0_countries")).features;
  const adm0ToId = assignIds(features);
  const views = planViews(features, adm0ToId, "default");
  const places = (await naturalEarth(args.cache, "ne_50m_populated_places_simple")).features;
  const records = buildRecords([{ features, adm0ToId, views }], capitalsFrom(places, adm0ToId));
  const geometry = viewCollection(features, views[0].assignment, SCALES["110m"].decimals);
  // Areas from 1:50m: the 110m outlines are too coarse for a figure people read.
  const detailed = (await naturalEarth(args.cache, "ne_50m_admin_0_countries")).features;
  const detailedIds = assignIds(detailed);
  addOutlineAreas(records, viewCollection(detailed, assignmentFor(detailed, detailedIds, null), SCALES["50m"].decimals), "50m");
  const version = await naturalEarthVersion();
  const manifest = buildManifest({
    views,
    scales: [{ name: "110m", minZoom: 0 }],
    sources: [SOURCES.naturalEarth(version)],
    generatedAt: new Date().toISOString(),
  });
  const files = {
    "manifest.json": manifest,
    "countries.json": { countries: records },
    [manifest.views[0].files[0].path]: geometry,
  };
  // JSON.parse of one string: smaller and faster for engines to load than an
  // object literal, and it keeps TypeScript from inferring a type for every
  // coordinate.
  const body = [
    "/* eslint-disable */",
    "// GENERATED by scripts/build-data.mjs --builtin. Do not edit.",
    `// Natural Earth${version ? ` ${version}` : ""} (public domain), 1:110m countries, de facto view;`,
    "// figures as Natural Earth carries them (2019 estimates), areas from the 1:50m outlines.",
    "",
    "export const BUILTIN_FILES: Record<string, unknown> = JSON.parse(",
    `  ${JSON.stringify(JSON.stringify(files))},`,
    ");",
    "",
  ].join("\n");
  // Inside the folder it is run from: the package, via npm run build-builtin.
  await writeText(process.cwd(), args.builtin, body);
  console.log(`Wrote ${args.builtin}: ${records.length} countries, ${geometry.features.length} outlines, ${(body.length / 1024).toFixed(0)} KB`);
}

async function buildDataset(args) {
  const scaleNames = args.scales.split(",").map((s) => s.trim()).filter(Boolean);
  for (const name of scaleNames) {
    if (!SCALES[name]) {throw new Error(`unknown scale ${name}; use 110m, 50m or 10m`);}
  }
  const wanted = args.views === "all" || args.views === "default"
    ? args.views
    : args.views.split(",").map((code) => code.trim().toUpperCase());

  console.log("Reading Natural Earth");
  const scaleData = [];
  for (const name of scaleNames) {
    const features = (await naturalEarth(args.cache, `ne_${name}_admin_0_countries`)).features;
    const adm0ToId = assignIds(features);
    scaleData.push({ name, features, adm0ToId, views: planViews(features, adm0ToId, wanted) });
  }
  const places = (await naturalEarth(args.cache, "ne_50m_populated_places_simple")).features;
  const capitals = capitalsFrom(places, scaleData.at(-1).adm0ToId);
  const records = buildRecords(scaleData, capitals);

  const sources = [SOURCES.naturalEarth(await naturalEarthVersion())];
  if (args.worldBank) {
    console.log("Reading the World Bank");
    const unmatched = joinWorldBank(records, await fetchWorldBank());
    sources.push(SOURCES.worldBank(new Date().toISOString().slice(0, 10)));
    if (unmatched.length > 0) {
      console.warn(`  No World Bank figures for ${unmatched.length} sovereign countries: ${unmatched.join(", ")}`);
    }
  }

  console.log("Writing outlines");
  // The view list comes from the least detailed scale: every scale has the
  // same point-of-view fields, so the views agree, and the coarse scale is
  // the one every view has a file for.
  const views = scaleData[0].views;
  for (const { name, features, adm0ToId } of scaleData) {
    const written = new Set();
    for (const view of views) {
      if (written.has(view.fileKey)) {continue;}
      written.add(view.fileKey);
      // Re-assigned per scale: the views were planned on the coarsest scale,
      // and each scale has its own features.
      const assignment = assignmentFor(features, adm0ToId, view.id === "default" ? null : view.id.toUpperCase());
      const collection = viewCollection(features, assignment, SCALES[name].decimals);
      await writeJson(args.out, path.join("views", view.fileKey, `${name}.geojson`), collection);
      if (view.id === "default" && name === scaleNames.at(-1)) {addOutlineAreas(records, collection, name);}
    }
    console.log(`  ${name}: ${written.size} distinct outline sets for ${views.length} views`);
  }

  const manifest = buildManifest({
    views,
    scales: scaleNames.map((name) => ({ name, minZoom: SCALES[name].minZoom })),
    sources,
    generatedAt: new Date().toISOString(),
  });
  await writeJson(args.out, "manifest.json", manifest);
  await writeJson(args.out, "countries.json", { countries: records });
  console.log(`Wrote ${args.out}: ${records.length} countries, ${views.length} views (${views.map((v) => v.id).join(", ")})`);
  console.log("Upload the whole folder to a Foundry dataset, keeping its structure.");
}

const args = parseArgs(process.argv.slice(2));
if (args.help || (!args.out && !args.builtin)) {
  console.log("Usage: node scripts/build-data.mjs --out <dir> [--scales 50m,10m] [--views all|default|US,IN] [--world-bank] [--cache <dir>]");
  console.log("       node scripts/build-data.mjs --builtin <file.ts> [--cache <dir>]");
  process.exit(args.help ? 0 : 1);
}
try {
  await (args.builtin ? buildBuiltin(args) : buildDataset(args));
} catch (error) {
  console.error(`build-data: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
