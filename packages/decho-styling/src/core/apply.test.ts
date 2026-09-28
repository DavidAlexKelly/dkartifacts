/**
 * `applyTheme` and `assertThemeApplied`.
 *
 * These exist because of a specific production failure: five widget sets put
 * `class="decho-root decho-accenture-sap"` on `<html>`, the widget-set CLI
 * shipped only the built assets and the host provided the document, so the
 * class never arrived — and because `tokens.css` declares the base set on
 * `:root`, every variable resolved to the BASE theme rather than to nothing.
 * The base theme is dark. The widgets rendered dark: black scrollbars, navy
 * cards, light text on white.
 *
 * The tests below are therefore about self-sufficiency and detectability, not
 * about colour.
 */

import { describe, expect, it, vi } from "vitest";
import { DECHO_THEMES, allThemeVariables, themeDeltas, tokensFor } from "./tokens.js";
import { applyTheme, assertThemeApplied, type StyleTarget } from "./apply.js";

function fakeElement() {
  const properties = new Map<string, string>();
  const classes = new Set<string>();
  const element: StyleTarget = {
    style: {
      setProperty: (name, value) => void properties.set(name, value),
      removeProperty: (name) => void properties.delete(name),
    },
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
    },
  };
  return { element, properties, classes };
}

describe("applyTheme", () => {
  it.each(DECHO_THEMES)("writes every variable for %s, not just the deltas", (theme) => {
    const { element, properties } = fakeElement();
    applyTheme(theme, { element });

    // The whole point. Deltas are for the stylesheet, where the base block is
    // already in the cascade; an element in someone else's document has no
    // such guarantee, and a gap there resolves to the dark base.
    for (const name of Object.keys(allThemeVariables(theme))) {
      expect(properties.has(name), name).toBe(true);
    }
    expect(properties.size).toBeGreaterThan(
      Object.keys(themeDeltas(theme === "classic" ? "modern" : theme)).length,
    );
  });

  it("paints the page, because an unpainted page is the host's colour", () => {
    const { element, properties } = fakeElement();
    applyTheme("accenture-sap", { element });
    const tokens = tokensFor("accenture-sap");

    expect(properties.get("background")).toBe(tokens.color.bg);
    expect(properties.get("color")).toBe(tokens.color.text);
    // The one that fixes native scrollbars and form controls.
    expect(properties.get("color-scheme")).toBe("light");
  });

  it("can be told not to paint, for a subtree inside an already-themed page", () => {
    const { element, properties } = fakeElement();
    applyTheme("accenture-sap", { element, paint: false });
    expect(properties.has("--decho-color-surface")).toBe(true);
    expect(properties.has("background")).toBe(false);
  });

  it("adds the classes, so the CSS delivery works from the same call", () => {
    const { element, classes } = fakeElement();
    applyTheme("command", { element });
    expect([...classes]).toEqual(["decho-root", "decho-command"]);
  });

  it("takes a resolved token set, so a custom theme or a re-tint can be applied", () => {
    const { element, properties, classes } = fakeElement();
    const custom = { ...tokensFor("daylight"), color: { ...tokensFor("daylight").color, accent: "#c8102e" } };
    applyTheme(custom, { element });
    expect(properties.get("--decho-color-accent")).toBe("#c8102e");
    // No theme name, so no theme class — only the root marker.
    expect([...classes]).toEqual(["decho-root"]);
  });

  it("returns an undo, so a React effect can clean up after itself", () => {
    const { element, properties, classes } = fakeElement();
    const undo = applyTheme("modern", { element });
    expect(properties.size).toBeGreaterThan(0);
    undo();
    expect(properties.size).toBe(0);
    expect(classes.size).toBe(0);
  });

  it("does nothing, rather than throwing, with no DOM", () => {
    // Server rendering and node tests both hit this path.
    expect(() => applyTheme("classic", { element: null })()).not.toThrow();
  });
});

describe("assertThemeApplied", () => {
  it("passes when the expected theme is in force", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(assertThemeApplied("accenture-sap", { read: () => "#ffffff" })).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("catches the exact failure that shipped: the base theme in force instead", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // classic's surface — what every widget resolved to when the class was lost.
    expect(assertThemeApplied("accenture-sap", { read: () => "#111318" })).toBe(false);
    expect(warn.mock.calls[0][0]).toContain("the BASE theme, which is dark");
    warn.mockRestore();
  });

  it("catches no theme at all", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(assertThemeApplied("modern", { read: () => "" })).toBe(false);
    expect(warn.mock.calls[0][0]).toContain("no theme is applied");
    warn.mockRestore();
  });

  it("can throw instead, for a test suite that wants it to fail loudly", () => {
    expect(() =>
      assertThemeApplied("modern", { read: () => "#ffffff", strict: true }),
    ).toThrow(/theme in force is not/);
  });

  it("is a no-op when there is nothing to read", () => {
    expect(assertThemeApplied("classic")).toBe(true);
  });
});
