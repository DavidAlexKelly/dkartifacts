/**
 * @acc/unit-symbol-picker/tables — the published symbology data, as tables.
 *
 * Generated from the JointMilSyML XML in ../schemas by
 * ../scripts/generate-tables.mjs. See that directory's README for what the
 * source is, and what it does and does not settle.
 *
 * A SEPARATE ENTRY POINT ON PURPOSE. The main entry is a SIDC parser: ten
 * fields and four functions. These tables are ~2000 icon rows, 628 modifiers
 * and ~1900 legacy mappings, and an app that only needs to parse and format
 * codes should not pay for them. Importing this is opting in.
 *
 *   import { LAND_UNIT, lookupLegacy } from "@acc/unit-symbol-picker/tables";
 *
 *   <UnitSymbolPicker icons={{ "10": LAND_UNIT.icons }} />
 *
 * The barrel re-exports every symbol set, so importing anything from here pulls
 * all 24 in. When one set is all that is wanted, import it directly and the
 * bundler will drop the rest:
 *
 *   import { LAND_UNIT } from "@acc/unit-symbol-picker/tables/landUnit";
 */

import type { SidcOption } from "./core/fields.js";
import { SYMBOL_SET_TABLES } from "./core/generated/symbolSets/index.js";
import type { IconOption, SymbolSetTable } from "./core/generated/types.js";

export type {
  AmplifierGroupTable,
  CodeOption,
  IconOption,
  LegacyEntry,
  SymbolSetTable,
} from "./core/generated/types.js";

// CONTEXTS, STATUSES and SYMBOL_SETS exist in ../core/fields too, hand-written
// and shorter. Both are legitimate — the hand lists are what the picker's
// dropdowns use and omit the "extension" codes a user cannot usefully pick —
// so the generated ones are renamed rather than shadowing them, and a consumer
// that wants the complete published list can say which it means.
export {
  AMPLIFIERS,
  AMPLIFIER_GROUPS,
  CONTEXTS as GENERATED_CONTEXTS,
  HQ_TF_DUMMIES,
  STANDARD_IDENTITIES,
  STATUSES as GENERATED_STATUSES,
  SYMBOL_SETS as GENERATED_SYMBOL_SETS,
  VERSION,
} from "./core/generated/base.js";

export { LEGACY_2525C, lookupLegacy } from "./core/generated/legacy.js";

export * from "./core/generated/symbolSets/index.js";

/**
 * The picker's `icons` prop, ready to pass.
 *
 * `only` narrows it to the symbol sets an application actually offers, which is
 * both a shorter dropdown and — if the caller imports those sets directly
 * instead of calling this — a smaller bundle.
 *
 * The hierarchy comes through intact, `path` and all, because that is what the
 * picker renders as one control per level. Abstract rows are kept for the same
 * reason: "Movement and Maneuver" draws nothing of its own, but it is the only
 * way to reach Infantry, and dropping it would take the branch with it. The
 * picker marks them and says plainly that they have no symbol.
 *
 * For a flat list — a search box, a plain `<select>`, a report — use
 * `pickerIconsWithPaths`, which joins the hierarchy into the label and leaves
 * the categories out.
 */
export function pickerIcons(
  only?: string[],
): Record<string, IconOption[]> {
  const out: Record<string, IconOption[]> = {};
  for (const code of only ?? Object.keys(SYMBOL_SET_TABLES)) {
    const table = SYMBOL_SET_TABLES[code];
    if (!table) {
      continue;
    }
    out[code] = table.icons;
  }
  return out;
}

/**
 * The same, labelled with the full hierarchy — "Command and Control : Signal :
 * Radio" rather than "Radio".
 *
 * A flat dropdown of leaf labels has several entries called "Radio" and no way
 * to tell them apart. Either use this, or build a cascading control from
 * `IconOption.path`: the leaf label alone only works inside a hierarchy the
 * user can already see.
 */
export function pickerIconsWithPaths(
  only?: string[],
  separator = " : ",
): Record<string, SidcOption[]> {
  const out: Record<string, SidcOption[]> = {};
  for (const code of only ?? Object.keys(SYMBOL_SET_TABLES)) {
    const table = SYMBOL_SET_TABLES[code];
    if (!table) {
      continue;
    }
    out[code] = table.icons
      .filter((icon) => icon.abstract !== true)
      .map((icon) => ({ code: icon.code, label: icon.path.join(separator) }));
  }
  return out;
}

/**
 * One symbol set's icons grouped by their top-level entity — the shape a
 * cascading or grouped control wants, without every caller re-deriving it.
 */
export function iconTree(
  table: SymbolSetTable,
): Array<{ label: string; icons: IconOption[] }> {
  const groups = new Map<string, IconOption[]>();
  for (const icon of table.icons) {
    const top = icon.path[0] ?? "";
    const bucket = groups.get(top);
    if (bucket) {
      bucket.push(icon);
    } else {
      groups.set(top, [icon]);
    }
  }
  return [...groups.entries()].map(([label, icons]) => ({ label, icons }));
}
