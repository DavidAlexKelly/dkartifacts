/**
 * A modal dialog.
 *
 * Three in the estate — the RICEFW link dialog, the requirements generator and
 * a "coming soon" placeholder — each with its own backdrop, its own escape
 * handling in one case and none in the others, and a `<div>` where a heading
 * should be.
 *
 * NOT A PORTAL, ON PURPOSE
 * ------------------------
 * The obvious implementation renders into `document.body`. That is wrong here:
 * a theme is a set of custom properties written onto a `DechoSurface`, and a
 * portal to `body` escapes that subtree — so the dialog would come out in the
 * base theme while the page behind it is `accenture-sap`, which is exactly the
 * sort of failure that only shows up in front of a customer.
 *
 * Rendering in place costs nothing visually, because the backdrop and the
 * panel are `position: fixed`, which is the viewport regardless of where the
 * element sits in the tree. The one thing it cannot escape is an ancestor with
 * `overflow: hidden` *and* a transform; if you hit that, hoist the `Dialog`
 * higher in your own tree, or pass `tokens` and portal it yourself.
 */
import React from "react";
import { type DechoTokenSet, resolveTokens } from "../core/vars.js";
import { useDismiss } from "./useDismiss.js";

export interface DialogProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title" | "role"> {
  open: boolean;
  /** Escape, the backdrop and the close button all call this. */
  onClose?: () => void;
  title?: React.ReactNode;
  /** A line under the title. Becomes the dialog's description for a reader. */
  description?: React.ReactNode;
  /** Bottom row, right-aligned: the buttons. */
  footer?: React.ReactNode;
  /** 380, 560 and 820px. */
  size?: "sm" | "md" | "lg";
  /** A close affordance in the header. Off when there is no `onClose`. */
  dismissable?: boolean;
  /** Clicking the backdrop closes. Off for a form with unsaved input. */
  dismissOnBackdrop?: boolean;
  tokens?: DechoTokenSet;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  size = "md",
  dismissable = true,
  dismissOnBackdrop = true,
  tokens,
  children,
  style,
  ...rest
}: DialogProps): React.ReactElement | null {
  const t = resolveTokens(tokens);
  const ref = useDismiss<HTMLDivElement>({ open, onClose });
  const titleId = React.useId();
  const descriptionId = React.useId();

  if (!open) {
    return null;
  }

  const width = { sm: 380, md: 560, lg: 820 }[size];

  return (
    <>
      {/*
        The scrim is a real <button>, which is worth a sentence because it looks
        like over-engineering and is the opposite.

        A clickable <div> here needs a keyboard handler to be accessible — and
        the keyboard path already exists, on `document`, in `useDismiss`, so the
        handler would be a duplicate kept in step by hand. A <button> is
        interactive by construction: it needs no role, no second handler and no
        lint exception. `aria-hidden` with `tabIndex={-1}` then says what it
        actually is — a pointer shortcut, not an announced control, because
        "Close" is already on the button in the header.
      */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={dismissOnBackdrop ? () => onClose?.() : undefined}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          border: "none",
          padding: 0,
          // Dark at low alpha in every theme: a scrim is the page dimmed, not a
          // surface, so it is the one colour here that is not a token.
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          cursor: dismissOnBackdrop ? "pointer" : "default",
        }}
      />
      {/*
        The centring layer passes pointer events through to the scrim beneath,
        and the panel takes them back. That is what removes the
        `stopPropagation` this component used to need on the panel — and with
        it the second click handler on a non-interactive element.
      */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 41,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: t.space[5],
          pointerEvents: "none",
        }}
      >
        <div
          {...rest}
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title != null ? titleId : undefined}
          aria-describedby={description != null ? descriptionId : undefined}
          tabIndex={-1}
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: width,
            maxHeight: "calc(100vh - 64px)",
            display: "flex",
            flexDirection: "column",
            backgroundColor: t.color.surface,
            backgroundImage: t.gradient.surface,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.lg,
            boxShadow: t.shadow.panel,
            color: t.color.text,
            fontFamily: t.fontFamily.sans,
            fontSize: t.fontSize.md,
            outline: "none",
            ...style,
          }}
        >
          {(title != null || dismissable) && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: t.space[4],
                padding: `${t.space[4]} ${t.space[5]}`,
                borderBottom: `1px solid ${t.color.borderSubtle}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                {title != null && (
                  <h2
                    id={titleId}
                    style={{
                      margin: 0,
                      fontSize: t.fontSize.xl,
                      fontWeight: 600,
                      lineHeight: 1.3,
                    }}
                  >
                    {title}
                  </h2>
                )}
                {description != null && (
                  <p
                    id={descriptionId}
                    style={{
                      margin: `${t.space[2]} 0 0`,
                      fontSize: t.fontSize.md,
                      lineHeight: 1.5,
                      color: t.color.textMuted,
                    }}
                  >
                    {description}
                  </p>
                )}
              </div>
              {dismissable && onClose != null && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    flex: "0 0 auto",
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
          )}

          <div style={{ padding: t.space[5], overflow: "auto", flex: "1 1 auto" }}>{children}</div>

          {footer != null && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: t.space[3],
                padding: `${t.space[4]} ${t.space[5]}`,
                borderTop: `1px solid ${t.color.borderSubtle}`,
              }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
