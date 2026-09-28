/**
 * The application sidebar.
 *
 * A `<nav>` column with an optional brand block at the top, a scrolling middle,
 * and an optional footer pinned to the bottom — usually the collapse toggle.
 *
 * `collapsed` narrows it to 64px rather than unmounting it: the icons stay, the
 * labels go, and because the width is a transition rather than a remount the
 * scroll position and any open state survive. `AppSidebarNav` reads the same
 * flag, so the two stay in step.
 */

import React from "react";
import { appBrandStyle, appSidebarStyle } from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import type { DechoTokenSet } from "../core/vars.js";

export interface AppSidebarProps extends React.HTMLAttributes<HTMLElement> {
  brand?: React.ReactNode;
  /** Pinned to the bottom — the collapse toggle, a version string. */
  footer?: React.ReactNode;
  /** Expanded width in px. Ignored while collapsed. Defaults to 260. */
  width?: number;
  collapsed?: boolean;
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function AppSidebar({
  brand,
  footer,
  width,
  collapsed = false,
  tokens,
  palette,
  children,
  style,
  ...rest
}: AppSidebarProps): React.ReactElement {
  const styled = { tokens, palette };

  return (
    <nav
      {...rest}
      style={{ ...appSidebarStyle({ ...styled, width, collapsed }), ...style }}
    >
      {brand != null && (
        <div style={{ ...appBrandStyle(styled), ...brandBlock }}>{brand}</div>
      )}

      {/* minHeight: 0 so a long nav scrolls here rather than pushing the
          footer off the bottom of the column. */}
      <div style={scrollArea}>{children}</div>

      {footer != null && <div style={footerBlock}>{footer}</div>}
    </nav>
  );
}

const brandBlock: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "12px 12px 8px",
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const scrollArea: React.CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowX: "hidden",
  overflowY: "auto",
  padding: 8,
};

const footerBlock: React.CSSProperties = {
  flex: "0 0 auto",
  padding: 8,
};
