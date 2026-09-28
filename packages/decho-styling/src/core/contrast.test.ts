/**
 * Every theme has to be readable.
 *
 * The drift test proves the two deliveries agree. This one proves the values
 * are usable, which is a different failure: `accenture-dark` was one edit away
 * from shipping Green Shade 2 on Black — a "success" state nobody could read —
 * and nothing in the type system or the drift test would have objected.
 *
 * WHAT IS MEASURED, AND AGAINST WHAT
 * ----------------------------------
 * WCAG contrast ratios, computed against the surface a thing actually sits on.
 * Several surfaces are deliberately translucent, so they are flattened over the
 * page colour first — the ratio a user sees is the one after compositing, not
 * the one the token literal implies.
 *
 * THRESHOLDS, AND WHY THEY ARE NOT ALL 4.5
 * ----------------------------------------
 * 4.5:1 is the WCAG AA bar for body text and applies to `text`. Muted text is
 * held to 4.5 as well, because "secondary" in this system still means prose
 * somebody has to read. Status and accent colours are held to 3:1, the AA bar
 * for large text and for non-text UI, because they are used as fills, borders
 * and 10px uppercase tags rather than paragraphs — and because holding a
 * six-tone scale to 4.5 on both light and dark forces every theme's palette
 * toward the same handful of colours.
 *
 * A failure here is a real defect in a theme, not a reason to lower the number.
 */

import { describe, expect, it } from "vitest";
import {
  DECHO_THEMES,
  modesFor,
  tokensFor,
  type DechoMode,
  type DechoSkin,
} from "./tokens.js";

/**
 * Every theme in every mode it offers.
 *
 * A dark mode is where legibility goes wrong: #0f6e3d green passes on white and
 * fails on near-black, so a mode that reuses its theme's tones is a mode nobody
 * can read. Iterating the modes here is what makes that impossible to ship.
 */
const ALL_THEMES: { skin: DechoSkin; mode: DechoMode; label: string }[] =
  DECHO_THEMES.flatMap((skin) =>
    modesFor(skin).map((mode) => ({ skin, mode, label: `${skin} (${mode})` })),
  );

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses the two notations the tokens use: #rrggbb and rgba(r, g, b, a). */
function parse(colour: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (hex != null) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(colour.trim());
  if (rgba != null) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((p) => p.trim());
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  throw new Error(`cannot parse colour "${colour}"`);
}

/** Composites a possibly-translucent colour over an opaque one. */
function flatten(colour: string, over: string): Rgb {
  const top = parse(colour);
  const bottom = parse(over);
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(foreground: Rgb, background: Rgb): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** Contrast of `fg` against `surface`, both flattened over the page colour. */
function contrast(fg: string, surface: string, page: string): number {
  const bg = flatten(surface, page);
  return ratio(flatten(fg, `rgb(${bg.r}, ${bg.g}, ${bg.b})`), bg);
}

function report(name: string, value: number, min: number): string {
  return `${name}: ${value.toFixed(2)}:1 (needs ${min}:1)`;
}

describe.each(ALL_THEMES)("$label is readable", ({ skin, mode }) => {
  const { color } = tokensFor(skin, mode);
  const page = color.bg;

  it("body text on the page and on a card", () => {
    const failures: string[] = [];
    for (const [where, surface] of [
      ["page", page],
      ["surface", color.surface],
      ["raised", color.surfaceRaised],
    ] as const) {
      const value = contrast(color.text, surface, page);
      if (value < 4.5) {failures.push(report(`text on ${where}`, value, 4.5));}
    }
    expect(failures).toEqual([]);
  });

  it("secondary text, which is still prose", () => {
    const value = contrast(color.textMuted, color.surface, page);
    expect(value, report("textMuted on surface", value, 4.5)).toBeGreaterThanOrEqual(4.5);
  });

  it("tones carry meaning, so they have to be distinguishable", () => {
    const failures: string[] = [];
    for (const tone of ["accent", "info", "success", "warning", "danger"] as const) {
      const value = contrast(color[tone], color.surface, page);
      if (value < 3) {failures.push(report(`${tone} on surface`, value, 3));}
    }
    expect(failures).toEqual([]);
  });

  it("text on an accent fill", () => {
    // The pair a primary button is made of. 3:1 because the text on one is
    // 12px uppercase and bold — and because holding this to 4.5 would force
    // every theme's accent to be either very dark or very light.
    const value = ratio(parse(color.onAccent), parse(color.accent));
    expect(value, report("onAccent on accent", value, 3)).toBeGreaterThanOrEqual(3);
  });

  it("RAG states are not confusable with each other", () => {
    // Deliberately NOT a contrast-against-the-page assertion. These are fills,
    // the state is carried in each cell's accessible name rather than in the
    // colour, and in the Accenture themes the values are fixed by the client's
    // heatmap specification — Red Shade 1 on Black is 2.2:1 and it is not this
    // package's place to "fix" it.
    //
    // What genuinely matters in a heatmap is that critical cannot be mistaken
    // for high, so the test is mutual distance. Euclidean RGB is a crude
    // stand-in for perceptual difference, which is the right trade here: it
    // needs no colour-science dependency and it catches the failure that
    // actually happens, which is two states drifting onto the same swatch.
    //
    // The tightest legitimate pair is on-track against complete — "complete"
    // is deliberately a darker "on track" — at ~24 in the corporate palette,
    // so the floor sits just below it.
    const { status } = tokensFor(skin, mode);
    const entries = Object.entries(status);
    const tooClose: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [aName, aValue] = entries[i];
        const [bName, bValue] = entries[j];
        const a = parse(aValue);
        const b = parse(bValue);
        const distance = Math.sqrt(
          (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2,
        );
        if (distance < 18) {
          tooClose.push(`${aName} vs ${bName}: ${distance.toFixed(1)} (needs 18)`);
        }
      }
    }
    expect(tooClose).toEqual([]);
  });

  it("no RAG state is invisible against the page", () => {
    // A far lower bar than 3:1 on purpose, for the reasons above — but a cell
    // the same colour as the grid behind it is a bug in any palette.
    const { status } = tokensFor(skin, mode);
    const invisible: string[] = [];
    for (const [state, value] of Object.entries(status)) {
      const measured = ratio(parse(value), parse(page));
      if (measured < 1.5) {invisible.push(report(`${state} on page`, measured, 1.5));}
    }
    expect(invisible).toEqual([]);
  });
});
