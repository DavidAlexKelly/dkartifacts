/**
 * A legend, standing on its own.
 *
 * `ChartLegend` in `charts.tsx` belongs to the charts and takes their series
 * colours. This one takes states or tones, which is what the estate's
 * standalone legends are for: the dependency-flow readiness key, the heatmap
 * key, the "what the colours on this map mean" strip.
 *
 * `onSelect` turns the entries into filter buttons — the pattern every one of
 * those widgets grew by hand — and `aria-pressed` carries which are active,
 * because a dimmed swatch is not a state a screen reader can see.
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
import { STATUS_LABEL } from "../core/labels.js";

export interface LegendItem {
  /** Defaults to the status's own wording when `status` is given. */
  label?: React.ReactNode;
  status?: DechoStatus;
  tone?: DechoTone;
  color?: string;
  /** A count or share, shown after the label. */
  value?: React.ReactNode;
}

export interface LegendProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "onSelect"> {
  items: LegendItem[];
  direction?: "row" | "column";
  /** Makes each entry a toggle. */
  onSelect?: (item: LegendItem, index: number) => void;
  /** The labels currently active. Entries not listed are dimmed. */
  active?: string[];
  swatch?: "square" | "dot";
  tokens?: DechoTokenSet;
}

export function Legend({
  items,
  direction = "row",
  onSelect,
  active,
  swatch = "square",
  tokens,
  style,
  ...rest
}: LegendProps): React.ReactElement {
  const t = resolveTokens(tokens);

  return (
    <div
      {...rest}
      style={{
        display: "flex",
        flexDirection: direction,
        flexWrap: direction === "row" ? "wrap" : "nowrap",
        gap: direction === "row" ? `${t.space[2]} ${t.space[4]}` : t.space[2],
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      {items.map((item, i) => {
        const colour =
          item.status != null
            ? t.status[item.status]
            : item.tone != null
              ? toneColors(item.tone, t.color).fg
              : (item.color ?? chartSeries(i, tokens));
        const label =
          item.label ?? (item.status != null ? STATUS_LABEL[item.status] : "");
        const key = typeof label === "string" ? label : String(i);
        const isActive = active == null || active.includes(key);

        const content = (
          <>
            <span
              aria-hidden="true"
              style={{
                width: 9,
                height: 9,
                borderRadius: swatch === "dot" ? "50%" : 2,
                backgroundColor: colour,
                flex: "0 0 auto",
              }}
            />
            <span>{label}</span>
            {item.value != null && (
              <span
                style={{
                  color: t.color.text,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {item.value}
              </span>
            )}
          </>
        );

        const shared: React.CSSProperties = {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: t.fontSize.md,
          color: t.color.textMuted,
          opacity: isActive ? 1 : 0.4,
          transition: `opacity ${t.effect.transition}`,
        };

        return onSelect != null ? (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(item, i)}
            style={{
              ...shared,
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              cursor: "pointer",
            }}
          >
            {content}
          </button>
        ) : (
          <span key={key} style={shared}>
            {content}
          </span>
        );
      })}
    </div>
  );
}
