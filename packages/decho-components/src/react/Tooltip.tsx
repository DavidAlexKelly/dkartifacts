/**
 * A tooltip that a keyboard can reach.
 *
 * The estate has roughly two hundred `title=` attributes and one hand-built
 * tooltip in CSS. The native one is free and appears on hover only, after a
 * delay the user cannot change, and never for a keyboard user; the CSS one
 * needs the stylesheet. This is the third option: shown on hover *and* focus,
 * dismissed on Escape, and wired to the trigger with `aria-describedby` so the
 * text is read rather than merely drawn.
 *
 * It is positioned with plain absolute offsets, not a positioning library.
 * That is a real limitation — a tooltip near the edge of a scroll container
 * can clip — and the trade is deliberate: a floating-element dependency is a
 * poor thing for a package whose selling point is that it has none. For rich
 * or edge-aware popovers, reach for a real library in the app.
 */

import React, { useId, useState } from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

export interface TooltipProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "content"> {
  /** The tooltip text. A node, so a line of `mono` or a `<strong>` is fine. */
  content: React.ReactNode;
  /** The element it describes. */
  children: React.ReactElement;
  side?: "top" | "bottom";
  /** Max width before wrapping. The estate's is 220. */
  width?: number;
  tokens?: DechoTokenSet;
}

export function Tooltip({
  content,
  children,
  side = "top",
  width = 220,
  tokens,
  style,
  ...rest
}: TooltipProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const id = useId();
  const [open, setOpen] = useState(false);

  // The handlers go on the *trigger*, not on this wrapper. Two reasons, and
  // the second is the important one: a wrapper with mouse handlers and no role
  // is a static interactive element, which the a11y lint rule is right to
  // reject; and hovering the padding around a small button should not summon a
  // tooltip that the pointer is not actually over.
  const trigger = React.cloneElement(children, {
    "aria-describedby": open ? id : undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      setOpen(true);
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      setOpen(false);
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      setOpen(true);
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      setOpen(false);
      children.props.onBlur?.(e);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
      children.props.onKeyDown?.(e);
    },
  } as React.HTMLAttributes<HTMLElement>);

  return (
    <span
      {...rest}
      style={{ position: "relative", display: "inline-flex", ...style }}
    >
      {trigger}

      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            [side === "top" ? "bottom" : "top"]: "calc(100% + 6px)",
            zIndex: 20,
            maxWidth: width,
            width: "max-content",
            padding: `${t.space[2]} ${t.space[3]}`,
            borderRadius: t.radius.sm,
            // The overlay surface, not the panel surface: a tooltip sits above
            // the page and should read as a different plane from the card it
            // is describing.
            backgroundColor: t.color.surfaceOverlay,
            border: `1px solid ${t.color.borderOverlay}`,
            backdropFilter: t.effect.surfaceBlur,
            boxShadow: t.shadow.md,
            color: t.color.text,
            fontFamily: t.fontFamily.sans,
            fontSize: t.fontSize.sm,
            lineHeight: 1.45,
            textAlign: "left",
            pointerEvents: "none",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
