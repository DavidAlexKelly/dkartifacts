/**
 * Copy, download, refresh — and the filter summary.
 *
 * Small, unglamorous, and in tier one because each is written from scratch in
 * every widget that needs it, usually without the part that makes it work:
 *
 *   - `CopyButton` without the confirmation, so the user cannot tell whether
 *     the click did anything. (And with `document.execCommand("copy")`, which
 *     is deprecated, in the two oldest widgets.)
 *   - `RefreshButton` without a busy state, so it can be pressed five times
 *     and fire five overlapping requests.
 *   - `FilterSummary` not at all, which is why "why am I seeing twelve rows"
 *     is the most common question about every table in the estate.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle } from "../core/recipes.js";
import { Icon, type DechoIconName } from "./Icon.js";

interface IconButtonProps {
  label: string;
  icon: DechoIconName;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Show the label next to the icon rather than only to assistive tech. */
  showLabel?: boolean;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

function IconButton({
  label,
  icon,
  onClick,
  disabled = false,
  busy = false,
  showLabel = false,
  size = "sm",
  tokens,
}: IconButtonProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);
  const off = disabled || busy;

  return (
    <button
      type="button"
      // Both: `aria-label` when there is no text, and `title` so a sighted
      // mouse user gets the same information on hover.
      aria-label={showLabel ? undefined : label}
      title={label}
      aria-busy={busy ? true : undefined}
      disabled={off}
      onClick={onClick}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: t.space[3],
        padding: showLabel ? `${t.space[2]} ${t.space[4]}` : t.space[2],
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.sm,
        background: t.color.surface,
        color: off ? t.color.textFaint : t.color.text,
        font: "inherit",
        fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
        cursor: busy ? "progress" : off ? "not-allowed" : "pointer",
        outline: "none",
        ...(focused ? focusRingStyle({ tokens }) : {}),
      }}
    >
      <Icon name={icon} size={size === "sm" ? 13 : 14} />
      {showLabel && label}
    </button>
  );
}

export interface CopyButtonProps {
  /** What goes on the clipboard. */
  value: string;
  /** What it is, for the label and the confirmation: "request id", "SIDC". */
  what?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  onCopied?: () => void;
  tokens?: DechoTokenSet;
}

/**
 * Copy, with a confirmation the user can actually see.
 *
 * `navigator.clipboard` with no fallback to `execCommand`: the deprecated API
 * requires a synchronous selection dance that fails in a widget iframe anyway,
 * and pretending to copy is worse than saying it did not work. In a context
 * where the clipboard is unavailable the button reports the failure rather
 * than silently doing nothing.
 */
export function CopyButton({
  value,
  what = "value",
  showLabel = false,
  size = "sm",
  onCopied,
  tokens,
}: CopyButtonProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current != null) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );

  const flash = (next: "copied" | "failed"): void => {
    setState(next);
    if (timer.current != null) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => setState("idle"), 1800);
  };

  const copy = (): void => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        flash("copied");
        onCopied?.();
      })
      .catch(() => flash("failed"));
    if (navigator.clipboard == null) {
      flash("failed");
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: t.space[3] }}>
      <IconButton
        label={state === "copied" ? `${what} copied` : `Copy ${what}`}
        icon={state === "copied" ? "check" : "copy"}
        onClick={copy}
        showLabel={showLabel}
        size={size}
        tokens={tokens}
      />
      {/*
        A live region rather than a tooltip: the confirmation has to reach
        somebody who is not looking at the button, and a `title` change is
        announced by nothing.
      */}
      <span
        role="status"
        aria-live="polite"
        style={{
          fontSize: t.fontSize.sm,
          color: state === "failed" ? t.color.danger : t.color.success,
        }}
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : ""}
      </span>
    </span>
  );
}

export interface DownloadButtonProps {
  /** Called when pressed. Async so the button can show progress. */
  onDownload: () => void | Promise<void>;
  label?: string;
  showLabel?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function DownloadButton({
  onDownload,
  label = "Download",
  showLabel = true,
  disabled = false,
  size = "sm",
  tokens,
}: DownloadButtonProps): React.ReactElement {
  const [busy, setBusy] = React.useState(false);

  const run = (): void => {
    const result = onDownload();
    if (result instanceof Promise) {
      setBusy(true);
      // `finally` rather than `then`: a failed export must also clear the busy
      // state, or the button is dead until the widget remounts.
      void result.finally(() => setBusy(false));
    }
  };

  return (
    <IconButton
      label={busy ? "Preparing…" : label}
      icon="download"
      onClick={run}
      disabled={disabled}
      busy={busy}
      showLabel={showLabel}
      size={size}
      tokens={tokens}
    />
  );
}

export interface RefreshButtonProps {
  onRefresh: () => void | Promise<void>;
  /** When the data was last loaded, already formatted. */
  lastUpdated?: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

/**
 * Refresh, with the two things that make it honest: a busy state that blocks a
 * second press, and when the data is actually from.
 */
export function RefreshButton({
  onRefresh,
  lastUpdated,
  busy,
  disabled = false,
  size = "sm",
  tokens,
}: RefreshButtonProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [internal, setInternal] = React.useState(false);
  const working = busy ?? internal;

  const run = (): void => {
    const result = onRefresh();
    if (result instanceof Promise && busy == null) {
      setInternal(true);
      void result.finally(() => setInternal(false));
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: t.space[3] }}>
      <IconButton
        label={working ? "Refreshing…" : "Refresh"}
        icon="refresh"
        onClick={run}
        disabled={disabled}
        busy={working}
        size={size}
        tokens={tokens}
      />
      {lastUpdated != null && (
        <span style={{ fontSize: t.fontSize.sm, color: t.color.textFaint }}>{lastUpdated}</span>
      )}
    </span>
  );
}

export interface ActiveFilter {
  key: string;
  /** What is being filtered: "Workstream". */
  label: string;
  /** What it is filtered to: "Finance, Supply chain". */
  value: string;
  onRemove?: () => void;
}

export interface FilterSummaryProps extends React.HTMLAttributes<HTMLDivElement> {
  filters: ActiveFilter[];
  onClearAll?: () => void;
  /** Words for the empty case. Null renders nothing at all. */
  emptyLabel?: React.ReactNode;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

/**
 * What is currently being filtered out, and how to stop.
 *
 * This is the answer to "why am I seeing twelve rows" — the most common
 * question about every table in this estate, and one no amount of extra
 * filtering UI fixes, because the problem is that a filter set three screens
 * ago is invisible.
 */
export function FilterSummary({
  filters,
  onClearAll,
  emptyLabel = "No filters",
  size = "sm",
  tokens,
  style,
  ...rest
}: FilterSummaryProps): React.ReactElement | null {
  const t = resolveTokens(tokens);

  if (filters.length === 0 && emptyLabel == null) {
    return null;
  }

  return (
    <div
      {...rest}
      // A named region, updated politely: a filter change is worth announcing
      // and is otherwise invisible to a screen reader, which sees only that
      // the table's row count changed.
      role="status"
      aria-live="polite"
      aria-label="Active filters"
      style={{
        display: "flex",
        alignItems: "center",
        gap: t.space[3],
        flexWrap: "wrap",
        fontFamily: t.fontFamily.sans,
        fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
        color: t.color.textMuted,
        ...style,
      }}
    >
      {filters.length === 0 ? (
        <span style={{ color: t.color.textFaint }}>{emptyLabel}</span>
      ) : (
        <>
          {filters.map((filter) => (
            <span
              key={filter.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: t.space[2],
                padding: `1px ${t.space[3]}`,
                borderRadius: t.radius.pill,
                background: t.color.accentTint,
                color: t.color.text,
                border: `1px solid ${t.color.border}`,
              }}
            >
              <span style={{ color: t.color.textMuted }}>{`${filter.label}:`}</span>
              <span style={{ fontWeight: 500 }}>{filter.value}</span>
              {filter.onRemove != null && (
                <button
                  type="button"
                  aria-label={`Remove ${filter.label} filter`}
                  onClick={filter.onRemove}
                  style={{
                    display: "flex",
                    padding: 0,
                    marginLeft: 2,
                    border: "none",
                    background: "transparent",
                    color: t.color.textMuted,
                    cursor: "pointer",
                  }}
                >
                  <Icon name="close" size={10} />
                </button>
              )}
            </span>
          ))}
          {onClearAll != null && filters.length > 1 && (
            <button
              type="button"
              onClick={onClearAll}
              style={{
                border: "none",
                background: "transparent",
                color: t.color.accent,
                font: "inherit",
                fontSize: "inherit",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Clear all
            </button>
          )}
        </>
      )}
    </div>
  );
}
