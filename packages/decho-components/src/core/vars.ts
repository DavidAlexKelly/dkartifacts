/**
 * The token layer, expressed as CSS custom properties.
 *
 * This is the file that lets a component library have a design system without
 * having a dependency on one. Every recipe reads `VAR_TOKENS`, whose values
 * look like:
 *
 *     var(--decho-color-surface, #111318)
 *
 * Inside an element that declares the variable — @acc/decho-styling's
 * `tokens.css`, a `<DechoSurface tokens={…}>`, or any `style` a host wrote
 * itself — the variable wins and the components follow that theme. Outside
 * one, the fallback wins and the components are correct anyway. Neither case
 * needs a stylesheet to load, an import to resolve or a provider to be
 * remembered, which are the three ways component libraries fail inside a
 * Foundry custom widget.
 *
 * The fallbacks are generated (see `fallbacks.ts` and `scripts/gen-fallbacks.mjs`)
 * and their agreement with the styling package is a test, because a hand-kept
 * copy of somebody else's palette is precisely the drift these packages exist
 * to stop.
 *
 * The type names are kept from that package — `DechoTokenSet`, `DechoTone`,
 * `DechoColor` — because they are the same concepts and renaming them would
 * make a mechanical move look like a redesign.
 */

import type { CSSProperties } from "react";
import { BASE_TOKENS, VAR_TOKENS } from "./fallbacks.js";

export { BASE_TOKENS, VAR_TOKENS };

/** The shape of a token set: ten groups, string values. */
export type DechoTokens = typeof BASE_TOKENS;

/** `color` · `status` · `chart` · `space` · `radius` · `fontSize` · … */
export type DechoTokenGroup = keyof DechoTokens;

/**
 * A complete token set.
 *
 * Structurally identical to @acc/decho-styling's `DechoTokenSet`, so
 * `tokensFor("accenture-sap")` can be handed straight to any component that
 * takes `tokens` — without this package importing that one.
 */
export type DechoTokenSet = {
  [G in DechoTokenGroup]: { [K in keyof DechoTokens[G]]: string };
};

/** A colour token name: `surface`, `textMuted`, `accentSoft`, … */
export type DechoColor = keyof DechoTokens["color"] & string;

/** One of the seven RAG states. A *state*, not a look — see `DechoTone`. */
export type DechoStatus = keyof DechoTokens["status"] & string;

/**
 * The six tones.
 *
 * A closed set, and no colour prop anywhere in this package, because "danger
 * is the same red in every widget" is the entire proposition and an open
 * colour prop is how that quietly stops being true.
 */
export type DechoTone =
  | "neutral"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger";

/** Just the colours, for callers overriding a subtree's palette. */
export type DechoPalette = { [K in DechoColor]: string };

/**
 * The token set a recipe should use: an explicit one if given, otherwise the
 * variable-backed default.
 *
 * Passing `tokens` is the rare case — a component that must be themed without
 * an ancestor to inherit from, typically because the host renders it into a
 * portal. Everything else inherits.
 */
export function resolveTokens(tokens?: DechoTokenSet): DechoTokenSet {
  return tokens ?? VAR_TOKENS;
}

/** The foreground and wash a tone resolves to. */
export function toneColors(
  tone: DechoTone,
  colors: Record<string, string>,
): { fg: string; soft: string } {
  if (tone === "neutral") {
    return { fg: colors.textMuted, soft: colors.neutralSoft };
  }
  return { fg: colors[tone], soft: colors[`${tone}Soft`] };
}

/** The colour of a RAG state. */
export function statusColor(
  status: DechoStatus,
  tokens?: DechoTokenSet,
): string {
  return resolveTokens(tokens).status[status];
}

/**
 * The i-th chart series colour, wrapping at ten.
 *
 * Wrapping rather than returning `undefined`: an eleventh series should repeat
 * a colour, not render invisibly.
 */
export function chartSeries(index: number, tokens?: DechoTokenSet): string {
  const series = resolveTokens(tokens).chart;
  const names = [
    series.series1,
    series.series2,
    series.series3,
    series.series4,
    series.series5,
    series.series6,
    series.series7,
    series.series8,
    series.series9,
    series.series10,
  ];
  return names[((index % names.length) + names.length) % names.length];
}

/** `("color", "surfaceRaised")` → `"--decho-color-surface-raised"`. */
export function tokenVariableName(group: string, key: string): string {
  return `--decho-${kebab(group)}-${kebab(key)}`;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * A token set as CSS custom properties, ready to spread into a `style` prop.
 *
 * This is how an explicit theme reaches both deliveries at once: the variables
 * land on one element, the CSS classes below it inherit them, and so do the
 * inline recipes, because a recipe's value is a `var()` reference to the very
 * same name.
 *
 * Applied to an element, never to `:root` — a widget shares its page with
 * widgets it does not own, and a package that writes to `:root` restyles its
 * neighbours.
 */
export function tokenVariables(
  tokens: Partial<Record<DechoTokenGroup, Record<string, string>>>,
): CSSProperties {
  const style: Record<string, string> = {};
  for (const [group, entries] of Object.entries(tokens)) {
    if (entries == null) {continue;}
    for (const [key, value] of Object.entries(entries)) {
      if (value != null) {style[tokenVariableName(group, key)] = value;}
    }
  }
  // React has no index signature for custom properties but passes any `--*`
  // key straight through to the DOM. The cast is the standard one; the
  // alternative is making every call site do it.
  return style as CSSProperties;
}
