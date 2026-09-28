/**
 * Close when the user clicks away, or presses Escape.
 *
 * WHY NOT THE PACKAGE'S `useDismiss`
 * ----------------------------------
 * Because that hook owns focus: it moves focus into the overlay on open and
 * restores it on close, which is exactly right for a dialog and wrong for a
 * combobox. In the combobox pattern focus must *stay* on the trigger while the
 * list is open, with `aria-activedescendant` naming the highlighted option —
 * move focus into the list and typing stops reaching the input. `Select` needs
 * that pattern, so `Popover` cannot be built on a hook that takes focus.
 *
 * This handles the two behaviours that are not about focus, and leaves focus
 * to whichever component knows what it should do: `Menu` moves it to the
 * items, `Select` keeps it on the button, a filter panel leaves it alone.
 *
 * `pointerdown` rather than `click`, because a menu that closes on `click`
 * stays open through the press and closes on release — so a press that starts
 * inside the menu and ends outside it (a drag, a text selection) closes it,
 * while a press outside that ends inside does not.
 */

import React from "react";

/** Something that can answer "is this node inside me". An element, usually. */
export interface Container {
  contains(node: Node | null): boolean;
}

/**
 * Whether an event happened inside any of these containers.
 *
 * Pure, and the whole of the outside-click decision. Nulls are tolerated
 * because refs are null before mount and after unmount, and a dismiss handler
 * that throws on a stale ref takes the page with it.
 */
export function isWithin(
  target: EventTarget | null,
  containers: (Container | null | undefined)[],
): boolean {
  if (target == null || !(typeof target === "object") || !("nodeType" in target)) {
    return false;
  }
  const node = target as Node;
  return containers.some((container) => container?.contains(node) === true);
}

export interface OutsideDismissOptions {
  open: boolean;
  onClose?: () => void;
  /**
   * Everything that counts as "inside".
   *
   * The trigger belongs in here as well as the panel: without it, clicking the
   * button that opened the menu closes it from the outside handler and then
   * the button's own onClick opens it again, so the menu appears not to close.
   * That is the single commonest popover bug and it is always this.
   */
  refs: React.RefObject<HTMLElement | null>[];
  closeOnEscape?: boolean;
}

export function useOutsideDismiss({
  open,
  onClose,
  refs,
  closeOnEscape = true,
}: OutsideDismissOptions): void {
  // Kept in a ref so the effect does not resubscribe on every render, which
  // for a listener on `document` means every keystroke in the page.
  const latest = React.useRef({ onClose, refs, closeOnEscape });
  latest.current = { onClose, refs, closeOnEscape };

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent | MouseEvent): void => {
      const { refs: current, onClose: close } = latest.current;
      if (!isWithin(event.target, current.map((ref) => ref.current))) {
        close?.();
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && latest.current.closeOnEscape) {
        // Stopped so that one Escape does not also close the dialog this
        // popover is inside. Nested overlays should close one layer per press.
        event.stopPropagation();
        latest.current.onClose?.();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);
}
