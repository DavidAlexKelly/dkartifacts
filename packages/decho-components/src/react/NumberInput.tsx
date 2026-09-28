/**
 * A number field that does not lose figures.
 *
 * NOT `<input type="number">`, on purpose:
 *
 *   - The scroll wheel steps the value when the cursor happens to be over it.
 *     A user scrolling a form past a focused quantity field changes the
 *     quantity, silently. This is the single most common data-corruption bug
 *     in web forms and the browsers will not fix it.
 *   - The value is a string that is `""` for both "empty" and "not a number",
 *     so `12abc` reads as empty rather than as a mistake.
 *   - Its spinners cannot be styled and are invisible in a dense row.
 *
 * So: `inputMode="decimal"` on a text field, the arithmetic in
 * `numberInput.ts`, and optional steppers that are real buttons.
 *
 * Typing is not committing. The field keeps whatever the user is typing —
 * including half-typed states like `-` and `1.` — and calls `onValueChange`
 * only when the text parses. Clamping happens on blur rather than per
 * keystroke, because clamping mid-type makes "15" impossible to enter in a
 * field whose maximum is 12: the "1" clamps instantly.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle, inputStyle, monoStyle } from "../core/recipes.js";
import { Field } from "./Field.js";
import { Icon } from "./Icon.js";
import {
  clamp,
  outOfBounds,
  parseNumber,
  stepValue,
  type NumberValue,
} from "./numberInput.js";

export interface NumberInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "size" | "type" | "min" | "max" | "step"
  > {
  /** `null` means empty, which is not the same as zero. */
  value: NumberValue;
  onValueChange: (value: NumberValue) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  labelVariant?: "label" | "plain";
  inline?: boolean;
  optional?: boolean;
  size?: "sm" | "md";
  min?: number;
  max?: number;
  step?: number;
  /** Up/down buttons. Off by default — most fields are typed, not nudged. */
  steppers?: boolean;
  /** A unit after the number: "kg", "%", "days". */
  unit?: React.ReactNode;
  /** Right-aligned and monospaced, for a column of figures. */
  numeric?: boolean;
  tokens?: DechoTokenSet;
}

export function NumberInput({
  value,
  onValueChange,
  label,
  hint,
  error,
  labelVariant = "plain",
  inline = false,
  optional = false,
  size = "md",
  min,
  max,
  step = 1,
  steppers = false,
  unit,
  numeric = false,
  tokens,
  disabled,
  style,
  id,
  ...rest
}: NumberInputProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);
  /** What is in the box while typing; `null` means "show the prop". */
  const [draft, setDraft] = React.useState<string | null>(null);

  const bounds = { min, max };
  const text = draft ?? (value == null ? "" : `${value}`);
  const invalid = error != null || outOfBounds(value, bounds);

  const commit = (next: string): void => {
    const parsed = parseNumber(next);
    if (parsed === undefined) {
      // Not a number yet. Keep the text, do not tell the caller anything —
      // reporting `null` here would blank a filter on the way to typing "-5".
      return;
    }
    onValueChange(parsed);
  };

  const nudge = (direction: 1 | -1): void => {
    setDraft(null);
    onValueChange(stepValue(value, direction, step, bounds));
  };

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      optional={optional}
      labelVariant={labelVariant}
      inline={inline}
      id={id}
      tokens={tokens}
    >
      {(aria) => (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: t.space[3],
            ...inputStyle({ tokens, invalid }),
            padding: size === "sm" ? `3px ${t.space[3]}` : `5px ${t.space[4]}`,
            opacity: disabled === true ? 0.55 : 1,
            ...(focused ? focusRingStyle({ tokens }) : {}),
            ...style,
          }}
        >
          <input
            {...rest}
            {...aria}
            aria-invalid={invalid ? true : undefined}
            // The ARIA a spinner owes a screen reader. Present whether or not
            // the visual steppers are, because the arrow keys work regardless.
            role="spinbutton"
            aria-valuenow={value ?? undefined}
            aria-valuemin={min}
            aria-valuemax={max}
            type="text"
            inputMode={Number.isInteger(step) ? "numeric" : "decimal"}
            disabled={disabled}
            value={text}
            onChange={(event) => {
              setDraft(event.target.value);
              commit(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                nudge(1);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                nudge(-1);
              }
              rest.onKeyDown?.(event);
            }}
            onFocus={(event) => {
              setFocused(true);
              rest.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              setDraft(null);
              // Clamp now, not while typing: a field with max 12 has to let
              // somebody type the "1" of "15" before rejecting it.
              if (value != null) {
                const clamped = clamp(value, bounds);
                if (clamped !== value) {
                  onValueChange(clamped);
                }
              }
              rest.onBlur?.(event);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              margin: 0,
              padding: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "inherit",
              textAlign: numeric ? "right" : undefined,
              fontFamily: numeric ? monoStyle({ tokens }).fontFamily : "inherit",
              fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.4,
            }}
          />

          {unit != null && (
            <span
              aria-hidden="true"
              style={{ fontSize: t.fontSize.sm, color: t.color.textFaint, whiteSpace: "nowrap" }}
            >
              {unit}
            </span>
          )}

          {steppers && (
            <span style={{ display: "grid", gap: 1 }}>
              {([1, -1] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  // Labelled, because "increase" and "decrease" is what a
                  // screen reader should say rather than "button, chevron up".
                  aria-label={direction === 1 ? "Increase" : "Decrease"}
                  disabled={disabled}
                  onClick={() => nudge(direction)}
                  style={{
                    display: "flex",
                    padding: "0 2px",
                    border: "none",
                    background: "transparent",
                    color: t.color.textMuted,
                    cursor: disabled === true ? "not-allowed" : "pointer",
                  }}
                >
                  <Icon name={direction === 1 ? "chevronUp" : "chevronDown"} size={11} />
                </button>
              ))}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}
