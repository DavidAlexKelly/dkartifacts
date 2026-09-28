/**
 * Action feedback: a host, a hook and the toast itself.
 *
 * WHY THIS IS NOT OPTIONAL
 * ------------------------
 * A write that fails and says nothing is the worst outcome an operational
 * application can produce, because the user's model of the world silently
 * diverges from the data. Several widgets in this estate fire an action and
 * render no result at all — success and failure look identical, and the only
 * way to find out is to refresh.
 *
 * HOW IT IS WIRED
 * ---------------
 * `ToastHost` renders the stack and provides the dispatcher; `useToast()`
 * reads it. Both the context and the hook live in `toastContext.ts` — a file
 * exporting a component and a hook breaks fast refresh — and the reasoning
 * about why a context is acceptable here is written down there.
 */

import React from "react";
import { resolveTokens, toneColors, type DechoTokenSet } from "../core/vars.js";
import { Icon, type DechoIconName } from "./Icon.js";
import {
  defaultDuration,
  toastReducer,
  type Toast as ToastModel,
  type ToastState,
} from "./toastQueue.js";
import { ToastContext, type ToastApi, type ToastInput } from "./toastContext.js";

export type { Toast as ToastModel } from "./toastQueue.js";

export interface ToastHostProps {
  children?: React.ReactNode;
  /** Where the stack sits. Bottom-right by default. */
  position?: "top-right" | "top-center" | "bottom-right" | "bottom-center";
  tokens?: DechoTokenSet;
}

export function ToastHost({
  children,
  position = "bottom-right",
  tokens,
}: ToastHostProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [state, dispatch] = React.useReducer(toastReducer, { toasts: [] } as ToastState);
  const timers = React.useRef(new Map<string, number>());
  const sequence = React.useRef(0);

  const dismiss = React.useCallback((id: string): void => {
    const timer = timers.current.get(id);
    if (timer != null) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    dispatch({ type: "dismiss", id });
  }, []);

  const push = React.useCallback(
    (input: ToastInput): string => {
      sequence.current += 1;
      const id = input.id ?? `toast-${sequence.current}`;
      const duration = input.duration === undefined ? defaultDuration(input.tone) : input.duration;
      dispatch({ type: "push", toast: { ...input, id, duration } });
      if (duration != null) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  const api = React.useMemo<ToastApi>(
    () => ({ push, dismiss, clear: () => dispatch({ type: "clear" }) }),
    [push, dismiss],
  );

  // Clearing on unmount, or a widget that closes mid-action leaves timers
  // running against a dispatch that no longer has a component.
  React.useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }
      timers.current.clear();
    },
    [],
  );

  const [vertical, horizontal] = position.split("-") as ["top" | "bottom", "right" | "center"];

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // `polite` rather than `assertive`: a toast interrupts nothing, and an
        // assertive region cuts off whatever the user was being read.
        // Failures that must interrupt belong in a Banner or a Dialog.
        role="status"
        aria-live="polite"
        aria-relevant="additions text"
        style={{
          position: "fixed",
          [vertical]: t.space[6],
          ...(horizontal === "center"
            ? { left: "50%", transform: "translateX(-50%)" }
            : { right: t.space[6] }),
          zIndex: 45,
          display: "flex",
          flexDirection: vertical === "top" ? "column" : "column-reverse",
          gap: t.space[4],
          maxWidth: "min(420px, calc(100vw - 32px))",
          // Pointer events off on the stack and on for each toast, so the
          // empty space around a toast does not block the page underneath.
          pointerEvents: "none",
        }}
      >
        {state.toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} tokens={tokens} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_ICON: Record<string, DechoIconName> = {
  success: "check",
  danger: "warning",
  warning: "warning",
  info: "info",
};

export interface ToastCardProps {
  toast: ToastModel;
  onDismiss: () => void;
  tokens?: DechoTokenSet;
}

/** One toast. Exported for a showcase, or a host of your own. */
export function ToastCard({ toast, onDismiss, tokens }: ToastCardProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const tone = toast.tone ?? "neutral";
  const colors = toneColors(tone, t.color);
  const icon = TONE_ICON[tone];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: t.space[4],
        padding: `${t.space[4]} ${t.space[5]}`,
        background: t.color.surfaceRaised,
        border: `1px solid ${t.color.border}`,
        // The tone as a left edge rather than as a fill: a fully tinted toast
        // over a dark theme is either unreadable or has to bring its own text
        // colour, and then it stops following the theme.
        borderLeft: `3px solid ${colors.fg}`,
        borderRadius: t.radius.md,
        boxShadow: t.shadow.panel,
        color: t.color.text,
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        pointerEvents: "auto",
      }}
    >
      {icon != null && <Icon name={icon} style={{ color: colors.fg, marginTop: 2 }} />}
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
        {toast.message}
        {(toast.count ?? 1) > 1 && (
          <span
            style={{
              marginLeft: t.space[3],
              padding: "0 5px",
              borderRadius: t.radius.pill,
              background: t.color.neutralTint,
              color: t.color.textMuted,
              fontSize: t.fontSize.xs,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {`×${toast.count}`}
          </span>
        )}
      </span>
      {toast.action != null && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          style={{
            border: "none",
            background: "transparent",
            color: t.color.accent,
            font: "inherit",
            fontSize: t.fontSize.sm,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {toast.action.label}
        </button>
      )}
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
    </div>
  );
}
