/**
 * The frame: header, body, sidebar, content, footer.
 *
 * It is a `DechoSurface` — so it carries the theme for everything inside and
 * paints the app background — plus the grid that makes the header and footer
 * fixed and the body the only thing that scrolls.
 *
 *     <AppShell tokens={tokensFor("accenture-sap")}>
 *       <AppHeader brand="Mission Control" />
 *       <AppBody>
 *         <AppSidebar>…</AppSidebar>
 *         <AppContent>…</AppContent>
 *       </AppBody>
 *       <AppFooter>v0.1.0</AppFooter>
 *     </AppShell>
 *
 * Composed rather than configured: there is no `sidebar={}` prop, because the
 * first app that needs two sidebars or a full-bleed map would have to fork a
 * component that owned the grid.
 */

import React from "react";
import { appShellStyle } from "../core/recipes.js";
import type { DechoTokenSet } from "../core/vars.js";
import { DechoSurface } from "./DechoSurface.js";

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The theme as values, from @acc/decho-styling's `tokensFor()`,
   * `withAccent()` or `defineTheme().tokens`. Omit for the base theme.
   */
  tokens?: DechoTokenSet;
  /** The theme as a name, for the CSS delivery. See `DechoSurface`. */
  theme?: string;
  /**
   * Paint the app background. On by default here — unlike `DechoSurface`,
   * which cannot assume it owns the page; a shell, by definition, does.
   */
  filled?: boolean;
}

export function AppShell({
  tokens,
  theme,
  filled = true,
  children,
  style,
  ...rest
}: AppShellProps): React.ReactElement {
  return (
    <DechoSurface
      {...rest}
      tokens={tokens}
      theme={theme}
      filled={filled}
      style={{ ...appShellStyle({ tokens }), ...style }}
    >
      {children}
    </DechoSurface>
  );
}
