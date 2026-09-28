import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIDC,
  formatSidc,
  formatSidcGrouped,
  isCompleteSidc,
  legacyToSidc,
  parseLegacy,
  parseSidc,
  withField,
} from "./sidc";

describe("parseSidc", () => {
  it("reads the twenty digits into their named slots", () => {
    //             ver ctx id set st hq ech entity mod1 mod2
    const sidc = parseSidc("10" + "0" + "3" + "01" + "0" + "0" + "00" + "110000" + "00" + "00");
    expect(sidc.version).toBe("10");
    expect(sidc.context).toBe("0");
    expect(sidc.identity).toBe("3");
    expect(sidc.symbolSet).toBe("01");
    expect(sidc.status).toBe("0");
    expect(sidc.hqTfDummy).toBe("0");
    expect(sidc.echelon).toBe("00");
    expect(sidc.entity).toBe("110000");
    expect(sidc.modifier1).toBe("00");
    expect(sidc.modifier2).toBe("00");
  });

  it("ignores separators, so the grouped display form round-trips", () => {
    const grouped = formatSidcGrouped(DEFAULT_SIDC);
    expect(grouped).toBe("10-0-3-10-0-0-00-121100-00-00");
    expect(formatSidc(parseSidc(grouped))).toBe(formatSidc(DEFAULT_SIDC));
  });

  it("pads a partial code rather than refusing it", () => {
    // Someone typing left to right should watch the symbol build up, not stare
    // at an error until the twentieth digit lands.
    expect(formatSidc(parseSidc("100310"))).toHaveLength(20);
    expect(parseSidc("100310").symbolSet).toBe("10");
    expect(isCompleteSidc("100310")).toBe(false);
    expect(isCompleteSidc("10-0-3-10-0-0-00-121100-00-00")).toBe(true);
  });
});

describe("withField", () => {
  it("changes one field and leaves every other digit alone", () => {
    // The entire reason this module exists: string surgery in a component is
    // how a picker ends up rewriting the echelon when the user picks an
    // affiliation.
    const before = DEFAULT_SIDC;
    const after = withField(before, "identity", "6");
    expect(after.identity).toBe("6");
    for (const key of Object.keys(before) as Array<keyof typeof before>) {
      if (key !== "identity") {
        expect(after[key]).toBe(before[key]);
      }
    }
  });

  it("keeps each field the width of its slot", () => {
    expect(withField(DEFAULT_SIDC, "echelon", "8").echelon).toBe("08");
    expect(withField(DEFAULT_SIDC, "entity", "12").entity).toBe("000012");
    expect(withField(DEFAULT_SIDC, "identity", "36").identity).toBe("3");
    expect(formatSidc(withField(DEFAULT_SIDC, "echelon", "18"))).toHaveLength(20);
  });
});

describe("the legacy 15-character form", () => {
  it("reads the parts it can name", () => {
    const parts = parseLegacy("SFGPUCI-----D---")!;
    expect(parts.affiliation).toBe("F");
    expect(parts.dimension).toBe("G");
    expect(parts.status).toBe("P");
  });

  it("converts affiliation, dimension and status onto a modern base", () => {
    const { sidc } = legacyToSidc("SHGPUCI-----D---")!;
    expect(sidc.identity).toBe("6"); // hostile
    expect(sidc.symbolSet).toBe("10"); // ground → land unit
    expect(sidc.entity).toBe(DEFAULT_SIDC.entity); // untouched
  });

  it("says when it has approximated rather than converted", () => {
    // The 2525C function id maps to a modern entity through a published table
    // of thousands of rows, not a formula. Reporting that plainly beats
    // inventing an icon that looks plausible and means something else.
    //
    // The table now exists — see tables.test.ts, which drives the same codes
    // through it — but it is opt-in, and this is the no-table path: it says the
    // same thing it always did, and now also says where the table is.
    const ground = legacyToSidc("SFGPUCI-----D---")!;
    expect(ground.approximated).toContain(
      "main icon (2525C function id not converted — pass a lookup table)",
    );

    const space = legacyToSidc("SFPPUCI-----D---")!;
    expect(space.approximated).toContain("symbol set");
  });

  it("returns undefined for something that is not a legacy code", () => {
    expect(legacyToSidc("nope")).toBeUndefined();
    expect(parseLegacy("")).toBeUndefined();
  });
});
