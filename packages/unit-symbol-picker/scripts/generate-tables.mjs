#!/usr/bin/env node
/**
 * Turn the JointMilSyML XML in ../schemas into TypeScript the package imports.
 *
 *   node scripts/generate-tables.mjs           # or: npm run generate
 *   node scripts/generate-tables.mjs --check   # fail if the two have drifted
 *
 * WHY GENERATE RATHER THAN READ THE XML AT RUNTIME
 *
 * The XML ships in the tarball — it is the source of truth and it is small
 * enough not to care about. But a published library cannot dictate how a
 * consumer's bundler loads a non-JS file: `?raw` is a Vite-ism, readFileSync is
 * Node-only, fetch needs a URL the library cannot know and a network call this
 * estate's CSP would refuse, and DOMParser would make src/core browser-only
 * when its whole point is running anywhere. A generated .ts module is imported
 * by every bundler with no configuration at all, is parsed once at build rather
 * than on every page load, and can be tree-shaken.
 *
 * It is also smaller — 2 MB of XML becomes ~0.5 MB of TypeScript — because
 * this format spends ~50 bytes to say "11"
 * (<EntityCode><DigitOne>1</DigitOne><DigitTwo>1</DigitTwo></EntityCode>) and
 * because the graphic filenames, draw rules, label rules and search tags the
 * picker has no use for are dropped.
 *
 * WHAT IT WILL NOT DO
 *
 * Nothing here infers. Where the published data is ambiguous — see the
 * echelon/mobility note below — the generator emits what the data says and
 * reports the ambiguity, rather than resolving it quietly. The whole reason the
 * package has an `icons` prop instead of a built-in icon table is that a list
 * which looks authoritative and is wrong where nobody checks is worse than no
 * list, and generating one does not change that principle.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const SCHEMAS = join(PKG, "schemas");
const OUT = join(PKG, "src", "core", "generated");

/* ── A minimal XML reader ─────────────────────────────────────────────────────
 *
 * ~60 lines rather than a dependency. This is machine-generated, well-formed,
 * namespace-uniform XML with quoted attributes and no CDATA or mixed content,
 * so the general case is not needed. Adding an XML parser to devDependencies
 * for one build script would be the larger cost, and the parse is verified by
 * the coherence test over the output.
 */

const decodeEntities = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");

function parseAttributes(source) {
  const attrs = {};
  const pattern = /([A-Za-z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    attrs[match[1]] = decodeEntities(match[2] ?? match[3] ?? "");
  }
  return attrs;
}

/** The end of a tag, respecting quoted attribute values that may contain ">". */
function tagEnd(source, from) {
  let quote = null;
  for (let at = from + 1; at < source.length; at++) {
    const char = source[at];
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") {
      return at;
    }
  }
  return source.length;
}

function parseXml(source) {
  const text = source.replace(/^\uFEFF/, "");
  const root = { name: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  let at = 0;

  while (at < text.length) {
    const open = text.indexOf("<", at);
    if (open < 0) {
      break;
    }
    if (open > at) {
      stack[stack.length - 1].text += text.slice(at, open);
    }
    if (text.startsWith("<!--", open)) {
      at = text.indexOf("-->", open) + 3;
      continue;
    }
    if (text.startsWith("<?", open)) {
      at = text.indexOf("?>", open) + 2;
      continue;
    }
    if (text.startsWith("<!", open)) {
      at = text.indexOf(">", open) + 1;
      continue;
    }

    const close = tagEnd(text, open);
    const raw = text.slice(open + 1, close);
    at = close + 1;

    if (raw.startsWith("/")) {
      stack.pop();
      continue;
    }
    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const name = /^([^\s/>]+)/.exec(body)[1];
    const node = {
      name,
      attrs: parseAttributes(body.slice(name.length)),
      children: [],
      text: "",
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
  }
  return root.children[0];
}

const child = (node, name) => node?.children.find((c) => c.name === name);
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const textOf = (node) => (node ? node.text.trim() : "");

/**
 * A code, however this file happens to spell it.
 *
 * SingleDigitType is element text (<ContextCode>0</ContextCode>); DoubleDigitType
 * is a pair of child elements. Both appear, so both are handled here rather
 * than at each of the twenty call sites.
 */
function codeOf(node) {
  if (!node) {
    return "";
  }
  const one = child(node, "DigitOne");
  if (one) {
    return textOf(one) + textOf(child(node, "DigitTwo"));
  }
  return textOf(node);
}

/** The identifier, however this file happens to spell it: Status/HQTFDummy/
 * Amplifier use @Name where Context/StandardIdentity/Entity use @ID. */
const idOf = (node) => node.attrs.ID ?? node.attrs.Name ?? "";

const optionOf = (node, code) => {
  const option = { code, label: node.attrs.Label ?? idOf(node) };
  if (node.attrs.IsExtension === "true") {
    option.isExtension = true;
  }
  return option;
};

/* ── Emitting ─────────────────────────────────────────────────────────────── */

/**
 * Output is collected rather than written straight out, so that `--check` can
 * compare it against what is committed without needing a temp directory. That
 * is what makes "the tables match the schemas" a test rather than a promise.
 */
const emitted = new Map();
const emit = (relativePath, contents) => emitted.set(relativePath, contents);

const report = {
  symbolSets: 0,
  icons: 0,
  modifiers: 0,
  legacy: 0,
  legacyCollisions: [],
  legacySkipped: 0,
  nonStandardLegacyNames: new Set(),
};

function header(sources) {
  return `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: ${sources.map((s) => `schemas/${s}`).join(", ")}
 * Standard: MIL-STD-2525D / APP-6D, JointMilSyML (http://disa.mil/JointMilSyML.xsd)
 * Regenerate: npm run generate   (from packages/unit-symbol-picker)
 */
`;
}

/** JSON with unquoted keys where they are safe, so a diff is readable. */
function literal(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    // A label path is part of its row, so it stays on the row's line. Only
    // arrays of records get a line each — that is what makes a diff readable.
    if (value.every((v) => typeof v === "string")) {
      return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    const items = value.map((v) => `${pad}  ${literal(v, indent + 1)},`).join("\n");
    return `[\n${items}\n${pad}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    const inline = entries
      .map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${literal(v, indent)}`)
      .join(", ");
    return `{ ${inline} }`;
  }
  return JSON.stringify(value);
}

const camel = (fileName) =>
  basename(fileName, ".xml")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join("");

const constantName = (fileName) =>
  basename(fileName, ".xml").toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/* ── types.ts ─────────────────────────────────────────────────────────────── */

function writeTypes() {
  emit(
    "types.ts",
    `${header(["*.xml"])}
/**
 * The shapes the generated tables come in.
 *
 * \`CodeOption\` is deliberately assignable to \`SidcOption\` from ../fields —
 * same two required fields — so a generated list can be handed straight to the
 * picker's dropdowns without a mapping step.
 */

/** One value of one SIDC field. */
export interface CodeOption {
  code: string;
  label: string;
  /** Code 9 in most fields: "details specified by extension". */
  isExtension?: boolean;
}

/**
 * Digits 9-10, which the standard splits: digit 9 selects the group (echelon at
 * brigade and below, echelon at division and above, equipment mobility on
 * land, naval towed array, …) and digit 10 the value within it.
 */
export interface AmplifierGroupTable extends CodeOption {
  /**
   * The symbol sets the published data states this group applies to.
   *
   * READ THE GENERATOR'S NOTE BEFORE TRUSTING THIS. In the shipped Base.xml it
   * is sparse to the point of being wrong — both echelon groups claim only
   * SS_AIR and the mobility groups claim nothing — so it is passed through as
   * evidence, not used to decide which meaning digits 9-10 carry.
   */
  compatibleSymbolSetIds: string[];
  /** Values within the group. Their \`code\` is the full two digits. */
  amplifiers: CodeOption[];
}

/** Digits 11-16: the icon itself, as a three-level hierarchy. */
export interface IconOption extends CodeOption {
  /** Entity, entity type, entity subtype labels — outermost first. */
  path: string[];
  /**
   * The row exists to give the hierarchy a parent and draws nothing of its own
   * (Icon="NA" in the source, usually with Remarks="Reserved for hierarchical
   * purposes"). Still a legal code; just not a symbol anyone means to pick.
   */
  abstract?: boolean;
}

export interface SymbolSetTable {
  /** Digits 5-6. */
  code: string;
  /** The JointMilSyML ID, e.g. "SS_LAND_UNIT" — what \`compatibleSymbolSetIds\` refers to. */
  id: string;
  label: string;
  /** Digits 11-16, flattened; \`path\` carries the hierarchy. */
  icons: IconOption[];
  /** Digits 17-18. */
  sectorOneModifiers: CodeOption[];
  /** Digits 19-20. */
  sectorTwoModifiers: CodeOption[];
  /**
   * Subtypes the set applies to ANY entity/type — the source writes them
   * "10xxxx95". Their \`code\` is the last two digits only, so they are not
   * standalone icons and are kept out of \`icons\` rather than emitted as codes
   * that look complete and are not.
   */
  specialEntitySubTypes: CodeOption[];
}

/** What a legacy 2525C function code resolves to in the modern form. */
export interface LegacyEntry {
  /** Digits 5-6. */
  symbolSet: string;
  /** Digits 11-16. */
  entity: string;
  /** Digits 17-18, when the legacy symbol names a sector-one modifier. */
  modifier1?: string;
  /** Digits 19-20. */
  modifier2?: string;
  /** The legacy pattern this came from, e.g. "S*GPUUSR--*****". Kept for traceability. */
  legacy: string;
}
`,
  );
}

/* ── base.ts ──────────────────────────────────────────────────────────────── */

function writeBase(symbolSetIndex) {
  const library = parseXml(readFileSync(join(SCHEMAS, "Base.xml"), "utf8"));

  const version = codeOf(child(kids(child(library, "Versions"), "Version")[0], "VersionCode"));

  const contexts = kids(child(library, "Contexts"), "Context").map((node) =>
    optionOf(node, codeOf(child(node, "ContextCode"))),
  );
  const identities = kids(child(library, "StandardIdentities"), "StandardIdentity").map((node) =>
    optionOf(node, codeOf(child(node, "StandardIdentityCode"))),
  );
  const statuses = kids(child(library, "Statuses"), "Status").map((node) =>
    optionOf(node, codeOf(child(node, "StatusCode"))),
  );
  const hqTfDummies = kids(child(library, "HQTFDummies"), "HQTFDummy").map((node) =>
    optionOf(node, codeOf(child(node, "HQTFDummyCode"))),
  );

  const amplifierGroups = kids(child(library, "AmplifierGroups"), "AmplifierGroup").map((group) => {
    const groupCode = codeOf(child(group, "AmplifierGroupCode"));
    return {
      ...optionOf(group, groupCode),
      compatibleSymbolSetIds: (group.attrs.CompatibleSymbolSetIDs ?? "")
        .split(/\s+/)
        .filter(Boolean),
      amplifiers: kids(child(group, "Amplifiers"), "Amplifier").map((amp) =>
        optionOf(amp, groupCode + codeOf(child(amp, "AmplifierCode"))),
      ),
    };
  });

  // Dimensions give each symbol set a home and a label; the two-digit code
  // lives in the referenced instance file, which we have already read.
  const symbolSets = [];
  const seen = new Set();
  for (const dimension of kids(child(library, "Dimensions"), "Dimension")) {
    for (const ref of kids(child(dimension, "SymbolSets"), "SymbolSetRef")) {
      const id = ref.attrs.ID;
      if (seen.has(id)) {
        continue; // SS_CYBERSPACE is listed under four dimensions.
      }
      seen.add(id);
      const table = symbolSetIndex.get(id);
      symbolSets.push({
        code: table ? table.code : codeOf(child(ref, "SymbolSetCode")),
        id,
        label: ref.attrs.Label ?? id,
        dimension: dimension.attrs.Label ?? dimension.attrs.ID,
      });
    }
  }
  symbolSets.sort((a, b) => a.code.localeCompare(b.code));

  emit(
    "base.ts",
    `${header(["Base.xml"])}
import type { AmplifierGroupTable, CodeOption } from "./types.js";

/** The one version the standard defines. Digits 1-2. */
export const VERSION = ${JSON.stringify(version)};

/** Digit 3. */
export const CONTEXTS: CodeOption[] = ${literal(contexts)};

/** Digit 4. */
export const STANDARD_IDENTITIES: CodeOption[] = ${literal(identities)};

/** Digit 7. */
export const STATUSES: CodeOption[] = ${literal(statuses)};

/** Digit 8. */
export const HQ_TF_DUMMIES: CodeOption[] = ${literal(hqTfDummies)};

/**
 * Digits 9-10, by group.
 *
 * The standard does not have one flat list here: digit 9 chooses between
 * echelon, equipment mobility and naval towed array, and digit 10 is the value
 * within that. Which group applies to which symbol set is NOT reliably stated
 * in the published data — see \`compatibleSymbolSetIds\`.
 */
export const AMPLIFIER_GROUPS: AmplifierGroupTable[] = ${literal(amplifierGroups)};

/** Every amplifier as a flat two-digit list, for a single dropdown. */
export const AMPLIFIERS: CodeOption[] = AMPLIFIER_GROUPS.flatMap((group) => group.amplifiers);

/** Digits 5-6, with the dimension each belongs to. */
export const SYMBOL_SETS: Array<CodeOption & { id: string; dimension: string }> = ${literal(symbolSets)};
`,
  );
}

/* ── symbolSets/*.ts ──────────────────────────────────────────────────────── */

/** Read one symbol-set file into a table plus the id→code maps legacy needs. */
function readSymbolSet(fileName) {
  const set = parseXml(readFileSync(join(SCHEMAS, fileName), "utf8"));
  const code = codeOf(child(set, "SymbolSetCode"));

  const icons = [];
  const entityCodes = new Map();
  const typeCodes = new Map();
  const subTypeCodes = new Map();

  const push = (node, entityCode, path) => {
    const option = optionOf(node, entityCode);
    option.path = path;
    if (node.attrs.Icon === "NA") {
      option.abstract = true;
    }
    icons.push(option);
  };

  for (const entity of kids(child(set, "Entities"), "Entity")) {
    const entityCode = codeOf(child(entity, "EntityCode"));
    entityCodes.set(idOf(entity), entityCode);
    const entityLabel = entity.attrs.Label ?? idOf(entity);
    push(entity, `${entityCode}0000`, [entityLabel]);

    for (const type of kids(child(entity, "EntityTypes"), "EntityType")) {
      const typeCode = codeOf(child(type, "EntityTypeCode"));
      typeCodes.set(idOf(type), typeCode);
      const typeLabel = type.attrs.Label ?? idOf(type);
      push(type, `${entityCode}${typeCode}00`, [entityLabel, typeLabel]);

      for (const sub of kids(child(type, "EntitySubTypes"), "EntitySubType")) {
        const subCode = codeOf(child(sub, "EntitySubTypeCode"));
        subTypeCodes.set(idOf(sub), subCode);
        push(sub, `${entityCode}${typeCode}${subCode}`, [
          entityLabel,
          typeLabel,
          sub.attrs.Label ?? idOf(sub),
        ]);
      }
    }
  }

  // Applicable to any entity/type, so not an icon in their own right.
  const specialEntitySubTypes = kids(
    child(set, "SpecialEntitySubTypes"),
    "EntitySubType",
  ).map((sub) => {
    const subCode = codeOf(child(sub, "EntitySubTypeCode"));
    subTypeCodes.set(idOf(sub), subCode);
    return optionOf(sub, subCode);
  });

  const modifiers = (sector) => {
    const codes = new Map();
    const list = kids(child(set, sector), "Modifier").map((mod) => {
      const modCode = codeOf(child(mod, "ModifierCode"));
      codes.set(idOf(mod), modCode);
      return optionOf(mod, modCode);
    });
    return { list, codes };
  };
  const one = modifiers("SectorOneModifiers");
  const two = modifiers("SectorTwoModifiers");

  report.symbolSets += 1;
  report.icons += icons.length;
  report.modifiers += one.list.length + two.list.length;

  return {
    table: {
      code,
      id: idOf(set),
      label: set.attrs.Label ?? idOf(set),
      icons,
      sectorOneModifiers: one.list,
      sectorTwoModifiers: two.list,
      specialEntitySubTypes,
    },
    legacySymbols: kids(child(set, "LegacySymbols"), "LegacySymbol"),
    lookup: {
      entityCodes,
      typeCodes,
      subTypeCodes,
      modifierOne: one.codes,
      modifierTwo: two.codes,
    },
  };
}

function writeSymbolSet(fileName, table) {
  emit(
    `symbolSets/${camel(fileName)}.ts`,
    `${header([fileName])}
import type { SymbolSetTable } from "../types.js";

export const ${constantName(fileName)}: SymbolSetTable = {
  code: ${JSON.stringify(table.code)},
  id: ${JSON.stringify(table.id)},
  label: ${JSON.stringify(table.label)},
  icons: ${literal(table.icons, 1)},
  sectorOneModifiers: ${literal(table.sectorOneModifiers, 1)},
  sectorTwoModifiers: ${literal(table.sectorTwoModifiers, 1)},
  specialEntitySubTypes: ${literal(table.specialEntitySubTypes, 1)},
};
`,
  );
}

function writeSymbolSetIndex(files) {
  const imports = files
    .map((f) => `import { ${constantName(f)} } from "./${camel(f)}.js";`)
    .join("\n");
  const entries = files
    .map((f) => `  ${constantName(f)},`)
    .join("\n");
  const byCode = files
    .map((f) => `  [${constantName(f)}.code]: ${constantName(f)},`)
    .join("\n");

  emit(
    "symbolSets/index.ts",
    `${header(["*.xml"])}
import type { SymbolSetTable } from "../types.js";
${imports}

export {
${entries}
};

/**
 * Every symbol set by its two-digit code.
 *
 * Importing this barrel pulls in all of them. Import the individual module when
 * one set is all that is wanted — a picker for land units has no use for
 * oceanographic features, and this is the seam that lets it not pay for them.
 */
export const SYMBOL_SET_TABLES: Record<string, SymbolSetTable> = {
${byCode}
};
`,
  );
}

/* ── legacy.ts ────────────────────────────────────────────────────────────── */

/**
 * The 2525C → 2525D icon mapping, which is a published table and not a
 * formula. This is the reason `legacyToSidc` could only ever convert the
 * affiliation, dimension and status before: the rows were not available.
 *
 * Every row states its own coding scheme and battle dimension — the legacy
 * pattern in @Label, overridden per function code by @SchemaOverride and
 * @DimensionOverride — so the key is exactly what a 15-character code carries
 * at positions 1, 3 and 5-10. Deriving the dimension from Base.xml's
 * <Dimensions> instead would be guesswork: dimension "G" maps to three
 * different symbol sets depending on the first function letter.
 */
function buildLegacy(sources) {
  const map = {};
  for (const { fileName, table, legacySymbols, lookup } of sources) {
    for (const symbol of legacySymbols) {
      if (symbol.attrs.IsDuplicate === "true") {
        continue;
      }
      const entityId = symbol.attrs.EntityID;
      if (!entityId || !lookup.entityCodes.has(entityId)) {
        // Retired rows carry artwork and no modern entity. There is nothing to
        // convert to, and inventing one is the failure this table exists to
        // avoid.
        report.legacySkipped += 1;
        continue;
      }
      const pattern = symbol.attrs.Label ?? "";
      const entity =
        lookup.entityCodes.get(entityId) +
        (lookup.typeCodes.get(symbol.attrs.EntityTypeID) ?? "00") +
        (lookup.subTypeCodes.get(symbol.attrs.EntitySubTypeID) ?? "00");

      for (const fn of kids(symbol, "LegacyFunctionCode")) {
        const names = (fn.attrs.Name ?? "").split(/\s+/).filter(Boolean);
        if (!names.some((name) => name.toUpperCase().startsWith("2525C"))) {
          names.forEach((name) => report.nonStandardLegacyNames.add(name));
          continue;
        }
        const scheme = fn.attrs.SchemaOverride ?? pattern[0] ?? "S";
        const dimension = fn.attrs.DimensionOverride ?? pattern[2] ?? "-";
        const functionId = textOf(fn).toUpperCase();
        if (functionId.length === 0) {
          continue;
        }
        const key = `${scheme}${dimension}${functionId}`.toUpperCase();
        const entry = {
          symbolSet: table.code,
          entity,
          modifier1: lookup.modifierOne.get(symbol.attrs.ModifierOneID),
          modifier2: lookup.modifierTwo.get(symbol.attrs.ModifierTwoID),
          legacy: pattern,
        };
        if (map[key] && map[key].entity !== entry.entity) {
          report.legacyCollisions.push(`${key} (${fileName}: ${map[key].entity} vs ${entry.entity})`);
          continue; // First wins, deterministically: files are read in sorted order.
        }
        map[key] = entry;
      }
    }
  }
  report.legacy = Object.keys(map).length;
  return map;
}

function writeLegacy(map) {
  const rows = Object.keys(map)
    .sort()
    .map((key) => `  ${JSON.stringify(key)}: ${literal(map[key])},`)
    .join("\n");

  emit(
    "legacy.ts",
    `${header(["*.xml (LegacySymbols)"])}
import type { LegacyEntry } from "./types.js";

/**
 * 2525C / APP-6B function codes to their modern equivalent.
 *
 * Keyed by coding scheme + battle dimension + function id — positions 1, 3 and
 * 5-10 of a 15-character legacy code, with each row's own SchemaOverride and
 * DimensionOverride applied. Position 2 (affiliation) and 4 (status) convert
 * arithmetically and are not part of the key.
 *
 * Rows whose legacy symbol has no modern entity (retired symbols, which the
 * source carries for rendering only) are absent rather than approximated.
 */
export const LEGACY_2525C: Record<string, LegacyEntry> = {
${rows}
};

/** Look one up the way a 15-character code presents itself. */
export function lookupLegacy(
  scheme: string,
  dimension: string,
  functionId: string,
): LegacyEntry | undefined {
  return LEGACY_2525C[\`\${scheme}\${dimension}\${functionId}\`.toUpperCase()];
}
`,
  );
}

/* ── Run ──────────────────────────────────────────────────────────────────── */

const files = readdirSync(SCHEMAS)
  .filter((f) => f.endsWith(".xml") && f !== "Base.xml")
  .sort();

writeTypes();

const sources = files.map((fileName) => ({ fileName, ...readSymbolSet(fileName) }));
const byId = new Map(sources.map((s) => [s.table.id, s.table]));

for (const { fileName, table } of sources) {
  writeSymbolSet(fileName, table);
}
writeSymbolSetIndex(files);
writeBase(byId);
writeLegacy(buildLegacy(sources));

emit(
  "index.ts",
  `${header(["*.xml"])}
export * from "./types.js";
export * from "./base.js";
export * from "./legacy.js";
export * from "./symbolSets/index.js";
`,
);

// This is a build script, so the console report IS the output — how many rows
// were found, and every ambiguity that was not resolved. (No eslint-disable
// needed: the root config scopes no-console to src/** and packages/*/src/**,
// and scripts/ is neither.)

const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  // Compare rather than write, so the drift between schemas/ and the committed
  // tables is a test failure with a named file in it, not a surprise weeks later.
  const drifted = [];
  const onDisk = new Set();
  const walk = (dir, prefix = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      } else {
        onDisk.add(prefix + entry.name);
      }
    }
  };
  try {
    walk(OUT);
  } catch {
    drifted.push("src/core/generated does not exist — run: npm run generate");
  }
  for (const [relativePath, contents] of emitted) {
    onDisk.delete(relativePath);
    let existing = null;
    try {
      existing = readFileSync(join(OUT, relativePath), "utf8");
    } catch {
      drifted.push(`${relativePath} is missing`);
      continue;
    }
    if (existing !== contents) {
      drifted.push(`${relativePath} differs from the schemas`);
    }
  }
  for (const stale of onDisk) {
    drifted.push(`${stale} is not produced by the generator any more`);
  }
  if (drifted.length > 0) {
    console.error(
      `unit-sidc: generated tables are out of date. Run "npm run generate".\n  ${drifted.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(`unit-sidc: ${emitted.size} generated files match schemas/`);
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [relativePath, contents] of emitted) {
    const target = join(OUT, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  console.log(`unit-sidc: ${report.symbolSets} symbol sets`);
  console.log(`unit-sidc: ${report.icons} icons, ${report.modifiers} modifiers`);
  console.log(
    `unit-sidc: ${report.legacy} legacy codes mapped, ${report.legacySkipped} skipped (no modern entity)`,
  );
  if (report.legacyCollisions.length > 0) {
    console.log(
      `unit-sidc: ${report.legacyCollisions.length} legacy key collisions, first kept:\n  ${report.legacyCollisions.join("\n  ")}`,
    );
  }
  if (report.nonStandardLegacyNames.size > 0) {
    console.log(
      `unit-sidc: legacy codes ignored for other standards: ${[...report.nonStandardLegacyNames].join(", ")}`,
    );
  }
}
