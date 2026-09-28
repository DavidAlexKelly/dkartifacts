/**
 * Where you are in a multi-step flow, and what is left.
 *
 * The migration workflow is design → load → readiness → sign-off, and every
 * widget that shows it draws its own row of circles. None of them says which
 * step is current in any way other than colour, which is the one way a
 * colour-blind user cannot read — and none is navigable, so a step you have
 * already completed cannot be gone back to.
 *
 * `aria-current="step"` is the fix for the first. For the second, a step is a
 * button when `onStepSelect` is given and a plain element otherwise: a
 * non-interactive step that looks clickable is worse than one that does not.
 */

import React from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";
import { focusRingStyle } from "../core/recipes.js";
import { Icon } from "./Icon.js";
import { SR_ONLY } from "./fieldAria.js";

export type StepState = "complete" | "current" | "upcoming" | "error" | "skipped";

export interface Step {
  key: string;
  label: React.ReactNode;
  /** One line under the label. */
  description?: React.ReactNode;
  /** Derived from `current` when omitted; set it for errors and skips. */
  state?: StepState;
  disabled?: boolean;
}

export interface StepperProps extends Omit<React.HTMLAttributes<HTMLElement>, "onSelect"> {
  steps: Step[];
  /** Index of the current step. */
  current: number;
  /** Makes the steps buttons. Omit for a read-only progress spine. */
  onStepSelect?: (key: string, index: number) => void;
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function Stepper({
  steps,
  current,
  onStepSelect,
  orientation = "horizontal",
  size = "md",
  tokens,
  style,
  ...rest
}: StepperProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const horizontal = orientation === "horizontal";
  const dot = size === "sm" ? 20 : 24;

  const stateOf = (step: Step, index: number): StepState =>
    step.state ?? (index < current ? "complete" : index === current ? "current" : "upcoming");

  const colourOf = (state: StepState): { ring: string; fill: string; ink: string } => {
    switch (state) {
      case "complete":
        return { ring: t.color.success, fill: t.color.success, ink: t.color.onAccent };
      case "current":
        return { ring: t.color.accent, fill: t.color.accentTint, ink: t.color.accent };
      case "error":
        return { ring: t.color.danger, fill: t.color.dangerTint, ink: t.color.danger };
      case "skipped":
        return { ring: t.color.border, fill: t.color.neutralTint, ink: t.color.textFaint };
      default:
        return { ring: t.color.border, fill: t.color.surface, ink: t.color.textMuted };
    }
  };

  return (
    <nav
      {...rest}
      aria-label="Progress"
      style={{ fontFamily: t.fontFamily.sans, ...style }}
    >
      <ol
        style={{
          display: "flex",
          flexDirection: horizontal ? "row" : "column",
          alignItems: horizontal ? "flex-start" : "stretch",
          gap: 0,
          margin: 0,
          padding: 0,
          listStyle: "none",
        }}
      >
        {steps.map((step, index) => {
          const state = stateOf(step, index);
          const colours = colourOf(state);
          const last = index === steps.length - 1;
          const interactive = onStepSelect != null && step.disabled !== true;

          const marker = (
            <span
              aria-hidden="true"
              style={{
                display: "grid",
                placeItems: "center",
                flex: "0 0 auto",
                width: dot,
                height: dot,
                borderRadius: "50%",
                border: `1.5px solid ${colours.ring}`,
                background: colours.fill,
                color: state === "complete" ? colours.ink : colours.ink,
                fontSize: t.fontSize.sm,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {state === "complete" ? (
                <Icon name="check" size={dot - 10} strokeWidth={2.2} />
              ) : state === "error" ? (
                <Icon name="warning" size={dot - 10} />
              ) : state === "skipped" ? (
                <Icon name="minus" size={dot - 10} />
              ) : (
                index + 1
              )}
            </span>
          );

          const body = (
            <span style={{ display: "grid", gap: 1, minWidth: 0, textAlign: "left" }}>
              <span
                style={{
                  fontSize: size === "sm" ? t.fontSize.sm : t.fontSize.md,
                  fontWeight: state === "current" ? 600 : 400,
                  color: state === "upcoming" ? t.color.textMuted : t.color.text,
                }}
              >
                {step.label}
              </span>
              {step.description != null && (
                <span style={{ fontSize: t.fontSize.sm, color: t.color.textMuted }}>
                  {step.description}
                </span>
              )}
              {/*
                The state in words, for anyone who cannot use the colour or the
                glyph. Not visible, but announced with the step's name.
              */}
              <span style={SR_ONLY}>{`(${state})`}</span>
            </span>
          );

          return (
            <li
              key={step.key}
              // `step` rather than `true`: the value says what kind of current
              // this is, and screen readers read it as "current step".
              aria-current={state === "current" ? "step" : undefined}
              style={{
                display: "flex",
                flexDirection: horizontal ? "column" : "row",
                alignItems: horizontal ? "center" : "flex-start",
                gap: horizontal ? t.space[3] : t.space[4],
                flex: horizontal ? 1 : undefined,
                minWidth: 0,
                position: "relative",
                paddingBottom: horizontal ? 0 : last ? 0 : t.space[6],
              }}
            >
              <span
                style={{
                  display: "flex",
                  flexDirection: horizontal ? "row" : "column",
                  alignItems: "center",
                  gap: horizontal ? t.space[3] : 0,
                  width: horizontal ? "100%" : undefined,
                  alignSelf: horizontal ? undefined : "stretch",
                }}
              >
                {interactive ? (
                  <StepButton onClick={() => onStepSelect?.(step.key, index)} tokens={tokens}>
                    {marker}
                  </StepButton>
                ) : (
                  marker
                )}
                {!last && (
                  <span
                    aria-hidden="true"
                    style={{
                      flex: horizontal ? 1 : undefined,
                      width: horizontal ? undefined : 1.5,
                      height: horizontal ? 1.5 : "100%",
                      minHeight: horizontal ? undefined : t.space[6],
                      background:
                        index < current ? t.color.success : t.color.borderSubtle,
                    }}
                  />
                )}
              </span>
              {interactive ? (
                <StepButton onClick={() => onStepSelect?.(step.key, index)} tokens={tokens}>
                  {body}
                </StepButton>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepButton({
  onClick,
  tokens,
  children,
}: {
  onClick: () => void;
  tokens?: DechoTokenSet;
  children: React.ReactNode;
}): React.ReactElement {
  const t = resolveTokens(tokens);
  const [focused, setFocused] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: "flex",
        padding: 2,
        border: "none",
        borderRadius: t.radius.sm,
        background: "transparent",
        color: "inherit",
        font: "inherit",
        cursor: "pointer",
        outline: "none",
        ...(focused ? focusRingStyle({ tokens }) : {}),
      }}
    >
      {children}
    </button>
  );
}
