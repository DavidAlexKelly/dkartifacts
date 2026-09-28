/**
 * The two deliveries agree — for every skin.
 *
 * This package says the same thing twice: once as TypeScript for inline styles,
 * once as CSS custom properties for stylesheets. The whole value of it
 * evaporates the moment the two disagree, because a widget using classes and a
 * widget using recipes then render different greens and nobody notices until
 * they are side by side in the same Workshop module. Adding a second skin
 * doubles the surface, so the test does too.
 *
 * What is asserted, and why each one has bitten somebody somewhere:
 *
 *   - Every base token is declared in the `:root` block with an identical
 *     value, and that block declares nothing else.
 *   - The `modern` block matches SKIN_OVERRIDES.modern exactly — no missing
 *     override (the skin would silently inherit classic's flat surface), and
 *     no extra one (the stylesheet would be modern in a way the recipes are
 *     not).
 *   - A skin only ever overrides tokens that exist in the base set, so
 *     `tokensFor("modern")` cannot contain a key the CSS has no default for.
 *   - Classic's decoration tokens are all `none`, which is what makes one rule
 *     serve both skins; if one acquired a real value, classic would grow a
 *     gradient nobody asked for.
 *   - The selectors are still only the four expected ones, so the stylesheet
 *     stays safe to import into a page you do not own.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DECHO_TOKENS,
  MODE_OVERRIDES,
  SKIN_OVERRIDES,
  type DechoSkin,
  skinVariables,
  tokenVariableName,
  tokenVariables,
  tokensFor,
} from "./tokens.js";

/** Every theme, including the one that is the base set. */
const ALL_SKINS: DechoSkin[] = ["classic", ...(Object.keys(SKIN_OVERRIDES) as DechoSkin[])];

const CSS = readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8");

interface Block {
  selectors: string[];
  variables: Map<string, string>;
}

/**
 * The stylesheet as blocks of `--decho-*` declarations.
 *
 * Deliberately naive — no CSS parser, and the file is two flat blocks of
 * declarations so it does not need one. Comments are stripped first, or a
 * variable mentioned in prose would count as declared.
 */
function parseBlocks(css: string): Block[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Block[] = [];
  const blockPattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(withoutComments)) != null) {
    const selectors = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const variables = new Map<string, string>();
    const declPattern = /(--decho-[a-z0-9-]+)\s*:\s*([^;]+);/g;
    let decl: RegExpExecArray | null;
    while ((decl = declPattern.exec(match[2])) != null) {
      variables.set(decl[1], decl[2].trim());
    }
    blocks.push({ selectors, variables });
  }
  return blocks;
}

const BLOCKS = parseBlocks(CSS);

function blockFor(selector: string): Block {
  const block = BLOCKS.find((b) => b.selectors.includes(selector));
  if (block == null) {
    throw new Error(`tokens.css has no block for ${selector}`);
  }
  return block;
}

/** Reports mismatches as strings, so a failure names every offender at once. */
function diff(
  declared: Map<string, string>,
  expected: Record<string, string>,
  where: string,
): string[] {
  const problems: string[] = [];
  for (const [name, value] of Object.entries(expected)) {
    const actual = declared.get(name);
    if (actual == null) {
      problems.push(`${name}: missing from ${where} (expected "${value}")`);
    } else if (actual !== value) {
      problems.push(`${name}: ${where} has "${actual}", TypeScript has "${value}"`);
    }
  }
  for (const name of declared.keys()) {
    if (expected[name] == null) {
      problems.push(`${name}: declared in ${where}, absent from TypeScript`);
    }
  }
  return problems;
}

describe("tokens.css mirrors tokens.ts", () => {
  it("declares every base token on :root, and nothing else", () => {
    expect(
      diff(blockFor(":root").variables, tokenVariables("classic"), ":root"),
    ).toEqual([]);
  });

  it("repeats the full set on .decho-classic", () => {
    // Not overrides: the whole set, so a classic subtree inside a themed app
    // resets every token rather than inheriting half of the outer theme.
    expect(
      diff(
        blockFor(".decho-classic").variables,
        tokenVariables("classic"),
        ".decho-classic",
      ),
    ).toEqual([]);
  });

  // Derived from SKIN_OVERRIDES rather than listed, so adding a fifth theme
  // adds its own test: the day someone writes the TypeScript and forgets the
  // stylesheet, this fails naming the block.
  it.each(Object.keys(SKIN_OVERRIDES))(
    "declares exactly the %s overrides on its block",
    (skin) => {
      expect(
        diff(
          blockFor(`.decho-${skin}`).variables,
          skinVariables(skin as DechoSkin),
          `.decho-${skin}`,
        ),
      ).toEqual([]);
    },
  );

  it("scopes each block to the selectors a widget can rely on", () => {
    // A widget shares its page. If this file ever grows a bare element selector
    // — `body`, say — it stops being safe to import into one. The data
    // attribute is part of the public API: hosts that cannot add a class use it.
    expect(BLOCKS.map((b) => b.selectors)).toEqual([
      [":root", ".decho-root"],
      // classic selects like every other theme, so tooling has no special case
      [".decho-classic", '[data-decho-theme="classic"]'],
      ...Object.keys(SKIN_OVERRIDES).map((skin) => [
        `.decho-${skin}`,
        `[data-decho-theme="${skin}"]`,
      ]),
      // A dark mode is two classes, not one: 0,2,0 beats the theme block's
      // 0,1,0, so the cascade does the work and nothing depends on order.
      ...Object.keys(MODE_OVERRIDES).map((theme) => [
        `.decho-${theme}.decho-dark`,
        `[data-decho-theme="${theme}"][data-decho-mode="dark"]`,
      ]),
    ]);
  });
});

describe("skins", () => {
  it("only override tokens that exist in the base set", () => {
    const unknown: string[] = [];
    for (const [skin, overrides] of Object.entries(SKIN_OVERRIDES)) {
      for (const [group, entries] of Object.entries(overrides)) {
        const base = (DECHO_TOKENS as Record<string, Record<string, string>>)[group];
        if (base == null) {
          unknown.push(`${skin}: unknown group "${group}"`);
          continue;
        }
        for (const key of Object.keys(entries ?? {})) {
          if (base[key] == null) {
            unknown.push(`${skin}: ${group}.${key} is not a base token`);
          }
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("resolve to the base set for classic", () => {
    expect(tokensFor("classic")).toBe(DECHO_TOKENS as never);
  });

  it.each(Object.keys(SKIN_OVERRIDES))("resolve %s to a full token set", (skin) => {
    const resolved = tokensFor(skin as DechoSkin);
    // Same shape as the base set: a skin adds nothing and removes nothing.
    expect(Object.keys(resolved).sort()).toEqual(Object.keys(DECHO_TOKENS).sort());
    for (const group of Object.keys(DECHO_TOKENS) as (keyof typeof resolved)[]) {
      expect(Object.keys(resolved[group]).sort()).toEqual(
        Object.keys(DECHO_TOKENS[group]).sort(),
      );
    }
    // And it inherits what it does not override — no theme redefines spacing.
    expect(resolved.space["4"]).toBe(DECHO_TOKENS.space["4"]);
  });

  it("keeps classic flat", () => {
    // The one rule that serves both skins is
    //   background-image: var(--hairline), var(--wash)
    // which paints nothing only while these are `none`.
    for (const value of Object.values(DECHO_TOKENS.gradient)) {
      expect(value).toBe("none");
    }
    expect(DECHO_TOKENS.effect.surfaceBlur).toBe("none");
    expect(DECHO_TOKENS.shadow.dot).toBe("none");
  });

  it("gives modern a lit surface, a hairline and a coloured selection", () => {
    // Not a snapshot — the three properties that make the skin what it is.
    const modern = tokensFor("modern");
    expect(modern.gradient.app).toContain("radial-gradient");
    expect(modern.gradient.hairline).toContain("linear-gradient");
    expect(modern.shadow.selected).toContain("rgba(108, 92, 231");
    // Translucent surfaces are why the blur exists; one without the other is a
    // card you cannot read text on, or a blur that blurs nothing.
    expect(modern.color.surface).toMatch(/^rgba\(/);
    expect(modern.effect.surfaceBlur).toContain("blur(");
  });
});

describe("tokenVariableName", () => {
  it("kebab-cases camelCase keys", () => {
    expect(tokenVariableName("color", "surfaceRaised")).toBe(
      "--decho-color-surface-raised",
    );
    expect(tokenVariableName("fontSize", "md")).toBe("--decho-font-size-md");
    expect(tokenVariableName("effect", "surfaceBlur")).toBe(
      "--decho-effect-surface-blur",
    );
  });

  it("leaves keys that are already lower case alone", () => {
    expect(tokenVariableName("space", "4")).toBe("--decho-space-4");
    expect(tokenVariableName("fontSize", "2xl")).toBe("--decho-font-size-2xl");
  });
});

describe("the palette", () => {
  it.each(ALL_SKINS)("keeps a soft partner for every tone in %s", (skin) => {
    // The tinted background behind a tag. A status colour that acquires no soft
    // partner produces a tag with a solid warning-coloured fill, which is the
    // one thing the tone scale exists to prevent.
    const colors = tokensFor(skin).color;
    for (const tone of [
      "accent",
      "info",
      "success",
      "warning",
      "danger",
      "neutral",
    ] as const) {
      expect(colors[`${tone}Soft`]).toMatch(/^rgba\(/);
    }
  });

  /**
   * Relative luminance, near enough for an ordering check.
   *
   * Not a contrast-ratio assertion: the surfaces are translucent, so the real
   * contrast depends on what is behind them, and a precise number here would
   * be false precision. What this catches is the mistake that actually
   * happens — a theme shipping light text on a light background because one
   * token was overridden and its partner was not.
   */
  function luminance(hex: string): number {
    const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    if (m == null) {
      throw new Error(`expected an opaque hex colour, got "${hex}"`);
    }
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  it.each(ALL_SKINS)("puts text and page on opposite ends of the ramp in %s", (skin) => {
    const { color, effect } = tokensFor(skin);
    const light = effect.colorScheme === "light";
    const page = luminance(color.bg);
    const text = luminance(color.text);

    if (light) {
      expect(page).toBeGreaterThan(text);
      expect(page).toBeGreaterThan(0.5);
    } else {
      expect(text).toBeGreaterThan(page);
      expect(page).toBeLessThan(0.1);
    }
    // Whichever way round, they must be far apart. 0.4 is loose on purpose:
    // it fails dark-on-dark, and does not litigate the exact greys.
    expect(Math.abs(text - page)).toBeGreaterThan(0.4);
  });

  it.each(ALL_SKINS)("declares a colour scheme the browser understands in %s", (skin) => {
    // Native scrollbars and form controls follow this, and nothing else does.
    expect(["dark", "light"]).toContain(tokensFor(skin).effect.colorScheme);
  });
});
