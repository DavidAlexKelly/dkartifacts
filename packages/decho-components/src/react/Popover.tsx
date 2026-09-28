/**
 * An anchored panel: the thing six other components need and none of them had.
 *
 * `Select`, `MultiSelect`, `Menu`, `ContextMenu`, `DateInput` and every filter
 * dropdown in the estate are all this component plus content. Building it once
 * is why those are small.
 *
 * FIXED, NOT PORTALLED
 * --------------------
 * Same choice `Dialog` and `Drawer` made: `position: fixed` with coordinates
 * measured from the anchor, and no `createPortal`. That keeps the package's
 * only peer dependency React — `createPortal` lives in `react-dom` — and it is
 * enough, because a fixed element escapes an ancestor's `overflow: hidden`,
 * which is the clipping that matters inside a table or a widget.
 *
 * The honest limit: a fixed element is positioned relative to the nearest
 * ancestor with a `transform`, `filter` or `will-change`, not the viewport. In
 * a subtree like that the panel lands in the wrong place. Rare, and visible
 * immediately rather than subtly — but it is the reason a positioning library
 * exists, and if a widget ever hits it the answer is to move the popover's
 * anchor out of the transformed subtree rather than to add a dependency here.
 *
 * MEASURED, THEN PLACED
 * ---------------------
 * A panel cannot be placed until its size is known, and its size is not known
 * until it has rendered. So the first paint is invisible (`visibility:
 * hidden`, still laid out, still measurable) and the placement follows in a
 * layout effect — before the browser paints, so nothing flickers.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { placeFloating, type Align, type Placement, type Rect, type Side } from "./placement.js";
import { useOutsideDismiss } from "./useOutsideDismiss.js";

export interface PopoverProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "role"> {
  open: boolean;
  onClose?: () => void;
  /**
   * What to hang off: the trigger's ref, or a bare rectangle for a pointer.
   *
   * A ref is remeasured on scroll and resize; a rectangle is taken as given,
   * which is what a right-click position is.
   */
  anchor: React.RefObject<HTMLElement | null> | Rect;
  side?: Side;
  align?: Align;
  offset?: number;
  padding?: number;
  /** For a select's listbox: the panel is as wide as the field it came from. */
  matchAnchorWidth?: boolean;
  /**
   * The panel's role. `"dialog"` for a form, `"menu"`/`"listbox"` when the
   * content is a menu or a list, `"none"` when the content already has one.
   */
  role?: "dialog" | "menu" | "listbox" | "none";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  closeOnEscape?: boolean;
  /** Extra "inside" elements — the trigger, so clicking it does not re-open. */
  dismissRefs?: React.RefObject<HTMLElement | null>[];
  /** Skip the panel's own surface, for content that paints itself. */
  bare?: boolean;
  tokens?: DechoTokenSet;
}

export function Popover({
  open,
  onClose,
  anchor,
  side = "bottom",
  align = "start",
  offset = 4,
  padding = 8,
  matchAnchorWidth = false,
  role = "dialog",
  closeOnEscape = true,
  dismissRefs = [],
  bare = false,
  tokens,
  children,
  style,
  ...rest
}: PopoverProps): React.ReactElement | null {
  const t = resolveTokens(tokens);
  const panel = React.useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const [anchorWidth, setAnchorWidth] = React.useState<number | null>(null);

  useOutsideDismiss({ open, onClose, refs: [panel, ...dismissRefs], closeOnEscape });

  const anchorRect = (): Rect | null => {
    if (!("current" in anchor)) {
      return anchor;
    }
    const element = anchor.current;
    if (element == null) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  };

  const measure = React.useCallback((): void => {
    const rect = anchorRect();
    const element = panel.current;
    if (rect == null || element == null) {
      return;
    }
    setAnchorWidth(rect.width);
    setPlacement(
      placeFloating({
        anchor: rect,
        floating: { width: element.offsetWidth, height: element.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        side,
        align,
        offset,
        padding,
      }),
    );
    // `anchor` is a ref object or a plain rect; both are stable enough to read
    // fresh each time rather than to depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, align, offset, padding]);

  React.useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    measure();
  }, [open, measure, children]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    // `capture: true` so a scroll inside a scrolling ancestor is seen too —
    // scroll does not bubble, and a menu that stays behind when its table
    // scrolls is the other classic popover bug.
    const onScroll = (): void => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, measure]);

  if (!open) {
    return null;
  }

  return (
    <div
      {...rest}
      ref={panel}
      role={role === "none" ? undefined : role}
      style={{
        position: "fixed",
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        // Above Tooltip (20) and below Drawer (34) and Dialog (40): a popover
        // inside a drawer has to be over the drawer, so this is deliberately
        // not "highest wins" — see the note in the package's Drawer.
        zIndex: 30,
        // Laid out but not painted until it has been measured. `visibility`
        // rather than `display: none`, which would make it unmeasurable, or
        // `opacity`, which would let it intercept clicks where it is not.
        visibility: placement == null ? "hidden" : "visible",
        minWidth: matchAnchorWidth && anchorWidth != null ? anchorWidth : undefined,
        maxHeight: placement?.maxHeight,
        overflow: "auto",
        boxSizing: "border-box",
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        color: t.color.text,
        ...(bare
          ? {}
          : {
              padding: t.space[4],
              background: t.color.surfaceRaised,
              border: `1px solid ${t.color.border}`,
              borderRadius: t.radius.md,
              boxShadow: t.shadow.panel,
            }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
