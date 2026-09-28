/**
 * "This is not real data."
 *
 * A small component for a real governance problem: every one of these widgets
 * has been demoed with sample data, and a screenshot of a demo is
 * indistinguishable from a screenshot of production once it is in a deck. The
 * estate's answer was a `DemoDataBadge`, and it is worth keeping for the same
 * reason it was written.
 *
 * Three things it does that a `<span>Demo</span>` does not:
 *
 *   - `role="note"`, so it is announced rather than being a decorative word.
 *   - The reason travels with it — "figures are illustrative; the object set
 *     is a sample of 40" — as a tooltip and as the accessible name, so the
 *     caveat is attached to the claim rather than living in a footnote.
 *   - `warning` rather than `neutral`, because it needs to survive being
 *     skim-read. A grey badge is furniture; an amber one is a statement.
 */

import React from "react";
import { resolveTokens, toneColors, type DechoTokenSet } from "../core/vars.js";

export interface DemoDataBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Defaults to "Demo data". */
  label?: string;
  /** Why, and how far it is untrue. Becomes the tooltip and the full name. */
  reason?: string;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function DemoDataBadge({
  label = "Demo data",
  reason,
  size = "sm",
  tokens,
  style,
  ...rest
}: DemoDataBadgeProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const { fg, soft } = toneColors("warning", t.color);
  const small = size === "sm";

  return (
    <span
      {...rest}
      role="note"
      title={reason}
      aria-label={reason != null ? `${label}: ${reason}` : label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: small ? "1px 7px" : "2px 9px",
        borderRadius: t.radius.pill,
        border: `1px dashed ${fg}`,
        backgroundColor: soft,
        color: fg,
        fontFamily: t.fontFamily.sans,
        fontSize: small ? t.fontSize.xs : t.fontSize.sm,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {/* Dashed, not solid: the border is doing the same job as the word, for
          anyone scanning a screenshot at a distance. */}
      {label}
    </span>
  );
}
