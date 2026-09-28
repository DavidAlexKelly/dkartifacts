/**
 * A single bar split into parts, with an optional legend.
 *
 * The estate's composition bar: how many objects are complete, in flight, at
 * risk, untouched — the one chart that answers "of the whole, how much" in a
 * strip of space a donut could not use.
 *
 * `onSelect` makes each band a real `<button>` with a label of the form
 * "Complete: 412 (38%)", which is the version of this that survived
 * accessibility review in the migration widgets: a clickable `<div>` band is
 * invisible to a keyboard and its share is invisible to a screen reader.
 */

import React from "react";
import {
  resolveTokens,
  chartSeries,
  toneColors,
  type DechoStatus,
  type DechoTokenSet,
  type DechoTone,
} from "../core/vars.js";

export interface StackedBarSegment {
  label: string;
  value: number;
  /** A RAG state. Wins over `tone` and `color`. */
  status?: DechoStatus;
  tone?: DechoTone;
  /** A literal, for a series that is neither a state nor a tone. */
  color?: string;
}

export interface StackedBarProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "onSelect"> {
  segments: StackedBarSegment[];
  /** Defaults to the sum, which is what "share of total" means. */
  total?: number;
  height?: number;
  /** Below the bar: a swatch, a label and the figure for each segment. */
  legend?: boolean;
  onSelect?: (segment: StackedBarSegment, index: number) => void;
  /** Dims every band but this one. */
  selectedLabel?: string;
  tokens?: DechoTokenSet;
}

export function StackedBar({
  segments,
  total,
  height = 14,
  legend = false,
  onSelect,
  selectedLabel,
  tokens,
  style,
  ...rest
}: StackedBarProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const sum = segments.reduce((n, s) => n + Math.max(s.value, 0), 0);
  const denominator = total != null && total > 0 ? total : sum > 0 ? sum : 1;

  const colourOf = (s: StackedBarSegment, i: number): string =>
    s.status != null
      ? t.status[s.status]
      : s.tone != null
        ? toneColors(s.tone, t.color).fg
        : (s.color ?? chartSeries(i, tokens));

  const share = (value: number) => (Math.max(value, 0) / denominator) * 100;

  return (
    <div {...rest} style={{ fontFamily: t.fontFamily.sans, ...style }}>
      <div
        style={{
          display: "flex",
          height,
          borderRadius: height / 2,
          overflow: "hidden",
          backgroundColor: t.color.surfaceRaised,
          border: `1px solid ${t.color.borderSubtle}`,
        }}
      >
        {segments.map((segment, i) => {
          const percent = share(segment.value);
          if (percent <= 0) {return null;}
          const colour = colourOf(segment, i);
          const dimmed = selectedLabel != null && selectedLabel !== segment.label;
          const name = `${segment.label}: ${segment.value} (${Math.round(percent)}%)`;

          const bandStyle: React.CSSProperties = {
            width: `${percent}%`,
            backgroundColor: colour,
            opacity: dimmed ? 0.35 : 1,
            border: "none",
            padding: 0,
            transition: `opacity ${t.effect.transition}, width 600ms ease-in-out`,
          };

          return onSelect != null ? (
            <button
              key={segment.label}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={selectedLabel === segment.label}
              onClick={() => onSelect(segment, i)}
              style={{ ...bandStyle, cursor: "pointer" }}
            />
          ) : (
            <div
              key={segment.label}
              title={name}
              role="img"
              aria-label={name}
              style={bandStyle}
            />
          );
        })}
      </div>

      {legend && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: `${t.space[2]} ${t.space[4]}`,
            marginTop: t.space[3],
          }}
        >
          {segments.map((segment, i) => (
            <span
              key={segment.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: t.fontSize.md,
                color: t.color.textMuted,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  backgroundColor: colourOf(segment, i),
                  flex: "0 0 auto",
                }}
              />
              {segment.label}
              <span
                style={{
                  color: t.color.text,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {segment.value}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
