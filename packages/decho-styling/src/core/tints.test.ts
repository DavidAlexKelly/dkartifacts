/**
 * The opaque tints.
 *
 * A `*Soft` token is a wash. Used as a background with nothing painted behind
 * it, it takes the colour of whatever the host is — which is how five widget
 * sets ended up with near-black cards, rows and progress tracks after a
 * migration that replaced every opaque tint with the "equivalent" token.
 */

import { describe, expect, it } from "vitest";
import { luminance, parseColor } from "./color.js";
import {
  DECHO_THEMES,
  modeDeltas,
  modesFor,
  themeDeltas,
  tokensFor,
  withAccent,
} from "./tokens.js";
import { isTranslucent, over, tintsFor } from "./tints.js";

/** Every theme-and-mode pair there is, as `[theme, mode]`. */
const EVERY_MODE = DECHO_THEMES.flatMap((theme) =>
  modesFor(theme).map((mode) => [theme, mode] as const),
);

const TONES = ["accent", "info", "success", "warning", "danger", "neutral"] as const;

describe("over", () => {
  it("composites the way the browser would", () => {
    // 10% of #a100ff on white: 90% white plus 10% accent, per channel.
    expect(over("rgba(161, 0, 255, 0.1)", "#ffffff")).toBe("rgb(246, 230, 255)");
  });

  it("shows what the bug looked like: the same wash over a dark page", () => {
    expect(over("rgba(161, 0, 255, 0.1)", "#0a0c0f")).toBe("rgb(25, 11, 39)");
  });

  it("leaves an opaque colour alone", () => {
    expect(over("#7500c0", "#ffffff")).toBe("#7500c0");
  });

  it("returns the input rather than nothing when a colour will not parse", () => {
    // A wrong colour is recoverable; `undefined` is a dropped declaration, and
    // a dropped declaration is an unpainted element.
    expect(over("not-a-colour", "#ffffff")).toBe("not-a-colour");
  });
});

describe("tintsFor", () => {
  it.each(DECHO_THEMES)("gives %s six opaque tints", (theme) => {
    for (const [name, value] of Object.entries(tintsFor(theme))) {
      expect(isTranslucent(value), `${theme}.${name} = ${value}`).toBe(false);
    }
  });

  it("composites over the theme's own surface", () => {
    const sap = tokensFor("accenture-sap");
    expect(tintsFor("accenture-sap").accent).toBe(over(sap.color.accentSoft, sap.color.surface));
    // Same wash, different theme, different answer — which is the point.
    expect(tintsFor("accenture-sap").accent).not.toBe(tintsFor("command").accent);
  });

  it("takes a resolved token set, so custom themes and re-tints work", () => {
    const custom = tokensFor("daylight");
    expect(tintsFor(custom).success).toBe(over(custom.color.successSoft, custom.color.surface));
  });

  it("can be told a different backdrop, for a tint on a raised surface", () => {
    const sap = tokensFor("accenture-sap");
    expect(tintsFor("accenture-sap", sap.color.surfaceRaised).accent).not.toBe(
      tintsFor("accenture-sap").accent,
    );
  });
});

describe("the tint tokens", () => {
  // The 1.3.1 change: a tint is a token, so it is a CSS custom property, so it
  // follows the mode. Before, it was a value computed at import against the
  // light surface, and a widget in dark mode painted chalky selected rows.
  it.each(EVERY_MODE)("%s/%s derives all six against its own surface", (theme, mode) => {
    const colors = tokensFor(theme, mode).color;
    for (const tone of TONES) {
      const tint = colors[`${tone}Tint` as keyof typeof colors];
      expect(tint, `${theme}/${mode}.${tone}Tint`).toBe(
        over(colors[`${tone}Soft` as keyof typeof colors], colors.surface),
      );
      expect(isTranslucent(tint), `${theme}/${mode}.${tone}Tint = ${tint}`).toBe(false);
    }
  });

  it.each(DECHO_THEMES.filter((theme) => modesFor(theme).length > 1))(
    "%s's dark tints are dark, not the light ones",
    (theme) => {
      const light = tokensFor(theme, "light").color;
      const dark = tokensFor(theme, "dark").color;
      for (const tone of TONES) {
        const key = `${tone}Tint` as keyof typeof light;
        expect(dark[key], `${theme}.${tone}Tint`).not.toBe(light[key]);
        // Close to its own surface rather than to the other mode's: this is
        // the assertion the 1.3.0 bug would have failed.
        expect(
          Math.abs(luminance(parseColor(dark[key])!) - luminance(parseColor(dark.surface)!)),
          `${theme}.${tone}Tint sits near its own surface`,
        ).toBeLessThan(0.2);
      }
    },
  );

  // Derived tokens still have to reach the stylesheet, or a themed widget picks
  // up the base theme's tints from `:root` — and the base theme is dark.
  it("appears in the theme's own block", () => {
    const deltas = themeDeltas("accenture-sap");
    expect(deltas["--decho-color-accent-tint"]).toBe(
      tokensFor("accenture-sap").color.accentTint,
    );
  });

  it("appears in the dark block", () => {
    const deltas = modeDeltas("accenture-sap", "dark");
    expect(deltas["--decho-color-accent-tint"]).toBe(
      tokensFor("accenture-sap", "dark").color.accentTint,
    );
  });

  it("is re-derived by a re-tint, not left on the old brand", () => {
    const retinted = withAccent("accenture-sap", "#0a7f2e");
    expect(retinted.color.accentTint).toBe(
      over(retinted.color.accentSoft, retinted.color.surface),
    );
    expect(retinted.color.accentTint).not.toBe(tokensFor("accenture-sap").color.accentTint);
  });
});

describe("the washes themselves", () => {
  it.each(DECHO_THEMES)("are still translucent in %s, which is why tints exist", (theme) => {
    const colors = tokensFor(theme).color;
    for (const tone of ["accent", "info", "success", "warning", "danger", "neutral"]) {
      expect(isTranslucent(colors[`${tone}Soft` as keyof typeof colors]), `${theme}.${tone}Soft`).toBe(true);
    }
  });
});
