/**
 * A switch: on or off, applied immediately.
 *
 * A toggle and a checkbox are not interchangeable, and picking the wrong one
 * is a user-interface lie. A checkbox is a value you are *editing*, saved when
 * you press Save. A switch takes effect the moment it moves. The basemap
 * widgets get this right by accident (their layer toggles are instant) and the
 * settings panels get it wrong (checkboxes that apply instantly, so Cancel
 * cannot cancel).
 *
 * `role="switch"` is the difference in what a screen reader says: "on"/"off"
 * rather than "checked"/"unchecked". Same input underneath, so the keyboard
 * and the form behaviour are unchanged.
 *
 * `busy` exists because a switch that applies immediately is usually applying
 * something asynchronous. Without it, every consumer writes their own
 * "optimistically on, but actually still saving" state — and the estate's
 * versions all allow a second click mid-flight, which is how a layer ends up
 * toggled twice and back to where it started.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle } from "../core/recipes.js";
import { SR_ONLY } from "./fieldAria.js";

export interface ToggleProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "onChange"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Applying. Blocks further clicks and says so to assistive technology. */
  busy?: boolean;
  size?: "sm" | "md";
  /** Label to the left, switch pushed to the right — a settings row. */
  spread?: boolean;
  tokens?: DechoTokenSet;
}

export function Toggle({
  label,
  description,
  checked,
  onCheckedChange,
  busy = false,
  size = "md",
  spread = false,
  tokens,
  disabled,
  style,
  ...rest
}: ToggleProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);
  const generated = React.useId();
  const id = rest.id ?? generated;
  const descriptionId = `${id}-description`;

  const height = size === "sm" ? 14 : 18;
  const width = height * 1.8;
  const knob = height - 4;
  const off = disabled === true || busy;

  // Built once and placed on either side of the switch. Rendering it twice —
  // once per layout — is how the `spread` variant ended up with an
  // `aria-describedby` pointing at an id that only existed in the other
  // branch, which is a silent description of nothing.
  const text =
    label == null && description == null ? null : (
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        {label != null && (
          <label
            htmlFor={id}
            style={{
              fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
              color: off ? t.color.textFaint : t.color.text,
              cursor: off ? "not-allowed" : "pointer",
            }}
          >
            {label}
          </label>
        )}
        {description != null && (
          <span
            id={descriptionId}
            style={{ fontSize: t.fontSize.sm, lineHeight: 1.45, color: t.color.textMuted }}
          >
            {description}
          </span>
        )}
      </span>
    );

  return (
    <div
      style={{
        display: "flex",
        alignItems: description != null ? "flex-start" : "center",
        justifyContent: spread ? "space-between" : undefined,
        gap: t.space[4],
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      {spread && text}

      <span style={{ position: "relative", display: "flex", flex: "0 0 auto" }}>
        <input
          {...rest}
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={off}
          aria-busy={busy ? true : undefined}
          aria-describedby={description != null ? descriptionId : undefined}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
          onChange={(event) => onCheckedChange(event.target.checked)}
          style={SR_ONLY}
        />
        <span
          aria-hidden="true"
          style={{
            display: "block",
            width,
            height,
            borderRadius: t.radius.pill,
            background: checked ? t.color.accent : t.color.borderStrong,
            opacity: off ? 0.55 : 1,
            transition: t.effect.transition,
            cursor: off ? "not-allowed" : "pointer",
            ...(focused ? focusRingStyle({ tokens }) : {}),
          }}
        >
          <span
            style={{
              display: "block",
              width: knob,
              height: knob,
              margin: 2,
              borderRadius: "50%",
              background: t.color.onAccent,
              // `translate` rather than a left offset: it animates on the
              // compositor, so a row of forty layer toggles does not repaint.
              transform: `translateX(${checked ? width - knob - 4 : 0}px)`,
              transition: t.effect.transition,
              boxShadow: t.shadow.sm,
            }}
          />
        </span>
      </span>

      {!spread && text}
    </div>
  );
}
