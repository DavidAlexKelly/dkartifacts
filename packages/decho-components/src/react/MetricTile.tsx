/**
 * One number, with a word for it.
 *
 * Five implementations in the estate — `MetricTile`, the data-readiness metric
 * card, the RICEFW summary, the gating summary, and `KpiTile`, which is
 * different enough to stay its own component.
 *
 * Three details are load-bearing and were arrived at the hard way in those
 * widgets, so they are defaults here rather than options: the value is
 * `tabular-nums` (a figure that changes on a poll should not reflow), the
 * label is uppercase and small (it is a caption, not a heading), and the whole
 * tile is `flex: 1 1 0` with a `minWidth` (a strip of them should share the
 * row and wrap rather than squeeze).
 */

import React, { useState } from "react";
import {
  resolveTokens,
  toneColors,
  type DechoTokenSet,
  type DechoTone,
} from "../core/vars.js";

export interface MetricTileProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "onClick"> {
  /** The caption under the value. Uppercased by the style, not by you. */
  label: React.ReactNode;
  value: React.ReactNode;
  /** A third line: a delta, a denominator, "as at 09:00". */
  note?: React.ReactNode;
  /** Colours the value. Omit for plain text — most tiles are not a judgement. */
  tone?: DechoTone;
  /** Makes it a button. Hover and selection affordances come with it. */
  onClick?: () => void;
  selected?: boolean;
  tokens?: DechoTokenSet;
}

export function MetricTile({
  label,
  value,
  note,
  tone,
  onClick,
  selected = false,
  tokens,
  style,
  ...rest
}: MetricTileProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [hovered, setHovered] = useState(false);
  const interactive = onClick != null;
  const accent = tone != null ? toneColors(tone, t.color) : undefined;

  const body = (
    <>
      <div
        style={{
          fontSize: 26,
          lineHeight: 1.05,
          fontWeight: 700,
          color: accent?.fg ?? t.color.text,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: t.fontSize.sm,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: t.color.textMuted,
        }}
      >
        {label}
      </div>
      {note != null && (
        <div
          style={{
            marginTop: 4,
            fontSize: t.fontSize.sm,
            color: t.color.textFaint,
          }}
        >
          {note}
        </div>
      )}
    </>
  );

  const shared: React.CSSProperties = {
    flex: "1 1 0",
    minWidth: 150,
    padding: "14px 16px",
    textAlign: "left",
    borderRadius: t.radius.lg,
    backgroundColor: selected
      ? (accent?.soft ?? t.color.accentSoft)
      : t.color.surface,
    border: `1px solid ${selected ? (accent?.fg ?? t.color.accent) : t.color.borderSubtle}`,
    boxShadow: hovered && interactive ? t.shadow.cardHover : t.shadow.card,
    fontFamily: t.fontFamily.sans,
    transition: `box-shadow ${t.effect.transition}, background-color ${t.effect.transition}`,
    ...style,
  };

  // A real <button> when it does something, a <div> when it does not. The
  // alternative — a div with onClick — is the commonest way a dashboard ends
  // up unusable from the keyboard.
  if (interactive) {
    return (
      <button
        {...(rest as React.HTMLAttributes<HTMLButtonElement>)}
        type="button"
        aria-pressed={selected}
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
