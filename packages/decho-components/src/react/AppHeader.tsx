/**
 * The application header.
 *
 * A `<header>` with three slots — brand, then whatever the app puts in the
 * middle, then actions on the right. It does not know about routing, user
 * menus or notifications: those are the app's, and a header component that
 * knows about them is one that has to be forked the first time an app has a
 * different idea about any of the three.
 */

import React from "react";
import { appBrandStyle, appHeaderStyle } from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import type { DechoTokenSet } from "../core/vars.js";

export interface AppHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Product name, wordmark, or a mark plus a name. */
  brand?: React.ReactNode;
  /** Pushed to the right-hand end — actions, status, an avatar. */
  actions?: React.ReactNode;
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function AppHeader({
  brand,
  actions,
  tokens,
  palette,
  children,
  style,
  ...rest
}: AppHeaderProps): React.ReactElement {
  const styled = { tokens, palette };

  return (
    <header {...rest} style={{ ...appHeaderStyle(styled), ...style }}>
      {brand != null && <div style={appBrandStyle(styled)}>{brand}</div>}
      {/* The middle takes the slack, so `actions` sits hard right whether or
          not anything was passed as children. */}
      <div style={middle}>{children}</div>
      {actions != null && <div style={actionsSlot}>{actions}</div>}
    </header>
  );
}

const middle: React.CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const actionsSlot: React.CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: 8,
};
