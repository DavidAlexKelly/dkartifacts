/**
 * The cascade's logic, against the real land-unit table.
 *
 * Driven by the generated data rather than a fixture, because the thing worth
 * knowing is whether the published hierarchy narrows correctly — a hand-made
 * three-row tree would pass while the real one had a level nobody could reach.
 */

import { describe, expect, it } from "vitest";

import { COMMON_LAND_ICONS } from "./fields";
import { LAND_UNIT } from "./generated/symbolSets/index";
import { iconLevels, iconPath } from "./iconLevels";

const icons = LAND_UNIT.icons;
const labelsOf = (level: { options: Array<{ label: string }> }) =>
  level.options.map((option) => option.label);

describe("iconPath", () => {
  it("prefers the path the table carries", () => {
    const infantry = icons.find((icon) => icon.code === "121100")!;
    expect(iconPath(infantry)).toEqual([
      "Movement and Maneuver",
      "Infantry",
    ]);
  });

  it("falls back to splitting a joined label", () => {
    // What a consumer has if all they kept was the flat display form.
    expect(iconPath({ code: "121102", label: "A : B : C" })).toEqual(["A", "B", "C"]);
  });
});

describe("iconLevels", () => {
  it("offers the eleven top-level categories and nothing else at first", () => {
    const levels = iconLevels(icons, "000000");
    expect(levels).toHaveLength(1);
    expect(levels[0].label).toBe("Main icon");
    expect(levels[0].value).toBe("000000");
    expect(levels[0].options).toHaveLength(11);
    expect(labelsOf(levels[0])).toContain("Movement and Maneuver");
    // A category is not a level: the entity chosen has no types under it.
    expect(levels[0].resetTo).toBeUndefined();
  });

  it("opens a Type control once a category with types is chosen", () => {
    const levels = iconLevels(icons, "120000");
    expect(levels.map((level) => level.label)).toEqual(["Main icon", "Type"]);
    expect(levels[0].value).toBe("120000");
    // Nothing narrowed yet, so the Type control shows its placeholder.
    expect(levels[1].value).toBe("");
    expect(levels[1].resetTo).toBe("120000");
    expect(labelsOf(levels[1])).toContain("Infantry");
    // Only this category's types — a sibling category's must not leak in.
    for (const option of levels[1].options) {
      expect(option.code.slice(0, 2)).toBe("12");
    }
  });

  it("opens a Subtype control when the type has any", () => {
    const levels = iconLevels(icons, "121100"); // Infantry
    expect(levels.map((level) => level.label)).toEqual([
      "Main icon",
      "Type",
      "Subtype",
    ]);
    expect(levels[1].value).toBe("121100");
    expect(levels[2].value).toBe("");
    expect(levels[2].resetTo).toBe("121100");
    for (const option of levels[2].options) {
      expect(option.code.slice(0, 4)).toBe("1211");
    }
  });

  it("selects all three levels for a full subtype code", () => {
    const levels = iconLevels(icons, "121102"); // Infantry, armoured/mechanised
    expect(levels).toHaveLength(3);
    expect(levels.map((level) => level.value)).toEqual([
      "120000",
      "121100",
      "121102",
    ]);
  });

  it("stops at Type when the type has no subtypes", () => {
    // Found rather than named: which types are childless is the data's business,
    // and a hard-coded example here was already wrong once (Engineer has six).
    const childless = icons.find(
      (icon) =>
        iconPath(icon).length === 2 &&
        !icons.some(
          (other) =>
            iconPath(other).length === 3 &&
            other.code.slice(0, 4) === icon.code.slice(0, 4),
        ),
    )!;
    const levels = iconLevels(icons, childless.code);
    expect(levels.map((level) => level.label)).toEqual(["Main icon", "Type"]);
    expect(levels[1].value).toBe(childless.code);
  });

  it("shows only the first level for a code the table does not have", () => {
    // Offering the types of some other entity would be worse than offering
    // none, so narrowing stops rather than guessing.
    const levels = iconLevels(icons, "999999");
    expect(levels).toHaveLength(1);
    expect(levels[0].value).toBe("");
  });

  it("lets every level be cleared back to its parent", () => {
    // resetTo is what the "Any" option sets, and it must be a code the level
    // above still selects — otherwise clearing a subtype would jump categories.
    const levels = iconLevels(icons, "121102");
    expect(levels[1].resetTo).toBe(levels[0].value);
    expect(levels[2].resetTo).toBe(levels[1].value);
  });

  it("collapses to one control for a flat list", () => {
    // COMMON_LAND_ICONS has no paths and no hierarchy in its labels. A cascade
    // over it would be one control offering everything, which is what it is.
    const levels = iconLevels(COMMON_LAND_ICONS, "121100");
    expect(levels).toHaveLength(1);
    expect(levels[0].value).toBe("121100");
    expect(levels[0].options).toHaveLength(COMMON_LAND_ICONS.length);
  });

  it("has nothing to say about an empty list", () => {
    expect(iconLevels([], "121100")).toEqual([]);
  });

  it("reaches every icon in the table", () => {
    // The real question: is any published row unreachable through the cascade?
    // A level that filtered too hard, or a parent the table lacked, would show
    // up here as an icon nobody can select.
    //
    // Each icon is selected at ITS OWN level, not necessarily the last one:
    // "Command and Control" is both a drawable symbol and a category, so
    // choosing it opens a Type control that is deliberately un-narrowed.
    for (const icon of icons) {
      const depth = iconPath(icon).length;
      const levels = iconLevels(icons, icon.code);
      expect(levels.length, `${icon.code} ${icon.label}`).toBeGreaterThanOrEqual(depth);
      expect(levels[depth - 1].value, `${icon.code} ${icon.label}`).toBe(icon.code);
      // And any level below it is offered empty rather than pre-answered.
      for (const deeper of levels.slice(depth)) {
        expect(deeper.value, `${icon.code} ${deeper.label}`).toBe("");
      }
    }
  });
});
