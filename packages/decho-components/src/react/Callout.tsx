/**
 * A tone-coloured note: a caveat, an error, a "this is demo data".
 *
 * Two implementations in the estate — the amber `Caveat` with its left rule
 * and the red `ErrorNote` — which are the same component with a different
 * tone, so they are one component with a `tone`.
 *
 * `tone="danger"` gets `role="alert"`, and the others get nothing, which is
 * the distinction that matters: an alert interrupts a screen reader, and a
 * caveat that interrupts every time the page re-renders is worse than one
 * nobody hears.
 */

import React from "react";
import {
  resolveTokens,
  toneColors,
  type DechoTokenSet,
  type DechoTone,
} from "../core/vars.js";

export interface CalloutProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: DechoTone;
  /**
   * The bold first line. Redefined rather than inherited: the HTML `title` is
   * a tooltip string and this is a heading that can be any node — the same
   * distinction `Card` makes, for the same reason.
   */
  title?: React.ReactNode;
  /** A glyph. Decorative: the tone is carried by the title, not the icon. */
  icon?: React.ReactNode;
  /** Forces the ARIA role, for a message that must (or must not) interrupt. */
  role?: React.AriaRole;
  tokens?: DechoTokenSet;
}

export function Callout({
  tone = "info",
  title,
  icon,
  role,
  tokens,
  children,
  style,
  ...rest
}: CalloutProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const { fg, soft } = toneColors(tone, t.color);

  return (
    <div
      {...rest}
      role={role ?? (tone === "danger" ? "alert" : undefined)}
      style={{
        display: "flex",
        gap: t.space[3],
        padding: `${t.space[3]} ${t.space[4]}`,
        backgroundColor: soft,
        // The rule, not a full border: the estate's caveats are a left edge,
        // and a box of wash with a box of border round it reads as a dialog.
        borderLeft: `3px solid ${fg}`,
        borderRadius: `0 ${t.radius.md} ${t.radius.md} 0`,
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        lineHeight: 1.5,
        color: t.color.text,
        ...style,
      }}
    >
      {icon != null && (
        <span aria-hidden="true" style={{ color: fg, flex: "0 0 auto", lineHeight: 1.4 }}>
          {icon}
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        {title != null && (
          <div style={{ fontWeight: 600, color: fg, marginBottom: children != null ? 2 : 0 }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
