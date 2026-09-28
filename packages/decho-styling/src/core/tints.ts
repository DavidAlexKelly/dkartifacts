/**
 * The opaque tints.
 *
 * A `*Soft` token is a wash — `rgba(161, 0, 255, 0.1)` — correct over a surface
 * you painted and wrong as a background, because then what shows through is the
 * page, and in a Foundry widget the page belongs to the host. Five widget sets
 * rendered near-black cards, rows and progress tracks for exactly that reason.
 *
 * SINCE 1.3.1 THESE ARE TOKENS
 * ----------------------------
 * `color.accentTint` and its five siblings are part of the token set, which
 * means they are CSS custom properties, which means they follow the **mode**.
 * Before, a tint was a value computed at import against the light surface, so a
 * widget in dark mode painted its selected rows a chalky light purple.
 *
 * They are still *derived* — the generator composites each wash over that
 * theme-and-mode's surface — so there is nothing to keep in step by hand.
 */

import { over } from "./color.js";
import {
  type DechoMode,
  type DechoSkin,
  type DechoTokenSet,
  tokensFor,
} from "./tokens.js";

export { over };

/** The six tones that have a soft partner, and therefore a tint. */
export type DechoTintName =
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

/**
 * The six opaque tints for a theme, and optionally a mode or a backdrop.
 *
 *     const tint = tintsFor("accenture-sap", "dark");
 *     <tr style={{ background: selected ? tint.accent : tokens.color.surface }}>
 *
 *     // a tint on a raised card rather than on the panel
 *     const onRaised = tintsFor(theme, { over: tokens.color.surfaceRaised });
 *
 * The second argument stays what it was — a backdrop — and additionally takes a
 * mode, because "dark" is the thing callers were reaching for when they passed
 * `tokens.color.surface` by hand. Both spellings are accepted so that nothing
 * written against 1.2 has to change.
 *
 * In a widget, prefer the token itself — `var(--decho-color-accent-tint)` or
 * `tokens.color.accentTint` — because a reference follows the mode while a
 * value taken from here is fixed at the moment it was read.
 */
export function tintsFor(
  theme: DechoSkin | DechoTokenSet = "classic",
  modeOrBackdrop?: DechoMode | string | { mode?: DechoMode; over?: string },
): Record<DechoTintName, string> {
  const options =
    typeof modeOrBackdrop === "string"
      ? modeOrBackdrop === "light" || modeOrBackdrop === "dark"
        ? { mode: modeOrBackdrop as DechoMode }
        : { over: modeOrBackdrop }
      : (modeOrBackdrop ?? {});

  const tokens = typeof theme === "string" ? tokensFor(theme, options.mode) : theme;

  // No backdrop named: read the tokens, which the token set derived against its
  // own surface — and which, in a widget, are CSS custom properties.
  if (options.over == null) {
    return {
      accent: tokens.color.accentTint,
      info: tokens.color.infoTint,
      success: tokens.color.successTint,
      warning: tokens.color.warningTint,
      danger: tokens.color.dangerTint,
      neutral: tokens.color.neutralTint,
    };
  }

  const backdrop = options.over;
  return {
    accent: over(tokens.color.accentSoft, backdrop),
    info: over(tokens.color.infoSoft, backdrop),
    success: over(tokens.color.successSoft, backdrop),
    warning: over(tokens.color.warningSoft, backdrop),
    danger: over(tokens.color.dangerSoft, backdrop),
    neutral: over(tokens.color.neutralSoft, backdrop),
  };
}

/**
 * True if a colour would paint nothing on its own — i.e. it needs a backdrop.
 *
 * What `decho check` and the `no-wash-background` lint rule are really asking.
 */
export function isTranslucent(color: string): boolean {
  // Re-derived rather than imported from color.ts to keep that module free of
  // anything that is not colour maths.
  return over(color, "#000000") !== color;
}
