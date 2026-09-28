/**
 * Multi-line text, with the two things every hand-rolled one forgets.
 *
 * First, a character counter that is *described* rather than just displayed —
 * `aria-describedby` picks it up, so a screen-reader user knows the limit
 * before typing 400 characters into a 200-character field. Second,
 * `maxLength` on its own silently truncates paste, so the counter is the only
 * warning the user gets; it turns red before the limit rather than after.
 *
 * `autoGrow` is off by default. A textarea that resizes as you type is
 * pleasant in a form and awful in a fixed-height widget, where it pushes the
 * save button out of the visible area — which is how the comment box in the
 * readiness widget ended up unusable at small heights.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle, inputStyle } from "../core/recipes.js";
import { Field } from "./Field.js";
import { SR_ONLY, useFieldAria } from "./fieldAria.js";

export interface TextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  labelVariant?: "label" | "plain";
  optional?: boolean;
  rows?: number;
  /** Show "128 / 200" under the field. Requires `maxLength`. */
  counter?: boolean;
  /** Grow with the content instead of scrolling. Off by default; see above. */
  autoGrow?: boolean;
  onValueChange?: (value: string) => void;
  tokens?: DechoTokenSet;
}

export function TextArea({
  label,
  hint,
  error,
  labelVariant = "plain",
  optional = false,
  rows = 3,
  counter = false,
  autoGrow = false,
  onValueChange,
  onChange,
  tokens,
  disabled,
  style,
  id,
  ...rest
}: TextAreaProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const value = `${rest.value ?? rest.defaultValue ?? ""}`;
  const max = rest.maxLength;
  const showCounter = counter && typeof max === "number";
  // Ids for the counter have to be generated here rather than by `Field`,
  // because the counter is an extra description and `Field` only knows about
  // the hint and the error.
  const { controlId } = useFieldAria({ id });
  const counterId = `${controlId}-count`;

  React.useEffect(() => {
    if (!autoGrow || ref.current == null) {
      return;
    }
    const element = ref.current;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [autoGrow, value]);

  const nearLimit = typeof max === "number" && value.length >= max * 0.9;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      optional={optional}
      labelVariant={labelVariant}
      id={controlId}
      tokens={tokens}
    >
      {(aria) => (
        <>
          <textarea
            {...rest}
            {...aria}
            aria-describedby={
              showCounter
                ? [aria["aria-describedby"], counterId].filter(Boolean).join(" ")
                : aria["aria-describedby"]
            }
            ref={ref}
            rows={rows}
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
              ...inputStyle({ tokens, invalid: error != null }),
              display: "block",
              resize: autoGrow ? "none" : "vertical",
              overflow: autoGrow ? "hidden" : undefined,
              minHeight: autoGrow ? undefined : 0,
              opacity: disabled === true ? 0.55 : 1,
              ...(focused ? focusRingStyle({ tokens }) : {}),
              ...style,
            }}
          />
          {showCounter && (
            <div
              id={counterId}
              style={{
                marginTop: t.space[2],
                textAlign: "right",
                fontSize: t.fontSize.sm,
                color: nearLimit ? t.color.warning : t.color.textFaint,
              }}
            >
              <span aria-hidden="true">{`${value.length} / ${max}`}</span>
              <span style={SR_ONLY}>{`${value.length} of ${max} characters used`}</span>
            </div>
          )}
        </>
      )}
    </Field>
  );
}
