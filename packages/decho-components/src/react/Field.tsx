/**
 * Label, hint, error, required marker — once, for any control.
 *
 * The inputs in this batch each accept `label`, `hint` and `error` and use
 * this internally, so the common case needs no wrapper. `Field` is exported
 * for the other case: a control this library does not have (a colour picker, a
 * map coordinate pair, somebody's third-party combobox) that still has to look
 * and announce itself like every other field on the page.
 *
 *     <Field label="Centre" hint="Decimal degrees">
 *       {(aria) => <CoordinateInput {...aria} />}
 *     </Field>
 *
 * The render prop is deliberate. The alternative — cloning the child and
 * injecting props — fails silently the moment the child forwards nothing, and
 * "the hint is not read out" is exactly the failure nobody notices. A callback
 * makes the wiring visible at the call site.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { SR_ONLY, useFieldAria, type FieldAria } from "./fieldAria.js";

export interface FieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  label?: React.ReactNode;
  /** The sentence under the control: units, format, where the value goes. */
  hint?: React.ReactNode;
  /**
   * The problem with the current value.
   *
   * Replaces the hint visually — two messages under one input is one too many
   * — but both stay in `aria-describedby`, because the format is still what
   * the user needs in order to fix the error.
   */
  error?: React.ReactNode;
  required?: boolean;
  /** Says "optional" next to the label instead of nothing. */
  optional?: boolean;
  /** Right of the label: a unit toggle, a "reset", a count. */
  action?: React.ReactNode;
  /** `label` is the 11px uppercase caption; `plain` is sentence case. */
  labelVariant?: "label" | "plain";
  /** Label beside the control rather than above it. */
  inline?: boolean;
  id?: string;
  tokens?: DechoTokenSet;
  children: (aria: FieldAria) => React.ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  optional = false,
  action,
  labelVariant = "plain",
  inline = false,
  id,
  tokens,
  children,
  style,
  ...rest
}: FieldProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const { control, controlId, hintId, errorId } = useFieldAria({
    id,
    hasHint: hint != null,
    hasError: error != null,
    required,
  });

  const caption = labelVariant === "label";

  return (
    <div
      {...rest}
      style={{
        display: inline ? "grid" : "block",
        gridTemplateColumns: inline ? "minmax(0, 12em) minmax(0, 1fr)" : undefined,
        alignItems: inline ? "baseline" : undefined,
        gap: inline ? t.space[5] : undefined,
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      {(label != null || action != null) && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: t.space[4],
            marginBottom: inline ? 0 : t.space[2],
          }}
        >
          {label != null && (
            <label
              htmlFor={controlId}
              style={{
                fontSize: caption ? t.fontSize.xs : t.fontSize.md,
                fontWeight: caption ? 700 : 500,
                letterSpacing: caption ? "0.06em" : undefined,
                textTransform: caption ? "uppercase" : undefined,
                color: caption ? t.color.textMuted : t.color.text,
              }}
            >
              {label}
              {required && (
                // A marker AND a word. An asterisk alone is a convention, not
                // information, and `aria-required` is what actually announces
                // it — this is for the sighted user who has never been told
                // what the asterisk means.
                <>
                  <span aria-hidden="true" style={{ color: t.color.danger, marginLeft: 2 }}>
                    *
                  </span>
                  <span style={SR_ONLY}>(required)</span>
                </>
              )}
              {optional && !required && (
                <span style={{ color: t.color.textFaint, marginLeft: t.space[2] }}>optional</span>
              )}
            </label>
          )}
          {action}
        </div>
      )}

      <div style={{ minWidth: 0 }}>
        {children(control)}

        {/*
          Both messages are always in the DOM when they exist, but only one is
          shown: `aria-describedby` references them by id, and a reference to a
          removed element is silence. The hint keeps its place in the
          description even while the error is the thing on screen.
        */}
        {hint != null && (
          <div
            id={hintId}
            style={{
              marginTop: t.space[2],
              fontSize: t.fontSize.sm,
              lineHeight: 1.45,
              color: t.color.textMuted,
              display: error != null ? "none" : undefined,
            }}
          >
            {hint}
          </div>
        )}
        {error != null && (
          <div
            id={errorId}
            // Announced when it appears, because a user who has just pressed
            // Save is not looking at the field they typed in ten seconds ago.
            role="alert"
            style={{
              marginTop: t.space[2],
              fontSize: t.fontSize.sm,
              lineHeight: 1.45,
              color: t.color.danger,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
