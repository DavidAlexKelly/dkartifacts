/**
 * A date field, and a range of them.
 *
 * DELIBERATELY THE NATIVE PICKER
 * ------------------------------
 * `<input type="date">` with the field furniture around it — not a hand-drawn
 * calendar. A custom calendar popover is a week of work and a permanent
 * maintenance cost (month navigation, locale-correct week starts, keyboard
 * grid, ranges, min/max, screen-reader announcements), and the native one is
 * already localised, keyboard-navigable and familiar on every platform. The
 * part that is genuinely missing — the label, the hint, the error, the
 * `aria-describedby` — is what this adds.
 *
 * The honest trade: the picker's button and popup cannot be themed, so on a
 * dark theme the calendar itself is whatever the platform draws. `color-scheme`
 * from the token set does most of the work (the browser then draws a dark
 * picker), which is why `effect.colorScheme` exists. If a workflow ever needs
 * a fully themed calendar, that is a separate component and a separate
 * decision — it should not be smuggled in here.
 *
 * The value is an ISO `"YYYY-MM-DD"` string, never a `Date`; see `dateValue.ts`
 * for why that is not a stylistic choice.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle, inputStyle } from "../core/recipes.js";
import { Field } from "./Field.js";
import { Icon } from "./Icon.js";
import {
  daysBetween,
  formatDate,
  isIsoDate,
  normaliseRange,
  type DateRange,
  type IsoDate,
} from "./dateValue.js";

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "size"> {
  /** `null` is an empty field. */
  value: IsoDate | null;
  onValueChange: (value: IsoDate | null) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  labelVariant?: "label" | "plain";
  inline?: boolean;
  optional?: boolean;
  min?: IsoDate;
  max?: IsoDate;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function DateInput({
  value,
  onValueChange,
  label,
  hint,
  error,
  labelVariant = "plain",
  inline = false,
  optional = false,
  min,
  max,
  size = "md",
  tokens,
  disabled,
  style,
  id,
  ...rest
}: DateInputProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);

  // A value that is not a date at all is treated as empty rather than passed
  // to the input, which would silently ignore it and show a blank field while
  // the caller still believed it held something.
  const safe = value != null && isIsoDate(value) ? value : "";

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
            ...inputStyle({ tokens, invalid: error != null }),
            padding: size === "sm" ? `3px ${t.space[3]}` : `4px ${t.space[4]}`,
            opacity: disabled === true ? 0.55 : 1,
            ...(focused ? focusRingStyle({ tokens }) : {}),
            ...style,
          }}
        >
          <Icon name="calendar" style={{ color: t.color.textFaint }} />
          <input
            {...rest}
            {...aria}
            type="date"
            value={safe}
            min={min}
            max={max}
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
              const next = event.target.value;
              onValueChange(next === "" ? null : next);
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
              fontFamily: "inherit",
              fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
              // The one lever over the native picker's own colours: it draws
              // itself dark when the scheme says dark.
              colorScheme: t.effect.colorScheme,
            }}
          />
        </div>
      )}
    </Field>
  );
}

export interface DateRangeInputProps {
  value: DateRange;
  onValueChange: (value: DateRange) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  labelVariant?: "label" | "plain";
  optional?: boolean;
  min?: IsoDate;
  max?: IsoDate;
  size?: "sm" | "md";
  disabled?: boolean;
  /** Show "14 days" under the pair. */
  showSpan?: boolean;
  tokens?: DechoTokenSet;
}

/**
 * Two dates that cannot be the wrong way round.
 *
 * Each field constrains the other with `min`/`max`, so the native picker
 * itself refuses an out-of-order range — and `normaliseRange` catches the
 * typed case, where a user edits the start to something after the end.
 */
export function DateRangeInput({
  value,
  onValueChange,
  label,
  hint,
  error,
  labelVariant = "plain",
  optional = false,
  min,
  max,
  size = "md",
  disabled = false,
  showSpan = true,
  tokens,
}: DateRangeInputProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [from, to] = value;

  const change = (end: 0 | 1) => (next: IsoDate | null): void => {
    const proposed: DateRange = end === 0 ? [next, to] : [from, next];
    onValueChange(normaliseRange(proposed, end));
  };

  const span =
    from != null && to != null && isIsoDate(from) && isIsoDate(to)
      ? daysBetween(from, to)
      : null;

  return (
    <div style={{ display: "grid", gap: t.space[2], fontFamily: t.fontFamily.sans }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: t.space[4] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DateInput
            label={label != null ? label : undefined}
            labelVariant={labelVariant}
            optional={optional}
            value={from}
            onValueChange={change(0)}
            min={min}
            max={to ?? max}
            size={size}
            disabled={disabled}
            aria-label={typeof label === "string" ? `${label}: from` : "From"}
            tokens={tokens}
          />
        </div>
        <span
          aria-hidden="true"
          style={{ paddingBottom: 6, color: t.color.textFaint, fontSize: t.fontSize.md }}
        >
          –
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DateInput
            // No visible label on the second field — the pair has one — but it
            // still needs an accessible name, which `aria-label` gives it.
            value={to}
            onValueChange={change(1)}
            min={from ?? min}
            max={max}
            size={size}
            disabled={disabled}
            aria-label={typeof label === "string" ? `${label}: to` : "To"}
            tokens={tokens}
          />
        </div>
      </div>

      {error != null ? (
        <div role="alert" style={{ fontSize: t.fontSize.sm, color: t.color.danger }}>
          {error}
        </div>
      ) : (
        (hint != null || (showSpan && span != null)) && (
          <div style={{ fontSize: t.fontSize.sm, color: t.color.textMuted }}>
            {hint}
            {hint != null && showSpan && span != null ? " · " : ""}
            {showSpan && span != null
              ? `${span} day${span === 1 ? "" : "s"}${
                  from != null && to != null ? ` (${formatDate(from)} – ${formatDate(to)})` : ""
                }`
              : null}
          </div>
        )
      )}
    </div>
  );
}
