/**
 * A radio group, as a group.
 *
 * The component is the *group* rather than the button, because a lone radio is
 * always a bug: a radio's whole behaviour — arrow keys moving the selection,
 * one tab stop for the set, "2 of 4" being announced — comes from its
 * membership of a named group. Hand-rolled radios in this estate are each
 * their own tab stop, so a keyboard user tabs four times through one question
 * and the arrow keys do nothing.
 *
 * Rendered as a real `<fieldset>` with a `<legend>`. That is what makes a
 * screen reader say the question before the answer, and it is free.
 *
 * `options` rather than children, to match `Tabs` and `FacetGroup`: a closed
 * list is what these are for, and it keeps the group in charge of `name`,
 * which is the part that must not be forgotten.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle } from "../core/recipes.js";

export interface RadioOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  /** A sentence under the label — the consequence of choosing it. */
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<V extends string = string>
  extends Omit<React.FieldsetHTMLAttributes<HTMLFieldSetElement>, "onChange" | "children"> {
  /** The question. Rendered as a `<legend>`. */
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  options: RadioOption<V>[];
  value: V | null;
  onValueChange: (value: V) => void;
  /** Shared `name`. Generated when absent, which is safe for one group. */
  name?: string;
  direction?: "column" | "row";
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function RadioGroup<V extends string = string>({
  label,
  hint,
  error,
  options,
  value,
  onValueChange,
  name,
  direction = "column",
  size = "md",
  tokens,
  disabled,
  style,
  ...rest
}: RadioGroupProps<V>): React.ReactElement {
  const t = resolveTokens(tokens);
  const generated = React.useId();
  const groupName = name ?? generated;
  const hintId = `${groupName}-hint`;
  const errorId = `${groupName}-error`;
  const [focusedValue, setFocusedValue] = React.useState<string | null>(null);

  const describedBy = [hint != null ? hintId : null, error != null ? errorId : null]
    .filter((id): id is string => id != null)
    .join(" ");

  const dot = size === "sm" ? 14 : 16;

  return (
    <fieldset
      {...rest}
      disabled={disabled}
      aria-describedby={describedBy.length > 0 ? describedBy : undefined}
      aria-invalid={error != null ? true : undefined}
      style={{
        margin: 0,
        padding: 0,
        border: "none",
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      {label != null && (
        <legend
          style={{
            padding: 0,
            marginBottom: t.space[3],
            fontSize: t.fontSize.md,
            fontWeight: 500,
            color: t.color.text,
          }}
        >
          {label}
        </legend>
      )}
      {hint != null && error == null && (
        <div
          id={hintId}
          style={{
            marginTop: -t.space[2],
            marginBottom: t.space[3],
            fontSize: t.fontSize.sm,
            color: t.color.textMuted,
          }}
        >
          {hint}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: direction,
          gap: direction === "row" ? t.space[6] : t.space[4],
          flexWrap: direction === "row" ? "wrap" : undefined,
        }}
      >
        {options.map((option) => {
          const id = `${groupName}-${option.value}`;
          const selected = value === option.value;
          const off = disabled === true || option.disabled === true;
          return (
            <div key={option.value} style={{ display: "flex", gap: t.space[4], alignItems: "flex-start" }}>
              <span style={{ position: "relative", display: "flex", flex: "0 0 auto", marginTop: 1 }}>
                <input
                  id={id}
                  type="radio"
                  name={groupName}
                  value={option.value}
                  checked={selected}
                  disabled={off}
                  aria-describedby={option.description != null ? `${id}-description` : undefined}
                  onFocus={() => setFocusedValue(option.value)}
                  onBlur={() => setFocusedValue(null)}
                  onChange={() => onValueChange(option.value)}
                  style={{
                    // Hidden by opacity rather than by `SR_ONLY`'s clip,
                    // because a radio's arrow-key navigation moves focus
                    // between the inputs and a clipped input can scroll the
                    // page to the top-left corner when it receives it.
                    position: "absolute",
                    inset: 0,
                    width: dot,
                    height: dot,
                    margin: 0,
                    opacity: 0,
                    cursor: off ? "not-allowed" : "pointer",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: dot,
                    height: dot,
                    borderRadius: "50%",
                    border: `1px solid ${selected ? t.color.accent : t.color.border}`,
                    background: t.color.bg,
                    opacity: off ? 0.5 : 1,
                    transition: t.effect.transition,
                    ...(focusedValue === option.value ? focusRingStyle({ tokens }) : {}),
                  }}
                >
                  {selected && (
                    <span
                      style={{
                        width: dot - 8,
                        height: dot - 8,
                        borderRadius: "50%",
                        background: t.color.accent,
                      }}
                    />
                  )}
                </span>
              </span>

              <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <label
                  htmlFor={id}
                  style={{
                    fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
                    lineHeight: 1.4,
                    color: off ? t.color.textFaint : t.color.text,
                    cursor: off ? "not-allowed" : "pointer",
                  }}
                >
                  {option.label}
                </label>
                {option.description != null && (
                  <span
                    id={`${id}-description`}
                    style={{ fontSize: t.fontSize.sm, lineHeight: 1.45, color: t.color.textMuted }}
                  >
                    {option.description}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {error != null && (
        <div
          id={errorId}
          role="alert"
          style={{ marginTop: t.space[3], fontSize: t.fontSize.sm, color: t.color.danger }}
        >
          {error}
        </div>
      )}
    </fieldset>
  );
}
