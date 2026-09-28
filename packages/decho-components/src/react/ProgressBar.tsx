/**
 * A progress bar.
 *
 * The most duplicated component in the estate: six implementations across the
 * migration widget sets — mapping progress, target mapping progress, load
 * progress, reconciliation, the summary health bar and the data-readiness bar
 * rows — and no two agree on the height, the radius or where the number goes.
 *
 * Two of those disagreements were real, so both survive as `emphasis`:
 *
 *   inline     A label on the left, a track, a number on the right. What a
 *              table row or a list of coverage figures wants.
 *   headline   The label and a large percentage above a tall track, with an
 *              optional caption below. What a widget whose entire job is one
 *              number wants — which is what the mapping-progress widgets are.
 *
 * `role="progressbar"` with the three ARIA values, because the alternative —
 * a coloured div — reads as nothing at all. The percentage is rendered as text
 * as well, so the number does not depend on a screen reader announcing it.
 */

import React from "react";
import {
  resolveTokens,
  toneColors,
  type DechoStatus,
  type DechoTokenSet,
  type DechoTone,
} from "../core/vars.js";

export interface ProgressBarProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "role" | "children"> {
  /** Progress, in the same units as `max`. Clamped into range. */
  value: number;
  /** Defaults to 100, so `value` is a percentage unless you say otherwise. */
  max?: number;
  /** Shown before the track (`inline`) or above it (`headline`). */
  label?: React.ReactNode;
  /** A line below the track: "1,284 of 2,000 fields mapped". */
  caption?: React.ReactNode;
  /**
   * Overrides the rendered number. Pass `false` to hide it — for a bar in a
   * dense table where the figure is already in the next column.
   */
  valueLabel?: React.ReactNode | false;
  /** The fill colour. Defaults to `accent`. */
  tone?: DechoTone;
  /** A RAG state instead of a tone, for "this workstream is at risk" bars. */
  status?: DechoStatus;
  /** Track height: 6, 10 and 28px. `headline` defaults to `lg`. */
  size?: "sm" | "md" | "lg";
  emphasis?: "inline" | "headline";
  /** Renders the track at rest with no fill and no number — for loading. */
  indeterminate?: boolean;
  tokens?: DechoTokenSet;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  caption,
  valueLabel,
  tone = "accent",
  status,
  size,
  emphasis = "inline",
  indeterminate = false,
  tokens,
  style,
  ...rest
}: ProgressBarProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const headline = emphasis === "headline";
  const height = { sm: 6, md: 10, lg: 28 }[size ?? (headline ? "lg" : "md")];

  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = (clamped / safeMax) * 100;

  const fill = status != null ? t.status[status] : toneColors(tone, t.color).fg;

  const number =
    valueLabel === false || indeterminate
      ? null
      : (valueLabel ?? `${Math.round(percent)}%`);

  const track = (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuetext={indeterminate ? "Loading" : undefined}
      aria-label={label == null ? "Progress" : undefined}
      style={{
        position: "relative",
        flex: headline ? undefined : "1 1 auto",
        height,
        minWidth: 40,
        borderRadius: height / 2,
        backgroundColor: t.color.surfaceRaised,
        border: `1px solid ${t.color.borderSubtle}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: indeterminate ? "100%" : `${percent}%`,
          borderRadius: height / 2,
          backgroundColor: indeterminate ? t.color.borderSubtle : fill,
          // The estate animates the width, and it is worth keeping: a bar that
          // jumps between two polls reads as a glitch, one that slides reads as
          // a measurement.
          transition: `width 600ms ease-in-out`,
        }}
      />
    </div>
  );

  if (!headline) {
    return (
      <div
        {...rest}
        style={{
          display: "flex",
          alignItems: "center",
          gap: t.space[3],
          fontFamily: t.fontFamily.sans,
          ...style,
        }}
      >
        {label != null && (
          <div
            style={{
              flex: "0 0 auto",
              fontSize: t.fontSize.md,
              color: t.color.textMuted,
            }}
          >
            {label}
          </div>
        )}
        {track}
        {number != null && (
          <div
            style={{
              flex: "0 0 auto",
              minWidth: 34,
              textAlign: "right",
              fontSize: t.fontSize.md,
              fontWeight: 600,
              color: t.color.text,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {number}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      {...rest}
      style={{ fontFamily: t.fontFamily.sans, ...style }}
    >
      {(label != null || number != null) && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: t.space[3],
            marginBottom: t.space[3],
          }}
        >
          {label != null && (
            <div
              style={{
                fontSize: t.fontSize.xl,
                fontWeight: 600,
                color: t.color.text,
              }}
            >
              {label}
            </div>
          )}
          {number != null && (
            <div
              style={{
                fontSize: 28,
                lineHeight: 1,
                fontWeight: 700,
                color: fill,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {number}
            </div>
          )}
        </div>
      )}
      {track}
      {caption != null && (
        <div
          style={{
            marginTop: t.space[3],
            fontSize: t.fontSize.md,
            color: t.color.textMuted,
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
