/**
 * A button.
 *
 * Four variants, two sizes, and a 28px icon-only square that matches the map
 * toolbars this project already ships — a control added beside one should not
 * be two pixels off, which is the difference between "part of the product" and
 * "bolted on".
 *
 * Hover and focus are React state because the styles are inline; `disabled` is
 * a real attribute, so the button is unclickable and announced as disabled
 * rather than merely faded.
 */

import React, { useState } from "react";
import { buttonStyle, focusRingStyle } from "../core/recipes.js";
import type { DechoButtonVariant, DechoPalette } from "../core/recipes.js";
import type { DechoTokenSet } from "../core/vars.js";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: DechoButtonVariant;
  size?: "sm" | "md";
  /** A square button holding one icon. Give it an `aria-label`. */
  iconOnly?: boolean;
  /** Pressed/selected — a toggle that is currently on. */
  active?: boolean;
  /**
   * Defaults to "button". Submits are opt-in: a bare <button> inside a form
   * submits it, which is never what a toolbar control meant to do.
   */
  type?: "button" | "submit" | "reset";
  /**
   * An explicit token set, from `tokensFor()`, `withAccent()` or
   * `defineTheme()`. Rarely needed: tokens are inherited as CSS custom
   * properties, so a `DechoSurface` above this is usually the answer.
   */
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function Button({
  variant = "default",
  size = "md",
  iconOnly = false,
  active = false,
  type = "button",
  tokens,
  palette,
  disabled = false,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...rest
}: ButtonProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      style={{
        ...buttonStyle({
          variant,
          size,
          iconOnly,
          active,
          hovered,
          disabled,
          tokens,
          palette,
        }),
        ...(focused && !disabled
          ? focusRingStyle({ tokens, palette })
          : {}),
        ...style,
      }}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
    >
      {children}
    </button>
  );
}
