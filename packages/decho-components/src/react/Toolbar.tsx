/**
 * The bar above a table or a canvas: search, filters, counts, actions.
 *
 * `role="toolbar"` and nothing else clever. The reason it is a component
 * rather than a `<div style={{ display: "flex" }}>` is the wrapping: the
 * estate's toolbars are a row on a wide screen and a two-line mess in a narrow
 * Workshop pane, because a flex row with six children and no `flexWrap` and no
 * ordering decision degrades arbitrarily.
 *
 * `ToolbarSpacer` is the ordering decision: everything before it goes left,
 * everything after goes right, and the gap absorbs the width. That is one
 * concept to learn instead of `justify-content` arguments in six repos.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Names the toolbar for a screen reader: "Table actions". */
  label?: string;
  /** A hairline below, for a toolbar directly above a table. */
  divider?: boolean;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function Toolbar({
  label,
  divider = false,
  size = "md",
  tokens,
  children,
  style,
  ...rest
}: ToolbarProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const small = size === "sm";

  return (
    <div
      {...rest}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: small ? t.space[2] : t.space[3],
        padding: small ? `${t.space[2]} 0` : `${t.space[3]} 0`,
        borderBottom: divider ? `1px solid ${t.color.borderSubtle}` : undefined,
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        color: t.color.text,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Everything after this goes to the right-hand end. */
export function ToolbarSpacer(): React.ReactElement {
  return <span style={{ flex: "1 1 auto" }} />;
}

/**
 * A count, a total, "12 of 480 selected" — the text a toolbar carries between
 * its controls.
 *
 * `aria-live="polite"` because this is the element that changes when a filter
 * is applied: without it, a keyboard user presses a filter pill and nothing
 * announces that the table now has eleven rows.
 */
export interface ToolbarStatusProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  tokens?: DechoTokenSet;
}

export function ToolbarStatus({
  tokens,
  children,
  style,
  ...rest
}: ToolbarStatusProps): React.ReactElement {
  const t = resolveTokens(tokens);
  return (
    <span
      {...rest}
      aria-live="polite"
      style={{
        fontSize: t.fontSize.md,
        color: t.color.textMuted,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
