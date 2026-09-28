/**
 * A state as a dot, with the state in its accessible name.
 *
 * The estate draws these in three places — the dependency-flow cards, the
 * readiness scorecards, and inside its tags — and in all three the colour is
 * the only carrier of the meaning, which is exactly the thing that fails for a
 * colour-blind or screen-reader user. So the label is always present: visible
 * beside the dot if you pass `label`, and in an `aria-label` if you do not.
 */

import React from "react";
import {
  resolveTokens,
  toneColors,
  type DechoStatus,
  type DechoTokenSet,
  type DechoTone,
} from "../core/vars.js";
import { STATUS_LABEL } from "../core/labels.js";

export interface StatusDotProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** A RAG state. Wins over `tone`. */
  status?: DechoStatus;
  /** A tone, for the cases that are not a RAG state — "accent" for selected. */
  tone?: DechoTone;
  /** Rendered beside the dot. Omit and the state becomes the accessible name. */
  label?: React.ReactNode;
  size?: number;
  /**
   * A halo, from the theme's `shadow.dot` token — a glow in the dark themes
   * and nothing in the light ones, which is why it is a token rather than a
   * value here.
   */
  halo?: boolean;
  tokens?: DechoTokenSet;
}

export function StatusDot({
  status,
  tone = "neutral",
  label,
  size = 8,
  halo = false,
  tokens,
  style,
  ...rest
}: StatusDotProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const colour = status != null ? t.status[status] : toneColors(tone, t.color).fg;
  const name = status != null ? STATUS_LABEL[status] : undefined;

  const dot = (
    <span
      aria-hidden={label != null || name == null ? "true" : undefined}
      aria-label={label == null ? name : undefined}
      role={label == null && name != null ? "img" : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: colour,
        color: colour,
        // `currentColor` is why one token serves every state: the halo takes
        // the dot's own colour without the theme having to name seven of them.
        boxShadow: halo ? t.shadow.dot : undefined,
        flex: "0 0 auto",
        display: "inline-block",
      }}
    />
  );

  if (label == null) {return <span {...rest} style={style}>{dot}</span>;}

  return (
    <span
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        color: t.color.textMuted,
        ...style,
      }}
    >
      {dot}
      {label}
    </span>
  );
}
