/**
 * Overriding the tokens for a subtree.
 *
 * The stylesheet declares the defaults on `:root`, which is the right place
 * for an application and the wrong place for a widget: a Foundry custom widget
 * is one of several on a page, and a package that writes to `:root` is a
 * package that restyles its neighbours. So overrides are expressed as an
 * inline style object and applied to an element, not to the document.
 *
 *   <div className="decho-root" style={themeVariables({ accent: "#b8862f" })}>
 *
 * Everything below that element — CSS classes and, through `withTheme`, the
 * inline recipes — picks the override up. Everything outside it is untouched.
 *
 * Colours only. Spacing, radii and type are what make two widgets look like
 * one product; the accent is what makes a customer's deployment look like
 * theirs. Opening up the first would let a host quietly rebuild the design
 * system a token at a time, which is the failure mode this package exists to
 * prevent.
 */

import type { CSSProperties } from "react";
import {
  type DechoColor,
  type DechoSkin,
  tokenVariableName,
  tokensFor,
} from "./tokens.js";

/** A partial colour palette: only the tokens a host actually wants to change. */
export type DechoColorOverrides = Partial<Record<DechoColor, string>>;

/**
 * The overrides as CSS custom properties, ready to spread into a `style` prop.
 *
 * Only the tokens passed in are emitted. Returning the whole palette would
 * work, but it puts thirty declarations in the DOM to change one and makes the
 * override invisible in devtools among the defaults.
 */
export function themeVariables(overrides: DechoColorOverrides): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      style[tokenVariableName("color", key)] = value;
    }
  }
  // React's CSSProperties has no index signature for custom properties, but
  // React itself passes any `--*` key straight through to the DOM. The cast is
  // the standard one; the alternative is making every call site do it.
  return style as CSSProperties;
}

/**
 * The palette the inline recipes should use.
 *
 * The CSS layer inherits overrides for free — that is what a custom property
 * is. Inline styles do not: a recipe returns literal values, so it has to be
 * told. Pass the result to any recipe's `palette` option, or ignore this
 * entirely and the recipes use the defaults.
 *
 * The skin comes second because it is the rarer thing to pass: the result is
 * that skin's palette with the overrides on top, so overriding the accent of
 * `modern` does not silently drag classic's greys along with it.
 */
export function withTheme(
  overrides: DechoColorOverrides = {},
  skin: DechoSkin = "classic",
): Record<DechoColor, string> {
  return { ...tokensFor(skin).color, ...stripUndefined(overrides) };
}

function stripUndefined(overrides: DechoColorOverrides): DechoColorOverrides {
  const out: DechoColorOverrides = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      out[key as DechoColor] = value;
    }
  }
  return out;
}
