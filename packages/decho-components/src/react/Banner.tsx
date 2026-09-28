/**
 * The page-level "this failed, and here is what to do" surface.
 *
 * `Callout` already exists and is editorial: a note inside the content, sized
 * to a paragraph. A banner is different furniture — it sits above the content,
 * it is about the *state of the view* rather than about the subject matter,
 * and it usually carries a diagnostic and an action.
 *
 * WHY THE DIAGNOSTIC IS A FIRST-CLASS PROP
 * ----------------------------------------
 * Because the alternative is what happens today: a widget shows "Something
 * went wrong", the request id goes to the browser console, and the user
 * reports "it's broken" with a screenshot of a grey box. A copyable id turns a
 * three-day thread into one message. It is collapsed by default, because it is
 * for the report rather than for the reader.
 */

import React from "react";
import { resolveTokens, toneColors, type DechoTokenSet, type DechoTone } from "../core/vars.js";
import { monoStyle } from "../core/recipes.js";
import { Icon, type DechoIconName } from "./Icon.js";

const TONE_ICON: Record<string, DechoIconName> = {
  success: "check",
  danger: "warning",
  warning: "warning",
  info: "info",
  accent: "info",
  neutral: "info",
};

export interface BannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: DechoTone;
  title?: React.ReactNode;
  /** Buttons: Retry, Reload, Contact support. */
  actions?: React.ReactNode;
  /** A ✕ that calls `onDismiss`. Absent without a handler — see below. */
  onDismiss?: () => void;
  /**
   * The technical detail: a request id, a stack, a response body.
   *
   * Rendered in a `<details>` and selectable. Never the main message: a user
   * should not have to read a stack trace to learn that a save failed.
   */
  diagnostic?: string;
  /** Interrupt a screen reader. For a failure that invalidates the view. */
  assertive?: boolean;
  tokens?: DechoTokenSet;
}

export function Banner({
  tone = "info",
  title,
  actions,
  onDismiss,
  diagnostic,
  assertive = false,
  tokens,
  children,
  style,
  ...rest
}: BannerProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const colors = toneColors(tone, t.color);
  const icon = TONE_ICON[tone] ?? "info";

  // An opaque tint rather than the `*Soft` wash: a banner is a background, and
  // a wash over an unpainted host page takes the host's colour — the bug that
  // made five widget sets render black cards.
  const tint =
    tone === "neutral"
      ? t.color.neutralTint
      : tone === "accent"
        ? t.color.accentTint
        : t.color[`${tone}Tint` as const];

  return (
    <div
      {...rest}
      // `alert` interrupts; `status` waits its turn. Default is the polite one,
      // because most banners are informational and an assertive region that
      // fires on render cuts off whatever was being read.
      role={assertive ? "alert" : "status"}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: t.space[4],
        padding: `${t.space[5]} ${t.space[5]}`,
        background: tint,
        border: `1px solid ${t.color.border}`,
        borderLeft: `3px solid ${colors.fg}`,
        borderRadius: t.radius.md,
        color: t.color.text,
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        ...style,
      }}
    >
      <Icon name={icon} size={16} style={{ color: colors.fg, marginTop: 1 }} />

      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: t.space[3] }}>
        {title != null && (
          <div style={{ fontWeight: 600, lineHeight: 1.35 }}>{title}</div>
        )}
        {children != null && <div style={{ lineHeight: 1.5 }}>{children}</div>}

        {diagnostic != null && (
          <details>
            <summary
              style={{
                cursor: "pointer",
                fontSize: t.fontSize.sm,
                color: t.color.textMuted,
              }}
            >
              Technical detail
            </summary>
            <pre
              style={{
                ...monoStyle({ tokens }),
                margin: `${t.space[3]} 0 0`,
                padding: t.space[4],
                background: t.color.surface,
                border: `1px solid ${t.color.borderSubtle}`,
                borderRadius: t.radius.sm,
                fontSize: t.fontSize.sm,
                // Wrapped rather than scrolled: a request id that needs
                // horizontal scrolling to be read is a request id nobody
                // copies into a ticket.
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                // `user-select` explicitly on, because a host that has turned
                // selection off for its own reasons would otherwise make this
                // uncopyable, which defeats the point of it.
                userSelect: "text",
              }}
            >
              {diagnostic}
            </pre>
          </details>
        )}

        {actions != null && (
          <div style={{ display: "flex", gap: t.space[3], flexWrap: "wrap" }}>{actions}</div>
        )}
      </div>

      {onDismiss != null && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            display: "flex",
            padding: 2,
            border: "none",
            background: "transparent",
            color: t.color.textFaint,
            cursor: "pointer",
          }}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}
