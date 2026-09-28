/**
 * A card.
 *
 * Styled inline from the recipes rather than by class, so it renders correctly
 * in a host that never imported the stylesheet — which, in a Foundry custom
 * widget bundled by someone else's Vite config, is the case you cannot check
 * from in here.
 *
 * The hover state is React state for the same reason: inline styles have no
 * `:hover`. One `useState` per interactive card is cheap, and the alternative —
 * requiring the stylesheet for the affordance but not for the card — is the
 * kind of half-working that is worse than either.
 *
 * It is a `<div>` even when interactive. A card that responds to clicks needs a
 * role, a tabIndex and a key handler, and those belong to the caller, who knows
 * whether this is a button, a link or a row in a listbox: guessing produces
 * markup that passes the lint rule and fails the screen reader.
 */

import React, { useState } from "react";
import {
  cardFooterStyle,
  cardHeaderStyle,
  cardMetaStyle,
  cardStyle,
  cardTitleStyle,
} from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import type { DechoTokenSet, DechoTone } from "../core/vars.js";

// `title` is omitted from the DOM attributes and redefined: the HTML one is a
// tooltip string, ours is a heading that can be any node, and TypeScript is
// right to refuse to conflate them. Callers who want a tooltip can still pass
// one through — as `aria-label` or a wrapping element — and the common case
// (a heading) gets the shorter name.
export interface CardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Rendered as the header's first line. Omit for a card that is all body. */
  title?: React.ReactNode;
  /** The second line: counts, timestamps, a callsign. */
  meta?: React.ReactNode;
  /** Top-right of the header — a tag, an icon button, a menu. */
  actions?: React.ReactNode;
  /** Below a rule at the bottom of the card. */
  footer?: React.ReactNode;
  /** Adds the pointer and the hover lift. */
  interactive?: boolean;
  selected?: boolean;
  /** A 3px status stripe down the left edge. */
  tone?: DechoTone;
  /**
   * An explicit token set, from `tokensFor()`, `withAccent()` or
   * `defineTheme()`. Rarely needed: tokens are inherited as CSS custom
   * properties, so a `DechoSurface` above this is usually the answer.
   */
  tokens?: DechoTokenSet;
  /** From `withTheme()`, when this subtree overrides colours. */
  palette?: DechoPalette;
}

export function Card({
  title,
  meta,
  actions,
  footer,
  interactive = false,
  selected = false,
  tone,
  tokens,
  palette,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: CardProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      {...rest}
      style={{
        ...cardStyle({
          interactive,
          hovered,
          selected,
          tone,
          tokens,
          palette,
        }),
        // Caller's style last: a shared component that cannot be nudged is a
        // shared component people fork.
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
    >
      {(title != null || meta != null || actions != null) && (
        <div style={cardHeaderStyle({ tokens })}>
          <div style={{ minWidth: 0 }}>
            {title != null && <div style={cardTitleStyle({ tokens, palette })}>{title}</div>}
            {meta != null && <div style={cardMetaStyle({ tokens, palette })}>{meta}</div>}
          </div>
          {actions != null && <div style={actionsRow}>{actions}</div>}
        </div>
      )}

      {children}

      {footer != null && <div style={cardFooterStyle({ tokens, palette })}>{footer}</div>}
    </div>
  );
}

const actionsRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flex: "0 0 auto",
};
