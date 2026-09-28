/**
 * A drawer: the detail panel that slides in from the edge.
 *
 * Three in the estate — the process-review detail drawer, the requirements
 * editor and the drawer navigation — and the pattern they share is the one
 * that matters: a list on the page, a selected item, and its detail beside it
 * rather than on another route.
 *
 * Two behaviours, because the estate genuinely needs both:
 *
 *   modal      A scrim, focus moved in, Escape closes. For an editor.
 *   inline     No scrim, the page stays usable, Escape still closes. For a
 *              detail panel you click through a list with — which is most of
 *              them, and which a modal drawer makes tedious.
 *
 * Not a portal, for the same reason as `Dialog`: a portal to `body` leaves the
 * subtree whose custom properties are the theme.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { useDismiss } from "./useDismiss.js";

export interface DrawerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title" | "role"> {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  /** Second line in the header: an id, a timestamp, a status chip's worth. */
  meta?: React.ReactNode;
  /** Header actions, left of the close button. */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  side?: "right" | "left";
  width?: number | string;
  /**
   * A scrim, and the page behind made unavailable. Off by default: clicking
   * through a list with a drawer open is the commonest use, and a modal drawer
   * makes that two clicks per item instead of one.
   */
  modal?: boolean;
  dismissable?: boolean;
  tokens?: DechoTokenSet;
}

export function Drawer({
  open,
  onClose,
  title,
  meta,
  actions,
  footer,
  side = "right",
  width = 420,
  modal = false,
  dismissable = true,
  tokens,
  children,
  style,
  ...rest
}: DrawerProps): React.ReactElement | null {
  const t = resolveTokens(tokens);
  const ref = useDismiss<HTMLDivElement>({ open, onClose });
  const titleId = React.useId();

  if (!open) {return null;}

  const panel = (
    <div
      {...rest}
      ref={ref}
      // `dialog` when it takes over, `complementary` when it does not: telling
      // a screen reader "dialog" about a panel the user can click past is how
      // a non-modal drawer becomes a trap that is not actually a trap.
      role={modal ? "dialog" : "complementary"}
      aria-modal={modal ? true : undefined}
      aria-labelledby={title != null ? titleId : undefined}
      tabIndex={-1}
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        [side]: 0,
        zIndex: 35,
        width,
        maxWidth: "100vw",
        display: "flex",
        flexDirection: "column",
        backgroundColor: t.color.surface,
        backgroundImage: t.gradient.surface,
        [side === "right" ? "borderLeft" : "borderRight"]:
          `1px solid ${t.color.border}`,
        boxShadow: t.shadow.panel,
        backdropFilter: t.effect.surfaceBlur,
        color: t.color.text,
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.md,
        outline: "none",
        ...style,
      }}
    >
      {(title != null || actions != null || dismissable) && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: t.space[3],
            padding: `${t.space[4]} ${t.space[4]}`,
            borderBottom: `1px solid ${t.color.borderSubtle}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title != null && (
              <h2
                id={titleId}
                style={{
                  margin: 0,
                  fontSize: t.fontSize.lg,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {title}
              </h2>
            )}
            {meta != null && (
              <div
                style={{
                  marginTop: 2,
                  fontSize: t.fontSize.sm,
                  color: t.color.textMuted,
                }}
              >
                {meta}
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: t.space[2],
              flex: "0 0 auto",
            }}
          >
            {actions}
            {dismissable && onClose != null && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  // 26px, not the 20 the estate's drawer used: a stepper that
                  // small was logged as a real complaint, and a 20px target
                  // fails every pointer-size guideline there is.
                  width: 26,
                  height: 26,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: `1px solid ${t.color.borderSubtle}`,
                  borderRadius: t.radius.sm,
                  color: t.color.textMuted,
                  cursor: "pointer",
                  font: "inherit",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: t.space[4], overflow: "auto", flex: "1 1 auto" }}>
        {children}
      </div>

      {footer != null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: t.space[3],
            padding: t.space[4],
            borderTop: `1px solid ${t.color.borderSubtle}`,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );

  if (!modal) {return panel;}

  return (
    <>
      {/* A <button>, for the reasons set out in Dialog: interactive by
          construction, so it needs no duplicate keyboard handler, and
          aria-hidden because the named close control is in the header. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => onClose?.()}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 34,
          border: "none",
          padding: 0,
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          cursor: "pointer",
        }}
      />
      {panel}
    </>
  );
}
