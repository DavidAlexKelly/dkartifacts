/**
 * Two panes and a draggable divider — the list-beside-detail layout.
 *
 * Four widgets in the estate have a table on the left and a detail panel on
 * the right, and all four have a fixed width that is wrong for somebody: too
 * narrow for the table on a laptop, too wide for the detail on a wall display.
 *
 * WHAT MAKES THIS WORTH A COMPONENT
 * ---------------------------------
 * The dragging is easy. The three things around it are not, and none of the
 * hand-rolled versions have them:
 *
 *   - A keyboard-accessible divider. `role="separator"` with `aria-valuenow`
 *     and arrow keys, so the split can be changed without a pointer.
 *   - Percentages with pixel minimums. Dragging to 5% and then resizing the
 *     window is how a pane ends up two pixels wide with no way back.
 *   - Collapse and restore. Double-clicking the divider parks the pane and
 *     remembers where it was, which is the behaviour every IDE has taught
 *     people to expect.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle } from "../core/recipes.js";
import { Icon } from "./Icon.js";

export interface SplitPaneProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** `[first, second]`. */
  children: [React.ReactNode, React.ReactNode];
  /** First pane's share, 0–100. Uncontrolled unless `onSplitChange` is given. */
  split?: number;
  onSplitChange?: (split: number) => void;
  direction?: "horizontal" | "vertical";
  /** Pixel minimum for each pane, so neither can be dragged to nothing. */
  minSize?: number;
  /** Double-click the divider to collapse. */
  collapsible?: boolean;
  tokens?: DechoTokenSet;
}

export function SplitPane({
  children,
  split,
  onSplitChange,
  direction = "horizontal",
  minSize = 160,
  collapsible = true,
  tokens,
  style,
  ...rest
}: SplitPaneProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const controlled = split != null;
  const [internal, setInternal] = React.useState(split ?? 50);
  const current = controlled ? split : internal;
  /** Where to go back to when a collapsed pane is restored. */
  const restoreTo = React.useRef(current);
  const container = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [focused, setFocused] = React.useState(false);

  const horizontal = direction === "horizontal";

  const set = (next: number): void => {
    const clamped = Math.min(100, Math.max(0, next));
    if (!controlled) {
      setInternal(clamped);
    }
    onSplitChange?.(clamped);
  };

  /** The percentage a pointer position implies, respecting the pixel minimum. */
  const fromPointer = (event: PointerEvent | React.PointerEvent): number | null => {
    const box = container.current?.getBoundingClientRect();
    if (box == null) {
      return null;
    }
    const total = horizontal ? box.width : box.height;
    if (total === 0) {
      return null;
    }
    const offset = horizontal ? event.clientX - box.left : event.clientY - box.top;
    // The minimum is in pixels, converted here, because a percentage minimum
    // means something different at every window size — which is exactly how a
    // pane ends up unusably narrow after a resize.
    const floor = (minSize / total) * 100;
    return Math.min(100 - floor, Math.max(floor, (offset / total) * 100));
  };

  React.useEffect(() => {
    if (!dragging) {
      return;
    }
    const onMove = (event: PointerEvent): void => {
      const next = fromPointer(event);
      if (next != null) {
        set(next);
      }
    };
    const onUp = (): void => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // Listeners live on the window rather than the divider so a fast drag that
    // outruns the 6px handle keeps working.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, minSize, direction, controlled, split]);

  const collapse = (): void => {
    if (!collapsible) {
      return;
    }
    if (current <= 1) {
      set(restoreTo.current === 0 ? 50 : restoreTo.current);
      return;
    }
    restoreTo.current = current;
    set(0);
  };

  return (
    <div
      {...rest}
      ref={container}
      style={{
        display: "flex",
        flexDirection: horizontal ? "row" : "column",
        height: "100%",
        minHeight: 0,
        fontFamily: t.fontFamily.sans,
        // Text selection off only while dragging: a divider that kills
        // selection permanently makes the panes' content uncopyable.
        userSelect: dragging ? "none" : undefined,
        ...style,
      }}
    >
      <div style={{ flex: `0 0 ${current}%`, minWidth: 0, minHeight: 0, overflow: "auto" }}>
        {children[0]}
      </div>

      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions,
             jsx-a11y/no-noninteractive-tabindex --
             `separator` is non-interactive in general and interactive in
             exactly this case: the ARIA "window splitter" pattern IS a
             focusable separator with `aria-valuenow`, moved with the arrow
             keys. The rules cannot tell the two apart, and doing what they ask
             — dropping the tabindex — would make the split adjustable by
             pointer only. Re-enabled immediately after the element. */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(current)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Resize panes"
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDoubleClick={collapse}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          const forward = horizontal ? "ArrowRight" : "ArrowDown";
          const back = horizontal ? "ArrowLeft" : "ArrowUp";
          if (event.key === forward) {
            set(current + (event.shiftKey ? 10 : 2));
          } else if (event.key === back) {
            set(current - (event.shiftKey ? 10 : 2));
          } else if (event.key === "Home") {
            set(0);
          } else if (event.key === "End") {
            set(100);
          } else if (event.key === "Enter" && collapsible) {
            collapse();
          } else {
            return;
          }
          event.preventDefault();
        }}
        style={{
          position: "relative",
          flex: "0 0 auto",
          // 6px of hit area around a 1px line: a one-pixel target is a
          // pointer-accuracy test, not a control.
          width: horizontal ? 6 : "auto",
          height: horizontal ? "auto" : 6,
          cursor: horizontal ? "col-resize" : "row-resize",
          background: dragging ? t.color.accentTint : "transparent",
          display: "grid",
          placeItems: "center",
          outline: "none",
          ...(focused ? focusRingStyle({ tokens }) : {}),
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: horizontal ? "0 auto" : "auto 0",
            width: horizontal ? 1 : "100%",
            height: horizontal ? "100%" : 1,
            background: t.color.borderSubtle,
          }}
        />
        <Icon
          name={horizontal ? "grip" : "dotsHorizontal"}
          size={12}
          style={{
            position: "relative",
            color: dragging || focused ? t.color.accent : t.color.borderStrong,
            transform: horizontal ? undefined : "rotate(0deg)",
          }}
        />
      </div>

      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions,
             jsx-a11y/no-noninteractive-tabindex */}

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto" }}>{children[1]}</div>
    </div>
  );
}
