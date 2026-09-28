/**
 * The application footer.
 *
 * Left and right slots, and that is the whole component: a build number and an
 * environment badge on one side, links or a classification marking on the
 * other. Small, but shared, because a footer that is 8px taller in one app
 * than another is exactly the sort of difference nobody reports and everybody
 * notices.
 */

import React from "react";
import { appFooterStyle } from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import type { DechoTokenSet } from "../core/vars.js";

export interface AppFooterProps extends React.HTMLAttributes<HTMLElement> {
  /** Right-hand end. Children fill the left. */
  actions?: React.ReactNode;
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function AppFooter({
  actions,
  tokens,
  palette,
  children,
  style,
  ...rest
}: AppFooterProps): React.ReactElement {

  return (
    <footer
      {...rest}
      style={{ ...appFooterStyle({ tokens, palette }), ...style }}
    >
      <div style={slot}>{children}</div>
      {actions != null && <div style={slot}>{actions}</div>}
    </footer>
  );
}

const slot: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};
