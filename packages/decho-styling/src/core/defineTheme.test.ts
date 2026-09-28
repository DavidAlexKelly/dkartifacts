/**
 * A project can define its own theme without touching this package.
 *
 * That is the property under test, and it matters more than it looks: with
 * dozens of client brands, a design system whose maintainer must merge a pull
 * request for every palette is a queue, not a standard. So `defineTheme` has
 * to produce something usable through all three deliveries — CSS, inline
 * variables, and the components — from an object the consumer owns.
 */

import { describe, expect, it } from "vitest";
import { DECHO_TOKENS, defineTheme, tokensFor } from "./tokens.js";

const acme = defineTheme({
  name: "acme",
  extends: "daylight",
  tokens: { color: { accent: "#c8102e", accentHover: "#e11b3c" } },
});

describe("defineTheme", () => {
  it("inherits everything it does not override", () => {
    const daylight = tokensFor("daylight");
    expect(acme.tokens.color.accent).toBe("#c8102e");
    expect(acme.tokens.color.bg).toBe(daylight.color.bg);
    expect(acme.tokens.radius.lg).toBe(daylight.radius.lg);
    // And it does not mutate what it extends, which a shallow merge would.
    expect(tokensFor("daylight").color.accent).not.toBe("#c8102e");
  });

  it("defaults to extending classic", () => {
    const plain = defineTheme({ name: "plain", tokens: { color: { accent: "#000000" } } });
    expect(plain.tokens.color.bg).toBe(DECHO_TOKENS.color.bg);
  });

  it("emits only what changed, as CSS and as a style object", () => {
    expect(acme.variables).toEqual({
      "--decho-color-accent": "#c8102e",
      "--decho-color-accent-hover": "#e11b3c",
    });
    // Selectable the same way the built-in themes are — class or attribute.
    expect(acme.css).toContain(".decho-acme");
    expect(acme.css).toContain('[data-decho-theme="acme"]');
    expect(acme.css).toContain("--decho-color-accent: #c8102e;");
    // No other theme's variables leak in: a thirty-line block would bury the
    // two declarations that matter, in the file and in devtools.
    expect(Object.keys(acme.style)).toHaveLength(2);
  });

  it("produces a token set a component library can be handed", () => {
    // `tokens` is the half of a custom theme that does not go through CSS: a
    // `<DechoSurface tokens={acme.tokens}>` in @acc/decho-components writes
    // these as custom properties, which is how a theme defined here reaches
    // components that never import this package.
    //
    // Asserted as values rather than through a recipe, because the recipes now
    // live in that package — and a token package whose test needs a component
    // package would be the dependency this split exists to avoid.
    expect(acme.tokens.color.accent).toBe("#c8102e");
    // Everything it did not override still comes from the theme it extends.
    expect(acme.tokens.color.surface).toBe(tokensFor("daylight").color.surface);
    expect(acme.tokens.radius.lg).toBe(tokensFor("daylight").radius.lg);
  });
});
