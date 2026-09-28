/**
 * Basic charts, in SVG, with no charting dependency.
 *
 * WHY NOT A CHARTING LIBRARY
 * --------------------------
 * Because this package has no dependencies, and these four charts are the ones
 * every operational page draws: a trend line in a card, a handful of bars, a
 * share-of-total, and a RAG grid. Recharts or Vega would be 200kB in every
 * widget that wanted a sparkline, and each consumer would then theme it
 * separately — which is the problem this package exists to solve.
 *
 * The line is where they stop. Anything with axes, zooming, tooltips or time
 * handling wants a real charting library, and it should be a decision made per
 * app, not inherited from a design system.
 *
 * They are unopinionated about data: values in, SVG out, no fetching, no
 * animation, no state. Colours come from the theme's chart series, so two
 * charts in two widgets agree on what "series 1" looks like.
 */

import React from "react";
import { STATUS_LABEL } from "../core/labels.js";
import { monoStyle } from "../core/recipes.js";
import type { DechoPalette } from "../core/recipes.js";
import {
  VAR_TOKENS,
  chartSeries,
  statusColor,
  type DechoStatus,
  type DechoTokenSet,
} from "../core/vars.js";

interface ChartBase {
  tokens?: DechoTokenSet;
  palette?: DechoPalette;
}

/**
 * For the two charts that draw no text.
 *
 * A `palette` overrides colours the recipes read; a sparkline and a donut take
 * theirs from the chart series instead, so accepting one would be a prop that
 * silently does nothing.
 */
interface ChartTokensOnly {
  tokens?: DechoTokenSet;
}

/* ==========================================================================
   Sparkline
   ========================================================================== */

export interface SparklineProps
  extends ChartTokensOnly,
    Omit<React.SVGProps<SVGSVGElement>, "values"> {
  values: number[];
  /** Series index, for when several sparklines sit in one table. */
  series?: number;
  /** Tints the area under the line. Off by default — it crowds a table row. */
  area?: boolean;
  width?: number;
  height?: number;
}

export function Sparkline({
  values,
  series = 0,
  area = false,
  width = 120,
  height = 32,
  tokens,
  ...rest
}: SparklineProps): React.ReactElement {
  const colour = chartSeries(series, tokens);

  // One value cannot make a line, and zero cannot make anything. Render the
  // box rather than NaN-filled path data, which is what a naive min/max does.
  const points = values.length >= 2 ? values : [];
  const min = Math.min(...points);
  const max = Math.max(...points);
  // A flat series has no range; dividing by it yields NaN, so pin it to the
  // middle of the box instead — a flat line is the honest rendering.
  const range = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const y = (v: number) => height - 2 - ((v - min) / range) * (height - 4);

  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${i * stepX},${y(v)}`).join(" ");

  return (
    <svg
      {...rest}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Sparkline, ${points.length} points`}
      style={{ display: "block", overflow: "visible", ...rest.style }}
    >
      {area && points.length >= 2 && (
        <path
          d={`${path} L${width},${height} L0,${height} Z`}
          fill={colour}
          opacity={0.16}
        />
      )}
      <path d={path} fill="none" stroke={colour} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/* ==========================================================================
   Bar chart
   ========================================================================== */

export interface BarDatum {
  label: string;
  value: number;
  /** Overrides the series colour — use for RAG bars. */
  color?: string;
}

export interface BarChartProps extends ChartBase, React.HTMLAttributes<HTMLDivElement> {
  data: BarDatum[];
  /** Bars run left-to-right. The default, because labels fit. */
  horizontal?: boolean;
  height?: number;
  /** Prints the value at the end of each bar. */
  showValues?: boolean;
}

export function BarChart({
  data,
  horizontal = true,
  height = 160,
  showValues = true,
  tokens,
  palette,
  style,
  ...rest
}: BarChartProps): React.ReactElement {
  const t = tokens ?? VAR_TOKENS;
  const colors = palette ?? t.color;
  // Bars are drawn as a proportion of the largest, not of the sum: a bar chart
  // answers "how do these compare", and scaling to the total makes every chart
  // with one dominant value look identical.
  const max = Math.max(...data.map((d) => d.value), 0) || 1;

  if (horizontal) {
    return (
      <div {...rest} style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
        {data.map((d, i) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 96,
                flex: "0 0 auto",
                fontSize: t.fontSize.sm,
                color: colors.textMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={d.label}
            >
              {d.label}
            </span>
            <span style={{ flex: "1 1 auto", height: 10, background: t.chart.grid, borderRadius: t.radius.sm }}>
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${(d.value / max) * 100}%`,
                  background: d.color ?? chartSeries(i, tokens),
                  borderRadius: t.radius.sm,
                }}
              />
            </span>
            {showValues && (
              <span style={{ ...monoStyle({ tokens, palette }), width: 44, textAlign: "right" }}>
                {d.value}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  const barWidth = 100 / Math.max(data.length, 1);
  return (
    <div {...rest} style={{ ...style }}>
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img">
        {data.map((d, i) => {
          const barHeight = (d.value / max) * (height - 16);
          return (
            <rect
              key={d.label}
              x={i * barWidth + barWidth * 0.15}
              y={height - barHeight}
              width={barWidth * 0.7}
              height={barHeight}
              fill={d.color ?? chartSeries(i, tokens)}
            />
          );
        })}
      </svg>
      <div style={{ display: "flex", marginTop: 4 }}>
        {data.map((d) => (
          <span
            key={d.label}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              textAlign: "center",
              fontSize: t.fontSize.xs,
              color: colors.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   Donut
   ========================================================================== */

export interface DonutChartProps
  extends ChartTokensOnly,
    React.HTMLAttributes<HTMLDivElement> {
  data: BarDatum[];
  size?: number;
  /** Ring thickness as a fraction of the radius. */
  thickness?: number;
  /** Shown in the hole. A total, a percentage, a count. */
  centre?: React.ReactNode;
}

export function DonutChart({
  data,
  size = 132,
  thickness = 0.28,
  centre,
  tokens,
  style,
  ...rest
}: DonutChartProps): React.ReactElement {
  const t = tokens ?? VAR_TOKENS;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  // Drawn as one circle per slice using stroke-dasharray rather than arc path
  // maths: the browser does the trigonometry, and a slice is one element that
  // can be hovered or made accessible later without reworking the geometry.
  const radius = size / 2 - (size * thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div
      {...rest}
      style={{ position: "relative", width: size, height: size, ...style }}
    >
      <svg width={size} height={size} role="img" aria-label="Donut chart">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {/* The track, so a partly-filled donut still reads as a ring. */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={t.chart.grid}
            strokeWidth={size * thickness}
          />
          {data.map((d, i) => {
            const fraction = total === 0 ? 0 : d.value / total;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color ?? chartSeries(i, tokens)}
                strokeWidth={size * thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return circle;
          })}
        </g>
      </svg>
      {centre != null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {centre}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   Legend
   ========================================================================== */

export interface ChartLegendProps extends ChartBase, React.HTMLAttributes<HTMLUListElement> {
  items: { label: string; color?: string; value?: React.ReactNode }[];
}

export function ChartLegend({
  items,
  tokens,
  palette,
  style,
  ...rest
}: ChartLegendProps): React.ReactElement {
  const t = tokens ?? VAR_TOKENS;
  const colors = palette ?? t.color;

  return (
    <ul
      {...rest}
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: `${t.space[3]} ${t.space[5]}`,
        ...style,
      }}
    >
      {items.map((item, i) => (
        <li
          key={item.label}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: t.fontSize.sm }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              flex: "0 0 auto",
              borderRadius: t.radius.sm,
              background: item.color ?? chartSeries(i, tokens),
            }}
          />
          <span style={{ color: colors.textMuted }}>{item.label}</span>
          {item.value != null && <span style={{ color: colors.text }}>{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ==========================================================================
   Status heatmap
   ========================================================================== */

export interface HeatmapRow {
  label: string;
  /** One status per column, in column order. `undefined` renders as No Data. */
  cells: (DechoStatus | undefined)[];
}

export interface StatusHeatmapProps extends ChartBase, React.HTMLAttributes<HTMLTableElement> {
  columns: string[];
  rows: HeatmapRow[];
}

/**
 * A RAG grid.
 *
 * A `<table>`, because it is tabular data with row and column headers — which
 * is also what lets a screen reader announce "Supply, Week 3, Critical" rather
 * than reading a wall of empty cells. The status is in the cell's title and
 * its accessible name, never in colour alone.
 */
export function StatusHeatmap({
  columns,
  rows,
  tokens,
  palette,
  style,
  ...rest
}: StatusHeatmapProps): React.ReactElement {
  const t = tokens ?? VAR_TOKENS;
  const colors = palette ?? t.color;

  const headCell: React.CSSProperties = {
    padding: `${t.space[3]} ${t.space[4]}`,
    fontSize: t.fontSize.xs,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: colors.textMuted,
    textAlign: "left",
    whiteSpace: "nowrap",
  };

  return (
    <table
      {...rest}
      style={{ borderCollapse: "separate", borderSpacing: 2, ...style }}
    >
      <thead>
        <tr>
          <th style={headCell} />
          {columns.map((column) => (
            <th key={column} scope="col" style={{ ...headCell, textAlign: "center" }}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" style={{ ...headCell, textTransform: "none", letterSpacing: 0 }}>
              {row.label}
            </th>
            {columns.map((column, i) => {
              const status = row.cells[i] ?? "noData";
              return (
                <td
                  key={column}
                  title={`${row.label} · ${column}: ${STATUS_LABEL[status]}`}
                  style={{
                    minWidth: 44,
                    height: 28,
                    background: statusColor(status, tokens),
                    borderRadius: t.radius.sm,
                  }}
                >
                  <span style={visuallyHidden}>{STATUS_LABEL[status]}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Present for screen readers, absent on screen.
 *
 * Not `display: none`, which removes it from the accessibility tree too — the
 * whole point is that the status is available to a reader without printing the
 * word in every cell.
 */
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
