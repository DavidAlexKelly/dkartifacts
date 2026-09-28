/**
 * The line above a section: a title, an optional sentence, actions on the right.
 *
 * In the estate this is in every migrated section and is a `<div>` with four
 * inline styles each time. Here it renders a real heading element, because a
 * page whose structure exists only as font sizes cannot be navigated by
 * anyone using a screen reader's heading list.
 *
 * `level` sets the element (`h2` by default) and `size` sets the look, so a
 * visually small header can still be the second-level heading it actually is —
 * the two being the same prop is why hand-rolled headers end up as `<div>`s.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

export interface SectionHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title" | "children"> {
  title: React.ReactNode;
  /** A sentence under the title. */
  description?: React.ReactNode;
  /** Right-aligned: a button, a filter, a count. */
  actions?: React.ReactNode;
  level?: 1 | 2 | 3 | 4;
  /** `label` is the 11px uppercase caption the dense panels use. */
  size?: "label" | "sm" | "md" | "lg";
  /** A hairline under the whole header. */
  divider?: boolean;
  tokens?: DechoTokenSet;
}

export function SectionHeader({
  title,
  description,
  actions,
  level = 2,
  size = "md",
  divider = false,
  tokens,
  style,
  ...rest
}: SectionHeaderProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const Heading = `h${level}` as "h1" | "h2" | "h3" | "h4";

  const label = size === "label";
  const fontSize = label
    ? t.fontSize.sm
    : size === "sm"
      ? t.fontSize.lg
      : size === "lg"
        ? 20
        : t.fontSize.xl;

  return (
    <div
      {...rest}
      style={{
        display: "flex",
        alignItems: description != null ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: t.space[4],
        paddingBottom: divider ? t.space[3] : undefined,
        borderBottom: divider ? `1px solid ${t.color.borderSubtle}` : undefined,
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Heading
          style={{
            margin: 0,
            fontSize,
            fontWeight: label ? 700 : 600,
            letterSpacing: label ? "0.05em" : undefined,
            textTransform: label ? "uppercase" : undefined,
            color: label ? t.color.textMuted : t.color.text,
            lineHeight: 1.25,
          }}
        >
          {title}
        </Heading>
        {description != null && (
          <p
            style={{
              margin: `${t.space[2]} 0 0`,
              fontSize: t.fontSize.md,
              lineHeight: 1.5,
              color: t.color.textMuted,
              maxWidth: "68ch",
            }}
          >
            {description}
          </p>
        )}
      </div>
      {actions != null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: t.space[3],
            flex: "0 0 auto",
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
