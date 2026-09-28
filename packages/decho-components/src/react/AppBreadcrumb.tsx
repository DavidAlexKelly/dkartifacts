/**
 * The breadcrumb trail.
 *
 * Data in, `<nav><ol>` out. The markup matters more than the styling here:
 * `aria-label="Breadcrumb"` on the nav, an ordered list because the order is
 * the meaning, `aria-current="page"` on the last crumb, and the separators
 * `aria-hidden` so a screen reader reads "Plans, Exercise 12, Objectives"
 * rather than "Plans slash Exercise 12 slash Objectives".
 *
 * That is the argument for it being in the design system rather than in each
 * app: the visual part is six lines, and the part everybody gets wrong is the
 * other five.
 */

import React from "react";
import { breadcrumbSeparatorStyle, breadcrumbStyle } from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import { VAR_TOKENS } from "../core/vars.js";
import type { DechoTokenSet } from "../core/vars.js";

export interface Crumb {
  label: React.ReactNode;
  /** Omit on the last crumb — the page you are on is not a link. */
  href?: string;
  onClick?: () => void;
}

export interface AppBreadcrumbProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "onSelect"> {
  items: Crumb[];
  /** Defaults to "/". */
  separator?: React.ReactNode;
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function AppBreadcrumb({
  items,
  separator = "/",
  tokens,
  palette,
  style,
  ...rest
}: AppBreadcrumbProps): React.ReactElement {
  const styled = { tokens, palette };
  const colors = palette ?? VAR_TOKENS.color;

  return (
    <nav {...rest} aria-label="Breadcrumb" style={style}>
      <ol style={breadcrumbStyle(styled)}>
        {items.map((crumb, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index} style={item}>
              {index > 0 && (
                <span aria-hidden="true" style={breadcrumbSeparatorStyle(styled)}>
                  {separator}
                </span>
              )}

              {last || (crumb.href == null && crumb.onClick == null) ? (
                <span aria-current={last ? "page" : undefined} style={{ color: colors.text }}>
                  {crumb.label}
                </span>
              ) : (
                <a
                  href={crumb.href ?? "#"}
                  onClick={
                    crumb.onClick == null
                      ? undefined
                      : (e) => {
                          // A crumb with a handler and no href is a router
                          // link: stop the browser navigating to "#".
                          if (crumb.href == null) {
                            e.preventDefault();
                          }
                          crumb.onClick?.();
                        }
                  }
                  style={{ color: colors.link, textDecoration: "none" }}
                >
                  {crumb.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const item: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};
