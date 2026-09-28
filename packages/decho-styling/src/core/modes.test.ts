/**
 * Modes.
 *
 * A theme is a palette; a mode is which end of it. The tests that matter are
 * not "is the dark mode dark" — they are the three promises that make a mode
 * different from a second theme:
 *
 *   1. Everything not about light and dark carries over untouched: the RAG
 *      scale, the chart series, the geometry, the type.
 *   2. The pair that already existed (`accenture-light` / `accenture-dark`)
 *      resolves identically through the new mechanism, so folding them costs
 *      nobody anything.
 *   3. A theme with one mode says so, instead of inventing the other.
 */

import { describe, expect, it } from "vitest";
import {
  DECHO_THEMES,
  accentVariables,
  withAccent,
  MODE_OVERRIDES,
  THEME_MODES,
  allThemeVariables,
  defaultModeFor,
  modeDeltas,
  modesFor,
  tokensFor,
} from "./tokens.js";

const withDark = DECHO_THEMES.filter((theme) => modesFor(theme).includes("dark") && modesFor(theme).length > 1);

describe("the mode registry", () => {
  it("covers every theme", () => {
    expect(Object.keys(THEME_MODES).sort()).toEqual([...DECHO_THEMES].sort());
  });

  it("gives every theme a default it actually has", () => {
    for (const theme of DECHO_THEMES) {
      expect(modesFor(theme), theme).toContain(defaultModeFor(theme));
    }
  });

  it("declares a mode delta for exactly the themes with two modes", () => {
    expect(Object.keys(MODE_OVERRIDES).sort()).toEqual([...withDark].sort());
  });
});

describe("what a mode does not change", () => {
  it.each(withDark)("%s keeps the same RAG scale in both modes", (theme) => {
    // A heatmap has to screenshot the same in both. This is the constraint
    // that makes a mode a mode rather than an inversion.
    expect(tokensFor(theme, "dark").status).toEqual(tokensFor(theme, "light").status);
  });

  it.each(withDark)("%s keeps the same chart SERIES colours", (theme) => {
    const light = tokensFor(theme, "light").chart;
    const dark = tokensFor(theme, "dark").chart;
    for (const key of Object.keys(light).filter((k) => k.startsWith("series"))) {
      expect(dark[key as keyof typeof dark], `${theme} ${key}`).toBe(light[key as keyof typeof light]);
    }
  });

  it.each(withDark)("%s DOES flip the axis and grid, which belong to the surface", (theme) => {
    // The one part of `chart` that is not a brand decision: an axis is a
    // hairline drawn on the page, so it follows the page. Asserted rather than
    // assumed, because "the chart tokens are identical" was the first version
    // of the rule above and it was wrong.
    const light = tokensFor(theme, "light").chart;
    const dark = tokensFor(theme, "dark").chart;
    expect(dark.axis).not.toBe(light.axis);
    expect(dark.grid).not.toBe(light.grid);
  });

  it.each(withDark)("%s keeps the same geometry and type", (theme) => {
    const light = tokensFor(theme, "light");
    const dark = tokensFor(theme, "dark");
    expect(dark.radius).toEqual(light.radius);
    expect(dark.space).toEqual(light.space);
    expect(dark.fontSize).toEqual(light.fontSize);
    expect(dark.fontFamily).toEqual(light.fontFamily);
  });
});

describe("what a mode does change", () => {
  it("flips the surfaces and the text, and says so to the browser", () => {
    const light = tokensFor("accenture-sap", "light");
    const dark = tokensFor("accenture-sap", "dark");

    expect(light.color.surface).toBe("#ffffff");
    expect(dark.color.surface).toBe("#18181b");
    expect(light.effect.colorScheme).toBe("light");
    // The token that puts the native scrollbars and form controls in the same
    // mode — the thing that was black when this went wrong.
    expect(dark.effect.colorScheme).toBe("dark");
  });

  it("lightens the tones rather than reusing them", () => {
    // #0f6e3d passes on white and fails on near-black, so the dark mode has to
    // declare its own. Reusing them is the commonest way a "dark mode" ends up
    // unreadable.
    const light = tokensFor("accenture-sap", "light");
    const dark = tokensFor("accenture-sap", "dark");
    for (const tone of ["success", "warning", "danger", "info"] as const) {
      expect(dark.color[tone], tone).not.toBe(light.color[tone]);
    }
  });

  it("keeps the brand accent, because it works on both", () => {
    expect(tokensFor("accenture-sap", "dark").color.accent).toBe("#a100ff");
  });
});

describe("the pair that already existed", () => {
  it("accenture-light in dark mode IS accenture-dark, token for token", () => {
    expect(tokensFor("accenture-light", "dark")).toEqual(tokensFor("accenture-dark"));
  });

  it("accenture-standard is both of them under one name", () => {
    // The name to use. The other two are what it was called before modes
    // existed; all three resolve to the same two token sets, and the light
    // palette is one object referenced twice rather than two copies.
    expect(tokensFor("accenture-standard", "light")).toEqual(tokensFor("accenture-light"));
    expect(tokensFor("accenture-standard", "dark")).toEqual(tokensFor("accenture-dark"));
  });
});

describe("re-tinting", () => {
  it("stays in the mode it was given", () => {
    // The bug this covers: withAccent used to resolve the theme's DEFAULT
    // mode, so re-tinting a widget that was in dark mode snapped it back to
    // light — visible in the harness as the page flashing white when you
    // picked an accent.
    const dark = withAccent("accenture-sap", "#2fbf71", "dark");
    expect(dark.color.surface).toBe(tokensFor("accenture-sap", "dark").color.surface);
    expect(dark.color.accent).toBe("#2fbf71");
  });

  it("still defaults to the theme's own mode when not told", () => {
    expect(withAccent("accenture-sap", "#2fbf71").color.surface).toBe("#ffffff");
  });

  it("emits variables for the mode it was given", () => {
    const vars = accentVariables("accenture-sap", "#2fbf71", "dark");
    // Only the accent family moves; the dark surfaces are not in the delta
    // because they are the mode's, not the re-tint's.
    expect(vars["--decho-color-accent"]).toBe("#2fbf71");
    expect(vars["--decho-color-surface"]).toBeUndefined();
  });
});

describe("a theme with one mode", () => {
  it.each(["classic", "modern", "command"] as const)("%s refuses a light mode", (theme) => {
    expect(() => tokensFor(theme, "light")).toThrow(/has no light mode/);
  });

  it("daylight refuses a dark mode", () => {
    expect(() => tokensFor("daylight", "dark")).toThrow(/has no dark mode/);
  });

  it("explains that the answer is defineTheme, not a guess", () => {
    expect(() => tokensFor("command", "light")).toThrow(/defineTheme/);
  });
});

describe("the variables", () => {
  it("modeDeltas holds only what the mode changes", () => {
    const deltas = modeDeltas("accenture-sap", "dark");
    expect(deltas["--decho-color-surface"]).toBe("#18181b");
    // Untouched by the mode, so absent from its block — the theme's own block
    // and the base carry it.
    expect(deltas["--decho-radius-lg"]).toBeUndefined();
    expect(deltas["--decho-status-critical"]).toBeUndefined();
  });

  it("modeDeltas is empty for the default mode", () => {
    expect(modeDeltas("accenture-sap", "light")).toEqual({});
    expect(modeDeltas("classic", "dark")).toEqual({});
  });

  it("allThemeVariables resolves the whole set for a mode", () => {
    const dark = allThemeVariables("accenture-sap", "dark");
    expect(dark["--decho-color-surface"]).toBe("#18181b");
    // Everything, not just the delta: this is what gets written onto a
    // document in a host we do not control.
    expect(dark["--decho-radius-lg"]).toBe("10px");
    expect(Object.keys(dark).length).toBe(Object.keys(allThemeVariables("accenture-sap")).length);
  });
});
