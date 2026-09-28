/**
 * Escape to close, and focus that goes somewhere sensible.
 *
 * Shared by `Dialog` and `Drawer`, in its own file because a module that
 * exports both a component and a hook breaks React Fast Refresh.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * -----------------------------
 * It is not a focus trap. A real one — wrapping Tab at both ends, restoring
 * focus to the opener, handling content that changes while open — is a
 * library's worth of edge cases, and every one of the estate's hand-rolled
 * dialogs got it wrong in a different way. What is here is the part that is
 * short enough to be correct:
 *
 *   - Escape closes.
 *   - Focus moves into the overlay when it opens, so a keyboard user is not
 *     left behind on the page underneath.
 *   - Focus returns to whatever had it when the overlay closes.
 *
 * If you need a true trap — a destructive confirmation, say — reach for a
 * focus-management library in the app. That is a deliberate boundary: this
 * package has no dependencies, and pretending to implement a trap is worse
 * than not having one, because it reads as solved.
 */

import { useEffect, useRef } from "react";

export interface DismissOptions {
  open: boolean;
  onClose?: () => void;
  /** Where focus should land. Defaults to the overlay element itself. */
  initialFocus?: React.RefObject<HTMLElement>;
}

// `useRef<T>(null)` rather than `useRef<T | null>(null)`: the first resolves to
// React's `RefObject<T>`, which is what a `ref` prop takes, and the second to a
// `MutableRefObject<T | null>`, which is not assignable to it.
export function useDismiss<T extends HTMLElement>({
  open,
  onClose,
  initialFocus,
}: DismissOptions): React.RefObject<T> {
  const ref = useRef<T>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) {return;}
    if (typeof document === "undefined") {return;}

    // Captured now, for the cleanup: by the time it runs, `ref.current` may
    // already be null, and asking then whether focus is still inside would be
    // asking about an element that no longer exists.
    const overlay = ref.current;

    previouslyFocused.current = document.activeElement;
    (initialFocus?.current ?? overlay)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only if focus is still inside: if the caller moved it deliberately on
      // close, dragging it back is worse than leaving it.
      const active = document.activeElement;
      if (overlay?.contains(active) === true) {
        (previouslyFocused.current as HTMLElement | null)?.focus?.();
      }
    };
  }, [open, onClose, initialFocus]);

  return ref;
}
