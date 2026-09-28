/**
 * The generated tables, checked for the things a generator can get wrong.
 *
 * Three kinds of assertion here, and the split matters:
 *
 *  - that the committed tables still match schemas/. That is one call to the
 *    generator's --check mode, and it is what stops the two drifting: edit the
 *    XML without regenerating, or hand-edit a generated file, and this fails
 *    with the file named.
 *  - that every row is structurally possible. These enumerate the tables rather
 *    than naming rows, so a new symbol set is covered the moment it is
 *    generated without the test being touched — the same instinct as
 *    catalogSanity in @acc/app6d.
 *  - spot checks against codes this repository already uses elsewhere, because
 *    "structurally possible" would also be true of a table that had every
 *    label attached to the wrong code.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { COMMON_LAND_ICONS, ECHELON_SYMBOL_SETS, SYMBOL_SETS } from "./fields";
import {
  AMPLIFIER_GROUPS,
  CONTEXTS,
  HQ_TF_DUMMIES,
  STANDARD_IDENTITIES,
  STATUSES,
  SYMBOL_SETS as PUBLISHED_SYMBOL_SETS,
  VERSION,
} from "./generated/base";
import { LEGACY_2525C, lookupLegacy } from "./generated/legacy";
import { LAND_UNIT, SYMBOL_SET_TABLES } from "./generated/symbolSets/index";
import { DEFAULT_SIDC, formatSidc, legacyToSidc } from "./sidc";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Symbol sets the picker offers that this release of the symbology data does
 * not contain.
 *
 * 27 (Dismounted Individual) is a real symbol set in the standard and is
 * absent from these files — there is no instance document and no SymbolSetRef
 * for it. Listing it here rather than dropping it from the picker keeps the
 * discrepancy visible: if the data is ever updated, this test fails and the
 * entry gets deleted, which is the only way a gap like this gets closed rather
 * than quietly inherited.
 */
const KNOWN_MISSING_SYMBOL_SETS = ["27"];

describe("generated tables track schemas/", () => {
  it("has not drifted from the XML they are generated from", () => {
    // execFileSync throws with the offending file names on a non-zero exit.
    const output = execFileSync(
      process.execPath,
      ["scripts/generate-tables.mjs", "--check"],
      { cwd: PACKAGE_ROOT, encoding: "utf8" },
    );
    expect(output).toContain("match schemas/");
  });
});

describe("field tables", () => {
  it("is the one version the standard defines", () => {
    expect(VERSION).toBe("10");
  });

  it("gives every single-digit field exactly one digit", () => {
    for (const option of [
      ...CONTEXTS,
      ...STANDARD_IDENTITIES,
      ...STATUSES,
      ...HQ_TF_DUMMIES,
    ]) {
      expect(option.code).toMatch(/^\d$/);
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps each amplifier inside its own group", () => {
    for (const group of AMPLIFIER_GROUPS) {
      expect(group.code).toMatch(/^\d$/);
      for (const amplifier of group.amplifiers) {
        // Digits 9-10 are group then value, so a flattened code must start with
        // its own group — otherwise a dropdown built from AMPLIFIERS sets digit
        // 9 to a group the value does not belong to.
        expect(amplifier.code).toMatch(/^\d\d$/);
        expect(amplifier.code[0]).toBe(group.code);
      }
    }
  });

  it("offers no symbol set the published data does not have, beyond the known gaps", () => {
    const published = new Set(PUBLISHED_SYMBOL_SETS.map((set) => set.code));
    const missing = SYMBOL_SETS.map((option) => option.code).filter(
      (code) => !published.has(code),
    );
    expect(missing.sort()).toEqual([...KNOWN_MISSING_SYMBOL_SETS].sort());
  });

  it("names only real symbol sets in the echelon decision", () => {
    const published = new Set(PUBLISHED_SYMBOL_SETS.map((set) => set.code));
    for (const code of ECHELON_SYMBOL_SETS) {
      const known = published.has(code) || KNOWN_MISSING_SYMBOL_SETS.includes(code);
      expect(known, `symbol set ${code}`).toBe(true);
    }
  });
});

describe("symbol set tables", () => {
  it("keys every table by its own code", () => {
    for (const [code, table] of Object.entries(SYMBOL_SET_TABLES)) {
      expect(table.code).toBe(code);
      expect(code).toMatch(/^\d\d$/);
      expect(table.id).toMatch(/^SS_/);
    }
  });

  it("gives every icon a six-digit code and a path ending in its label", () => {
    for (const table of Object.values(SYMBOL_SET_TABLES)) {
      for (const icon of table.icons) {
        expect(icon.code, `${table.id} ${icon.label}`).toMatch(/^\d{6}$/);
        expect(icon.path.length).toBeGreaterThan(0);
        expect(icon.path.length).toBeLessThanOrEqual(3);
        expect(icon.path[icon.path.length - 1]).toBe(icon.label);
      }
    }
  });

  it("nests icon codes under their parents", () => {
    // A three-level code must extend a two-level one which extends a one-level
    // one. This is what makes a cascading control possible, and a generator
    // that assembled the digits in the wrong order would break it here.
    for (const table of Object.values(SYMBOL_SET_TABLES)) {
      const codes = new Set(table.icons.map((icon) => icon.code));
      for (const icon of table.icons) {
        if (icon.path.length >= 2) {
          expect(codes, `${table.id} ${icon.code} parent`).toContain(
            `${icon.code.slice(0, 2)}0000`,
          );
        }
        if (icon.path.length === 3) {
          expect(codes, `${table.id} ${icon.code} grandparent`).toContain(
            `${icon.code.slice(0, 4)}00`,
          );
        }
      }
    }
  });

  it("gives every modifier two digits", () => {
    for (const table of Object.values(SYMBOL_SET_TABLES)) {
      for (const modifier of [...table.sectorOneModifiers, ...table.sectorTwoModifiers]) {
        expect(modifier.code, `${table.id} ${modifier.label}`).toMatch(/^\d\d$/);
      }
    }
  });

  it("keeps special entity subtypes out of the icon list", () => {
    for (const table of Object.values(SYMBOL_SET_TABLES)) {
      for (const special of table.specialEntitySubTypes) {
        // Two digits, not six: they apply to any entity, so they are a suffix
        // and not a code anything can be set to.
        expect(special.code).toMatch(/^\d\d$/);
        expect(table.icons.some((icon) => icon.code === special.code)).toBe(false);
      }
    }
  });

  it("produces a complete twenty-digit code for every icon it offers", () => {
    for (const table of Object.values(SYMBOL_SET_TABLES)) {
      for (const icon of table.icons) {
        const code = formatSidc({
          ...DEFAULT_SIDC,
          symbolSet: table.code,
          entity: icon.code,
        });
        expect(code, `${table.id} ${icon.code}`).toMatch(/^\d{20}$/);
        expect(code.slice(4, 6)).toBe(table.code);
        expect(code.slice(10, 16)).toBe(icon.code);
      }
    }
  });
});

describe("the 2525C legacy table", () => {
  it("keys every row the way a fifteen-character code presents itself", () => {
    for (const [key, entry] of Object.entries(LEGACY_2525C)) {
      // Coding scheme, battle dimension, then six function characters.
      expect(key, key).toMatch(/^..[A-Z0-9*-]{6}$/);
      expect(entry.symbolSet).toMatch(/^\d\d$/);
      expect(entry.entity).toMatch(/^\d{6}$/);
      expect(entry.modifier1 ?? "00").toMatch(/^\d\d$/);
      expect(entry.modifier2 ?? "00").toMatch(/^\d\d$/);
      expect(entry.legacy.length).toBeGreaterThan(0);
    }
  });

  it("resolves to an icon the symbol set actually has", () => {
    for (const entry of Object.values(LEGACY_2525C)) {
      const table = SYMBOL_SET_TABLES[entry.symbolSet];
      expect(table, `symbol set ${entry.symbolSet}`).toBeDefined();
      const codes = new Set(table.icons.map((icon) => icon.code));

      // A legacy row may resolve onto a SPECIAL entity subtype — the source
      // writes those "10xxxx95", meaning they attach to any entity/type — so
      // `130198` is Air Defense + "Theater/Echelons Above Corps Support" and is
      // a perfectly good code even though `icons` does not list it. Enumerating
      // that cross-product would be 11 entities x 140 types x 4 suffixes of
      // rows nobody asked for, so the icon list stays the published hierarchy
      // and this check follows the same rule: the first four digits must name a
      // real entity type, and the last two a real special subtype.
      const special = table.specialEntitySubTypes.some(
        (sub) => sub.code === entry.entity.slice(4, 6),
      );
      const found = special
        ? codes.has(`${entry.entity.slice(0, 4)}00`)
        : codes.has(entry.entity);

      expect(found, `${entry.legacy} -> ${entry.symbolSet}/${entry.entity}`).toBe(true);
    }
  });

  it("resolves to a modifier the symbol set actually has", () => {
    for (const entry of Object.values(LEGACY_2525C)) {
      const table = SYMBOL_SET_TABLES[entry.symbolSet];
      if (entry.modifier1) {
        expect(
          table.sectorOneModifiers.some((mod) => mod.code === entry.modifier1),
          `${entry.legacy} modifier1 ${entry.modifier1}`,
        ).toBe(true);
      }
      if (entry.modifier2) {
        expect(
          table.sectorTwoModifiers.some((mod) => mod.code === entry.modifier2),
          `${entry.legacy} modifier2 ${entry.modifier2}`,
        ).toBe(true);
      }
    }
  });

  it("converts the unit codes the mil harness ships", () => {
    // These are the SIDCs in src/mil/MilMapPage.tsx, the
    // closest thing this repository has to real data. Before the table existed
    // every one of them came back with its icon unconverted.
    const cases: Array<[string, string]> = [
      ["SFGPUCI-----D---", "121100"], // infantry
      ["SFGPUCIZ----E---", "121102"], // infantry, armoured/mechanised
      ["SFGPUCA-----E---", "120500"], // armour
      ["SFGPUCR-----C---", "121300"], // reconnaissance
      ["SFGPUCF-----D---", "130300"], // field artillery
      ["SFGPUCE-----D---", "140700"], // engineer
    ];
    for (const [legacy, entity] of cases) {
      const converted = legacyToSidc(legacy, undefined, lookupLegacy);
      expect(converted, legacy).toBeDefined();
      expect(converted?.sidc.symbolSet, legacy).toBe("10");
      expect(converted?.sidc.entity, legacy).toBe(entity);
      // Nothing approximated: the published row was found.
      expect(converted?.approximated, legacy).toEqual([]);
    }
  });

  it("reads the affiliation independently of the icon", () => {
    const hostile = legacyToSidc("SHGPUCA-----E---", undefined, lookupLegacy);
    expect(hostile?.sidc.identity).toBe("6");
    expect(hostile?.sidc.entity).toBe("120500");
  });

  it("still says what it could not convert when there is no row", () => {
    const converted = legacyToSidc("SFGPZZZZZZ--D---", undefined, lookupLegacy);
    expect(converted?.approximated.join(" ")).toContain("no published 2525C row");
  });

  it("says the icon was not converted at all when given no table", () => {
    // The pre-existing behaviour, unchanged: a caller who does not opt in to
    // the tables gets the same partial conversion and the same admission.
    const converted = legacyToSidc("SFGPUCI-----D---");
    expect(converted?.sidc.entity).toBe(DEFAULT_SIDC.entity);
    expect(converted?.approximated.join(" ")).toContain("pass a lookup table");
  });
});

describe("the hand-written starter icon list", () => {
  it("uses codes the published land-unit table has", () => {
    // The first version of COMMON_LAND_ICONS had three of its six labels
    // attached to the wrong code, and nothing about them looked wrong — which
    // is the whole argument for generating the table. So the starter list is
    // now checked against it rather than trusted.
    for (const option of COMMON_LAND_ICONS) {
      const published = LAND_UNIT.icons.find((icon) => icon.code === option.code);
      expect(published, `${option.code} (${option.label})`).toBeDefined();
    }
  });

  it("draws something for every entry", () => {
    // An abstract row is a legal code that renders an empty frame. A starter
    // list is exactly where that would go unnoticed.
    for (const option of COMMON_LAND_ICONS) {
      const published = LAND_UNIT.icons.find((icon) => icon.code === option.code);
      expect(published?.abstract, `${option.code} (${option.label})`).not.toBe(true);
    }
  });
});
