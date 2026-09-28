/**
 * A panel: a titled box that owns its own scrolling.
 *
 * The layout is the reason this exists rather than "a card with a header".
 * `min-height: 0` on the body and `flex: 0 0 auto` on the header are what stop
 * a long list from pushing the header out of the box, and every widget that
 * has ever grown a sidebar has rediscovered that the hard way.
 *
 * `overlay` is the version that floats over a map — translucent, blurred, and
 * the same surface `@acc/decho-basemap`'s toolbar uses, so a panel and a
 * toolbar on the same map read as one product.
 */

import React from "react";
import { panelBodyStyle, panelHeaderStyle, panelStyle } from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import type { DechoTokenSet } from "../core/vars.js";

// `title` omitted and redefined for the reason Card.tsx gives: the HTML
// attribute is a tooltip string, this one is a heading node.
export interface PanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  /** Top-right of the header — a close button, a count, a toggle. */
  actions?: React.ReactNode;
  /** Translucent and blurred, for a panel over a map. */
  overlay?: boolean;
  /** The body scrolls rather than the panel growing. Usually what you want. */
  scroll?: boolean;
  /** Style the body wrapper — padding, display, and so on. */
  bodyStyle?: React.CSSProperties;
  /**
   * An explicit token set, from `tokensFor()`, `withAccent()` or
   * `defineTheme()`. Rarely needed: tokens are inherited as CSS custom
   * properties, so a `DechoSurface` above this is usually the answer.
   */
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function Panel({
  title,
  actions,
  overlay = false,
  scroll = false,
  bodyStyle,
  tokens,
  palette,
  children,
  style,
  ...rest
}: PanelProps): React.ReactElement {

  return (
    <div
      {...rest}
      style={{ ...panelStyle({ overlay, tokens, palette }), ...style }}
    >
      {(title != null || actions != null) && (
        <div style={panelHeaderStyle({ tokens, palette })}>
          <span>{title}</span>
          {actions}
        </div>
      )}
      <div
        style={{
          ...panelBodyStyle({ scroll, tokens, palette }),
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
