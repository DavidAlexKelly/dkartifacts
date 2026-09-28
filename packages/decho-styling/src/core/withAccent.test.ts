/**
 * Re-tinting a theme has to reach everything the accent touches.
 *
 * The failure this guards against is the obvious-in-hindsight one: override
 * `color.accent` and the buttons turn green while the hairline, the app glow,
 * the hover shadow and the selection ring stay purple. The page then looks
 * broken in a way that is hard to attribute, because most of it did change.
 *
 * So the central assertion is negative and absolute: after a re-tint, **no
 * trace of any original accent shade survives anywhere in the token set** — in
 * either notation, since the tokens use `#6c5ce7` in gradients and
 * `rgba(108, 92, 231, 0.2)` in shadows.
 */

import { describe, expect, it } from "vitest";
import { contrastRatio, luminance, parseColor, toRgbTriple } from "./color.js";
import {
  ACCENT_TOKENS,
  SKIN_OVERRIDES,
  accentVariables,
  defineTheme,
  tokensFor,
  withAccent,
  type DechoSkin,
  type DechoTokenSet,
} from "./tokens.js";

const ALL_SKINS: DechoSkin[] = [
  "classic",
  ...(Object.keys(SKIN_OVERRIDES) as DechoSkin[]),
];

/** Every token value in one flat list, for "does this appear anywhere" checks. */
function allValues(tokens: DechoTokenSet): string[] {
  return Object.values(tokens).flatMap((group) => Object.values(group));
}

/**
 * Only the values the accent owns.
 *
 * The search is scoped to these rather than to every token, because some
 * themes reuse the accent's exact hex for a colour it does not own — the
 * Accenture palette's `info` is Blue 3, the same as its accent, and an
 * informational status must keep meaning "information" after a re-tint.
 * ACCENT_TOKENS is the package's own list, so this test and the implementation
 * cannot disagree about what "owned" means.
 */
function ownedValues(tokens: DechoTokenSet): string[] {
  return Object.entries(ACCENT_TOKENS).flatMap(([group, keys]) =>
    (keys ?? []).map(
      (key) => (tokens[group as keyof DechoTokenSet] as Record<string, string>)[key],
    ),
  );
}

const GREEN = "#2fbf71";

describe.each(ALL_SKINS)("withAccent leaves no purple behind in %s", (skin) => {
  const before = tokensFor(skin);
  const after = withAccent(skin, GREEN);

  it("removes every trace of the original accent, hex and rgb alike", () => {
    // The shades a theme actually used are whatever its own accent tokens say,
    // plus anything in its gradients — so rather than trusting the private
    // shade list, this derives the needles from the theme's own accent values.
    const needles = new Set<string>();
    for (const value of [before.color.accent, before.color.accentHover]) {
      const parsed = parseColor(value);
      if (parsed == null) {continue;}
      needles.add(value.toLowerCase());
      needles.add(toRgbTriple(parsed));
    }

    const survivors: string[] = [];
    for (const value of ownedValues(after)) {
      for (const needle of needles) {
        if (value.toLowerCase().includes(needle)) {survivors.push(`${needle} in "${value}"`);}
      }
    }
    expect(survivors).toEqual([]);
  });

  it("actually applies the new colour", () => {
    expect(after.color.accent).not.toBe(before.color.accent);
    // The supplied colour lands somewhere in the ramp, not necessarily as
    // `accent` itself — a theme with three shades spreads them around it.
    const applied = allValues(after).some((v) => v.toLowerCase().includes("bf71"));
    expect(applied).toBe(true);
  });

  it("keeps everything the accent does not own", () => {
    // Surfaces, text, geometry, status colours and the decoration *structure*
    // are the theme's identity; a re-tint is not a new theme.
    expect(after.color.bg).toBe(before.color.bg);
    expect(after.color.text).toBe(before.color.text);
    expect(after.status).toEqual(before.status);
    expect(after.radius).toEqual(before.radius);
    expect(after.space).toEqual(before.space);
    // A theme with no gradients keeps none: re-tinting must not decorate.
    for (const key of Object.keys(before.gradient) as (keyof typeof before.gradient)[]) {
      if (before.gradient[key] === "none") {expect(after.gradient[key]).toBe("none");}
    }
  });

  it("leaves shadows dark and page stops alone", () => {
    // Found the hard way: modern's app gradient fades to rgba(8, 11, 22, 0)
    // and its shadows sit on rgba(4, 6, 16, …) — both blue-tinted, both within
    // 30° of the indigo accent — so an early version turned every drop shadow
    // into a green glow. A shadow is darkness, not brand.
    const darkStops = (value: string) =>
      (value.match(/\d{1,3},\s*\d{1,3},\s*\d{1,3}/g) ?? []).filter((triple) => {
        const rgb = parseColor(`rgb(${triple})`);
        return rgb != null && luminance(rgb) < 0.03;
      });

    for (const key of ["card", "cardHover", "selected", "panel"] as const) {
      expect(darkStops(after.shadow[key])).toEqual(darkStops(before.shadow[key]));
    }
    expect(darkStops(after.gradient.app)).toEqual(darkStops(before.gradient.app));
  });

  it("picks button text that can be read on the new accent", () => {
    // The most common brand-swap mistake: white text kept on a light accent.
    const accent = parseColor(after.color.accent)!;
    const onAccent = parseColor(after.color.onAccent)!;
    expect(contrastRatio(accent, onAccent)).toBeGreaterThanOrEqual(3);
  });
});

describe("withAccent", () => {
  it("returns the theme untouched for an unparseable colour", () => {
    // A typo in a Workshop parameter should not take the page down, and an
    // unchanged accent is visible immediately to whoever typed it.
    expect(withAccent("modern", "not a colour")).toEqual(tokensFor("modern"));
  });

  it("chooses dark text on a light accent and white on a dark one", () => {
    expect(withAccent("modern", "#d9f99d").color.onAccent).toBe("#12100c");
    expect(withAccent("modern", "#1e3a8a").color.onAccent).toBe("#ffffff");
  });
});

describe("accentVariables", () => {
  it("emits only what moved", () => {
    const vars = accentVariables("modern", GREEN);
    expect(Object.keys(vars).length).toBeGreaterThan(5);
    expect(vars["--decho-color-accent"]).toBeDefined();
    // The derived decoration comes too — this is the whole point.
    expect(vars["--decho-gradient-hairline"]).toBeDefined();
    expect(vars["--decho-shadow-selected"]).toBeDefined();
    // Surfaces did not move, so they are not emitted.
    expect(vars["--decho-color-bg"]).toBeUndefined();
  });
});

describe("defineTheme with an accent", () => {
  const acme = defineTheme({ name: "acme", extends: "modern", accent: GREEN });

  it("re-tints, and says so in its CSS", () => {
    expect(acme.css).toContain(".decho-acme");
    expect(acme.css).toContain("--decho-color-accent");
    expect(acme.css).toContain("--decho-gradient-hairline");
  });

  it("still lets explicit tokens win over the re-tint", () => {
    const pinned = defineTheme({
      name: "pinned",
      extends: "modern",
      accent: GREEN,
      tokens: { color: { accent: "#ff0000" } },
    });
    expect(pinned.tokens.color.accent).toBe("#ff0000");
    // …while the derived decoration is still the green ramp's.
    expect(pinned.tokens.gradient.hairline).not.toBe(
      tokensFor("modern").gradient.hairline,
    );
  });
});
