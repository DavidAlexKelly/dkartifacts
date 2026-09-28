/**
 * A KPI tile: an icon, a caption, a number, and a coloured top edge.
 *
 * Kept separate from `MetricTile` rather than folded into it as a variant,
 * because the divergence in the estate was deliberate and recorded: the
 * four-line metric tile pushed a strip of them below the fold on a 900px-tall
 * Workshop pane, and this is the answer that fitted — shorter, with the icon
 * carrying what the third line used to say.
 *
 * `compact` is the same tile at the size the process-review header uses.
 *
 * The icon tile's wash is the `accentSoft` token, not the accent at 10%
 * opacity. The estate wrote `${accent}18`, appending alpha to a hex string,
 * which cannot survive a value that might be `var(--decho-color-accent, …)` —
 * and `accentSoft` is the token that already means "the accent, quietly".
 */

import React, { useState } from "react";
import {
  resolveTokens,
  toneColors,
  type DechoTokenSet,
  type DechoTone,
} from "../core/vars.js";

export interface KpiTileProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "onClick"> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** A glyph or a small node. Rendered in a washed square. */
  icon?: React.ReactNode;
  /** Colours the top edge and the icon wash. Defaults to `accent`. */
  tone?: DechoTone;
  compact?: boolean;
  onClick?: () => void;
  active?: boolean;
  tokens?: DechoTokenSet;
}

export function KpiTile({
  label,
  value,
  icon,
  tone = "accent",
  compact = false,
  onClick,
  active = false,
  tokens,
  style,
  ...rest
}: KpiTileProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [hovered, setHovered] = useState(false);
  const { fg, soft } = toneColors(tone, t.color);
  const interactive = onClick != null;

  const shared: React.CSSProperties = {
    position: "relative",
    flex: "1 1 0",
    minWidth: compact ? 116 : 156,
    padding: compact ? "9px 12px" : "15px 17px",
    textAlign: "left",
    borderRadius: t.radius.lg,
    backgroundColor: active ? soft : t.color.surface,
    border: `1px solid ${t.color.borderSubtle}`,
    // The top edge is the tile's signature in this estate. 3px, tone-coloured,
    // and it is a border rather than a background layer because it must sit
    // inside the radius on all four corners.
    borderTop: `3px solid ${fg}`,
    boxShadow: hovered && interactive ? t.shadow.cardHover : t.shadow.card,
    transform: hovered && interactive ? "translateY(-1px)" : undefined,
    fontFamily: t.fontFamily.sans,
    transition: `box-shadow ${t.effect.transition}, transform ${t.effect.transition}, background-color ${t.effect.transition}`,
    ...style,
  };

  const body = (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 10 }}>
      {icon != null && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: compact ? 19 : 24,
            height: compact ? 19 : 24,
            borderRadius: t.radius.md,
            backgroundColor: soft,
            color: fg,
            fontSize: compact ? 11 : 13,
            flex: "0 0 auto",
          }}
        >
          {icon}
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 9.5 : 10.5,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: t.color.textMuted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: compact ? 1 : 3,
            fontSize: compact ? 18 : 27,
            lineHeight: 1.05,
            fontWeight: 700,
            color: t.color.text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );

  if (interactive) {
    return (
      <button
        {...(rest as React.HTMLAttributes<HTMLButtonElement>)}
        type="button"
        aria-pressed={active}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ ...shared, cursor: "pointer", font: "inherit" }}
      >
        {body}
      </button>
    );
  }

  return (
    <div {...rest} style={shared}>
      {body}
    </div>
  );
}
