/**
 * The toast queue, as a reducer.
 *
 * Every widget in the estate that gives action feedback has its own version of
 * this, and they share the same three problems:
 *
 *   1. One toast at a time, held in a `useState`, so a batch of five writes
 *      shows the fifth result and silently drops four — including the failure.
 *   2. No cap, so a loop that errors once per row queues four hundred toasts
 *      and the page becomes unusable rather than merely wrong.
 *   3. No dedupe, so "Save failed" appears eleven times instead of once with
 *      a count, which is both noisier and less informative.
 *
 * Pure, and free of timers: the host schedules dismissals and calls
 * `dismiss`, so this can be tested by calling functions in order rather than
 * by advancing fake clocks.
 */

import type { DechoTone } from "../core/vars.js";

export interface Toast {
  id: string;
  /** One line. If you need two, it is a `Banner`, not a toast. */
  message: string;
  tone?: DechoTone;
  /** Milliseconds before it goes. `null` means it stays until dismissed. */
  duration?: number | null;
  /** One action, e.g. Undo or Retry. */
  action?: { label: string; onClick: () => void };
  /**
   * Identity for deduplication. Two toasts with the same key collapse into
   * one with a count rather than stacking.
   */
  key?: string;
  /** How many times this one has arrived. Managed here, not by callers. */
  count?: number;
}

export interface ToastState {
  toasts: Toast[];
}

export type ToastEvent =
  | { type: "push"; toast: Toast }
  | { type: "dismiss"; id: string }
  | { type: "clear" };

/**
 * How many are on screen at once.
 *
 * Four, because a fifth pushes the first off the top of a widget-sized
 * viewport, and a toast nobody can see is a failure nobody is told about. The
 * oldest is dropped rather than the newest: the most recent result is the one
 * the user is waiting for.
 */
export const MAX_TOASTS = 4;

export function toastReducer(state: ToastState, event: ToastEvent): ToastState {
  switch (event.type) {
    case "push": {
      const { toast } = event;
      if (toast.key != null) {
        const existing = state.toasts.findIndex((candidate) => candidate.key === toast.key);
        if (existing >= 0) {
          const previous = state.toasts[existing];
          const merged: Toast = {
            ...toast,
            // The original id is kept so any pending dismissal timer still
            // refers to a toast that exists.
            id: previous?.id ?? toast.id,
            count: (previous?.count ?? 1) + 1,
          };
          const toasts = [...state.toasts];
          toasts[existing] = merged;
          return { toasts };
        }
      }
      const toasts = [...state.toasts, { ...toast, count: 1 }];
      return { toasts: toasts.slice(Math.max(0, toasts.length - MAX_TOASTS)) };
    }
    case "dismiss":
      return { toasts: state.toasts.filter((toast) => toast.id !== event.id) };
    case "clear":
      return { toasts: [] };
    default:
      return state;
  }
}

/**
 * The default lifetime for a tone, in milliseconds.
 *
 * Failures do not auto-dismiss. A success that vanishes is fine — the thing
 * happened — but an error that vanishes before it is read is indistinguishable
 * from no feedback at all, which is the state these components exist to end.
 */
export function defaultDuration(tone: DechoTone | undefined): number | null {
  switch (tone) {
    case "danger":
      return null;
    case "warning":
      return 8000;
    default:
      return 4000;
  }
}
