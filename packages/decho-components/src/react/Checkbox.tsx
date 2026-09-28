/**
 * A checkbox that follows the accent, and has a third state.
 *
 * WHY NOT JUST STYLE THE NATIVE ONE
 * ---------------------------------
 * You cannot. `accent-color` gets you the fill and nothing else — not the
 * border, the radius, the check mark or the disabled treatment — and on a dark
 * theme the unchecked box stays white because it is painted by the platform,
 * not the page. That is why every checkbox in the estate looks like it belongs
 * to a different application than the row it is in.
 *
 * So the real input is still there, visually hidden: it keeps the keyboard
 * behaviour, the form participation, the label association and the
 * announcement. The visible box is a sibling that reacts to its state. This is
 * the standard technique and the only one that does not cost accessibility.
 *
 * THE THIRD STATE IS NOT COSMETIC
 * -------------------------------
 * `indeterminate` is a DOM property, not an attribute, so it can only be set
 * from a ref — which is why hand-rolled "select all" headers in this estate
 * show an unchecked box when some rows are selected. "Some" then reads as
 * "none", and the next click selects everything rather than clearing it.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle } from "../core/recipes.js";
import { SR_ONLY } from "./fieldAria.js";
import { Icon } from "./Icon.js";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "onChange"> {
  label?: React.ReactNode;
  /** A sentence under the label — what ticking it will actually do. */
  description?: React.ReactNode;
  checked?: boolean;
  /** Some, but not all. Sets the DOM property and `aria-checked="mixed"`. */
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function Checkbox({
  label,
  description,
  checked = false,
  indeterminate = false,
  onCheckedChange,
  size = "md",
  tokens,
  disabled,
  style,
  ...rest
}: CheckboxProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const generated = React.useId();
  const id = rest.id ?? generated;
  const descriptionId = `${id}-description`;

  React.useEffect(() => {
    if (ref.current != null) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const box = size === "sm" ? 14 : 16;
  const on = checked || indeterminate;

  return (
    <div style={{ display: "flex", gap: t.space[4], alignItems: "flex-start", ...style }}>
      <span style={{ position: "relative", display: "flex", flex: "0 0 auto", marginTop: 1 }}>
        <input
          {...rest}
          ref={ref}
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-checked={indeterminate ? "mixed" : checked}
          aria-describedby={description != null ? descriptionId : undefined}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
          onChange={(event) => onCheckedChange?.(event.target.checked)}
          style={SR_ONLY}
        />
        {/*
          `aria-hidden`, because the input above is the control. Painting a
          second focusable thing here is how you end up tabbing twice through
          one checkbox.
        */}
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            width: box,
            height: box,
            borderRadius: t.radius.sm,
            border: `1px solid ${on ? t.color.accent : t.color.border}`,
            background: on ? t.color.accent : t.color.bg,
            color: t.color.onAccent,
            opacity: disabled === true ? 0.5 : 1,
            transition: t.effect.transition,
            ...(focused ? focusRingStyle({ tokens }) : {}),
          }}
        >
          {indeterminate ? (
            <Icon name="minus" size={box - 5} strokeWidth={2} />
          ) : checked ? (
            <Icon name="check" size={box - 4} strokeWidth={2.2} />
          ) : null}
        </span>
      </span>

      {(label != null || description != null) && (
        <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
          {label != null && (
            <label
              htmlFor={id}
              style={{
                fontFamily: t.fontFamily.sans,
                fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
                lineHeight: 1.4,
                color: disabled === true ? t.color.textFaint : t.color.text,
                cursor: disabled === true ? "not-allowed" : "pointer",
              }}
            >
              {label}
            </label>
          )}
          {description != null && (
            <span
              id={descriptionId}
              style={{
                fontFamily: t.fontFamily.sans,
                fontSize: t.fontSize.sm,
                lineHeight: 1.45,
                color: t.color.textMuted,
              }}
            >
              {description}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
