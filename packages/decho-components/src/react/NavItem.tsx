/**
 * A row in a navigation rail: icon tile, label, one line of description.
 *
 * Here because it is the shape every operational sidebar in this project keeps
 * rebuilding by hand, and because it is where a skin shows most: the active row
 * is a tinted rectangle in `classic` and a lit one — washed from its accent
 * edge, with a coloured shadow — in `modern`.
 *
 * A `<button>`, not a styled `<div>`. Navigation rows are activated by keyboard
 * as often as by pointer, and the element that already does that correctly is
 * the one the browser ships. `aria-current="page"` marks the active row for a
 * screen reader, since colour alone does not.
 */

import React, { useState } from "react";
import {
  navDescriptionStyle,
  navIconStyle,
  navItemStyle,
  navLabelStyle,
} from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import type { DechoTokenSet } from "../core/vars.js";

export interface NavItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  label: React.ReactNode;
  /** The second line. Omit for a single-line row. */
  description?: React.ReactNode;
  /** Whatever goes in the tile: an SVG, a Blueprint icon, a letter. */
  icon?: React.ReactNode;
  active?: boolean;
  /** Right-hand side — a status dot, a tag, a chevron. */
  trailing?: React.ReactNode;
  /**
   * An explicit token set, from `tokensFor()`, `withAccent()` or
   * `defineTheme()`. Rarely needed: tokens are inherited as CSS custom
   * properties, so a `DechoSurface` above this is usually the answer.
   */
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function NavItem({
  label,
  description,
  icon,
  active = false,
  trailing,
  tokens,
  palette,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: NavItemProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const styled = { tokens, palette };

  return (
    <button
      {...rest}
      type="button"
      aria-current={active ? "page" : undefined}
      style={{ ...navItemStyle({ active, hovered, ...styled }), ...style }}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e);
      }}
    >
      {icon != null && <span style={navIconStyle({ active, ...styled })}>{icon}</span>}

      <span style={text}>
        <span style={navLabelStyle(styled)}>{label}</span>
        {description != null && (
          <span style={navDescriptionStyle(styled)}>{description}</span>
        )}
      </span>

      {trailing != null && <span style={trailingSlot}>{trailing}</span>}
    </button>
  );
}

const text: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minWidth: 0,
};

const trailingSlot: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flex: "0 0 auto",
};
