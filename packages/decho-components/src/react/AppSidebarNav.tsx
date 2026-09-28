/**
 * The sidebar's navigation list, driven by data rather than by markup.
 *
 * Items are a flat array with an optional `group`, not a nested tree. Every
 * sidebar in this estate is one or two levels deep, a tree type costs every
 * caller a `children: []` they never populate, and grouping is what they
 * actually use. Contiguous items sharing a `group` are rendered under one
 * heading — so ordering the array is how you order the sidebar, with no
 * separate structure to keep in step.
 *
 * Rendering is delegated to `NavItem`, so a row here and a row in a hand-built
 * rail are the same row.
 */

import React from "react";
import { dotStyle, sectionLabelStyle } from "../core/recipes.js";
import type { DechoPalette, Styled } from "../core/recipes.js";
import type { DechoTokenSet, DechoTone } from "../core/vars.js";
import { NavItem } from "./NavItem.js";

export interface AppSidebarNavItem {
  /** Stable identity — also what `activeKey` matches and `onSelect` returns. */
  key: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Heading this item sits under. Contiguous items with the same one group. */
  group?: string;
  /** A status dot on the right. */
  tone?: DechoTone;
  /** Anything else for the right-hand side — a count, a chevron. */
  trailing?: React.ReactNode;
  disabled?: boolean;
}

export interface AppSidebarNavProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  items: AppSidebarNavItem[];
  activeKey?: string;
  onSelect?: (key: string) => void;
  /** Hides labels, descriptions and group headings; keeps the icon tiles. */
  collapsed?: boolean;
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

export function AppSidebarNav({
  items,
  activeKey,
  onSelect,
  collapsed = false,
  tokens,
  palette,
  style,
  ...rest
}: AppSidebarNavProps): React.ReactElement {
  const styled = { tokens, palette };

  return (
    <div {...rest} style={{ ...list, ...style }}>
      {items.map((item, index) => {
        // A heading is drawn when the group changes, which is why the array is
        // read in order rather than grouped up front: the caller's ordering is
        // the ordering, and an item moved is a heading moved.
        const previous = index > 0 ? items[index - 1] : undefined;
        const startsGroup =
          item.group != null && item.group !== previous?.group && !collapsed;

        return (
          <React.Fragment key={item.key}>
            {startsGroup && (
              <div style={{ ...sectionLabelStyle(styled), ...groupHeading }}>
                {item.group}
              </div>
            )}
            <NavItem
              label={collapsed ? "" : item.label}
              description={collapsed ? undefined : item.description}
              icon={item.icon}
              active={item.key === activeKey}
              disabled={item.disabled}
              trailing={
                collapsed
                  ? undefined
                  : (item.trailing ?? toneDot(item.tone, styled))
              }
              title={collapsed && typeof item.label === "string" ? item.label : undefined}
              onClick={() => onSelect?.(item.key)}
              {...styled}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * A bare status dot: the Tag's dot without its pill.
 *
 * Styled from the recipe rather than with the `.decho-dot` class, because the
 * components in this package must render correctly in a host that never
 * imported the stylesheet — one class here would quietly break that promise
 * for anyone whose sidebar happens to use tones.
 */
function toneDot(tone: DechoTone | undefined, styled: Styled): React.ReactNode {
  if (tone == null) {
    return undefined;
  }
  return <span style={dotStyle({ tone, ...styled })} />;
}

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const groupHeading: React.CSSProperties = {
  padding: "12px 12px 4px",
};
