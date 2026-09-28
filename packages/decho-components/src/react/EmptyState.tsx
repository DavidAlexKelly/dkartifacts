/**
 * Nothing to show, said deliberately.
 *
 * The most copied piece of markup in the estate after the progress bar: every
 * FloX widget renders its own "Connect a … object set in the widget
 * configuration" and the data-readiness panel has a third variant. They differ
 * only in wording, which is the one part a component should not own.
 *
 * `outlined` is the dashed-border version those widgets use for a *configured*
 * panel with no rows, as against an *unconfigured* one — a distinction worth
 * keeping, because the first is a data question and the second is a setup
 * mistake, and they need different words.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  /** The sentence that says what to do about it. */
  description?: React.ReactNode;
  /** A button, usually. */
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /** A dashed outline — "configured, but empty". */
  outlined?: boolean;
  /** One line, for an empty table cell or a narrow panel. */
  compact?: boolean;
  tokens?: DechoTokenSet;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  outlined = false,
  compact = false,
  tokens,
  children,
  style,
  ...rest
}: EmptyStateProps): React.ReactElement {
  const t = resolveTokens(tokens);

  return (
    <div
      {...rest}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? t.space[2] : t.space[3],
        padding: compact ? `${t.space[3]} ${t.space[4]}` : `${t.space[6]} ${t.space[5]}`,
        textAlign: "center",
        border: outlined ? `1px dashed ${t.color.border}` : undefined,
        borderRadius: outlined ? t.radius.lg : undefined,
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        color: t.color.textFaint,
        ...style,
      }}
    >
      {icon != null && (
        <span aria-hidden="true" style={{ fontSize: compact ? 16 : 22, opacity: 0.8 }}>
          {icon}
        </span>
      )}
      {title != null && (
        <div
          style={{
            fontSize: compact ? t.fontSize.md : t.fontSize.lg,
            fontWeight: 600,
            color: t.color.textMuted,
          }}
        >
          {title}
        </div>
      )}
      {description != null && (
        <div style={{ maxWidth: "46ch", lineHeight: 1.5 }}>{description}</div>
      )}
      {children}
      {action != null && <div style={{ marginTop: t.space[2] }}>{action}</div>}
    </div>
  );
}
