/**
 * A text input that is themed, labelled and described.
 *
 * The package has had an `inputStyle` recipe and no input since the split,
 * which means every form in the estate is a bare `<input style={inputStyle()}>`
 * with a `<div>` above it pretending to be a label. Half of them are not
 * labels at all — no `htmlFor`, so clicking the text does nothing and a screen
 * reader announces "edit text, blank".
 *
 * Focus is tracked in state because inline styles have no `:focus-visible`;
 * that is the same trick `Button` uses, and the reason the focus ring is a
 * recipe rather than a copied box-shadow.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle, inputStyle, monoStyle } from "../core/recipes.js";
import { Field } from "./Field.js";
import { Icon, type DechoIconName } from "./Icon.js";

export interface TextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Sentence-case label, or the 11px uppercase caption. */
  labelVariant?: "label" | "plain";
  /** Label beside the input rather than above it. */
  inline?: boolean;
  optional?: boolean;
  size?: "sm" | "md";
  /**
   * Restricted on purpose.
   *
   * `type="number"` is absent because a number input is a different component
   * with different behaviour (see `NumberInput`) — and because the browser's
   * spinner and scroll-wheel stepping have corrupted more figures in this
   * estate than any other control. `date` likewise: see `DateInput`.
   */
  type?: "text" | "search" | "email" | "url" | "tel" | "password";
  /** A glyph inside the field, at the start. */
  icon?: DechoIconName;
  /** Anything at the end: a unit, a count, a button. */
  trailing?: React.ReactNode;
  /** A ✕ that clears the value. Needs `onValueChange` to do anything. */
  clearable?: boolean;
  /** The change handler most call sites actually want. */
  onValueChange?: (value: string) => void;
  /** For ids, SIDCs and paths, where a proportional font hides a typo. */
  mono?: boolean;
  tokens?: DechoTokenSet;
}

export function TextInput({
  label,
  hint,
  error,
  labelVariant = "plain",
  inline = false,
  optional = false,
  size = "md",
  type = "text",
  icon,
  trailing,
  clearable = false,
  onValueChange,
  onChange,
  mono = false,
  tokens,
  disabled,
  style,
  id,
  ...rest
}: TextInputProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);

  const showClear = clearable && `${rest.value ?? ""}`.length > 0 && disabled !== true;

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
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: t.space[3],
            ...inputStyle({ tokens, invalid: error != null }),
            // The wrapper carries the border and background so that an icon or
            // a unit sits *inside* the field. Padding moves here for the same
            // reason; the input itself becomes transparent and borderless.
            padding: size === "sm" ? `3px ${t.space[3]}` : `5px ${t.space[4]}`,
            opacity: disabled === true ? 0.55 : 1,
            cursor: disabled === true ? "not-allowed" : undefined,
            ...(focused ? focusRingStyle({ tokens }) : {}),
            ...style,
          }}
        >
          {icon != null && (
            <Icon name={icon} size={size === "sm" ? 13 : 14} style={{ color: t.color.textFaint }} />
          )}
          <input
            {...rest}
            {...aria}
            type={type}
            disabled={disabled}
            onFocus={(event) => {
              setFocused(true);
              rest.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              rest.onBlur?.(event);
            }}
            onChange={(event) => {
              onChange?.(event);
              onValueChange?.(event.target.value);
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
              fontFamily: mono ? monoStyle({ tokens }).fontFamily : "inherit",
              fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
              lineHeight: 1.4,
            }}
          />
          {showClear && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => onValueChange?.("")}
              style={{
                display: "flex",
                padding: 2,
                margin: 0,
                border: "none",
                borderRadius: t.radius.sm,
                background: "transparent",
                color: t.color.textFaint,
                cursor: "pointer",
              }}
            >
              <Icon name="close" size={12} />
            </button>
          )}
          {trailing != null && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: t.space[2],
                fontSize: t.fontSize.sm,
                color: t.color.textFaint,
                whiteSpace: "nowrap",
              }}
            >
              {trailing}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}
