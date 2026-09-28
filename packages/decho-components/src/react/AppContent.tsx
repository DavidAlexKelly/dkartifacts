/**
 * The scrolling content column.
 *
 * A `<main>`, because it is one — that is what puts "skip to content" and
 * screen-reader landmark navigation in the app for free.
 *
 * It owns the scrolling. Every layout bug in an app shell is ultimately an
 * argument about which element scrolls, and settling it here means a page
 * inside can be `height: 100%` without fighting the frame.
 */

import React from "react";
import { appBodyStyle, appContentStyle } from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import type { DechoTokenSet } from "../core/vars.js";

export interface AppContentProps extends React.HTMLAttributes<HTMLElement> {
  /** Above the content and outside the scroll — usually a breadcrumb. */
  header?: React.ReactNode;
  /**
   * Turns off the default padding and gap, for a page that must be
   * full-bleed: a map, or a table that provides its own chrome.
   */
  bleed?: boolean;
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function AppContent({
  header,
  bleed = false,
  tokens,
  palette,
  children,
  style,
  ...rest
}: AppContentProps): React.ReactElement {
  const styled = { tokens, palette };

  return (
    <main
      {...rest}
      style={{
        ...appContentStyle(styled),
        ...(bleed ? { padding: 0, gap: 0 } : {}),
        ...style,
      }}
    >
      {header}
      {children}
    </main>
  );
}

/**
 * The row that holds the sidebar and the content column.
 *
 * Exported alongside `AppContent` because it is the piece between the header
 * and these two, and giving it its own file would be filing for filing's sake:
 *
 *   <AppShell>
 *     <AppHeader />
 *     <AppBody>
 *       <AppSidebar />
 *       <AppContent />
 *     </AppBody>
 *   </AppShell>
 */
export interface AppBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Redundant against `HTMLAttributes`, and declared anyway: eslint's
   * react/prop-types cannot see through a bare alias to a built-in type, and
   * one honest line here is better than a disable comment.
   */
  style?: React.CSSProperties;
}

export function AppBody({
  children,
  style,
  ...rest
}: AppBodyProps): React.ReactElement {
  return (
    <div {...rest} style={{ ...appBodyStyle(), ...style }}>
      {children}
    </div>
  );
}
