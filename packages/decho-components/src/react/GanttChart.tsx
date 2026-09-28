/**
 * A plan: tasks as bars against a date axis.
 *
 * Geometry in `ganttScale.ts`; this is the rows, the axis and the today line.
 * Deliberately a *reading* Gantt rather than an editing one — no dragging bars
 * around, no resizing. Editing a plan in a chart is a product in itself, and
 * the plans in this estate are edited in the source system and read here.
 *
 * WHAT IT DOES HAVE, THAT THE HAND-ROLLED ONES DO NOT
 * ---------------------------------------------------
 *   - Inclusive dates, so a one-day task is one day wide rather than zero.
 *   - Clipping arrows, so a bar that runs off the window says so instead of
 *     pretending the task ends where the chart does.
 *   - A today line, which is the first thing anybody looks for.
 *   - A text alternative per row: the bars are `aria-hidden` and each row
 *     carries its dates in words, because a chart made of divs is otherwise
 *     silent.
 */

import React from "react";
import { resolveTokens, statusColor, toneColors, type DechoStatus, type DechoTokenSet, type DechoTone } from "../core/vars.js";
import { formatDate, type IsoDate } from "./dateValue.js";
import { ganttScale, ticksFor } from "./ganttScale.js";

export interface GanttTask {
  id: string;
  label: React.ReactNode;
  start: IsoDate;
  /** Inclusive: a task from the 1st to the 1st lasts one day. */
  end: IsoDate;
  /** 0–100. Draws a darker fill inside the bar. */
  progress?: number;
  /** A RAG state, which wins over `tone` — a plan is usually RAG. */
  status?: DechoStatus;
  tone?: DechoTone;
  /** A milestone: drawn as a diamond at `start`, ignoring `end`. */
  milestone?: boolean;
  /** Indent, for a task under a phase. */
  depth?: number;
}

export interface GanttChartProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  tasks: GanttTask[];
  /** The window. Defaults to the span of the tasks. */
  from?: IsoDate;
  to?: IsoDate;
  /** Width of the label column. */
  labelWidth?: number;
  rowHeight?: number;
  /** Draw a line at this date. Pass `today()` for the usual case. */
  today?: IsoDate;
  tokens?: DechoTokenSet;
}

export function GanttChart({
  tasks,
  from,
  to,
  labelWidth = 180,
  rowHeight = 28,
  today,
  tokens,
  style,
  ...rest
}: GanttChartProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [width, setWidth] = React.useState(600);
  const plot = React.useRef<HTMLDivElement>(null);

  // The plot width is needed in pixels to place anything, and it is only known
  // once laid out. ResizeObserver rather than a window listener: a widget can
  // be resized by its host without the window changing at all.
  React.useLayoutEffect(() => {
    const element = plot.current;
    if (element == null) {
      return;
    }
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry != null) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const dates = tasks.flatMap((task) => [task.start, task.end]);
  const windowFrom = from ?? dates.slice().sort()[0] ?? "2026-01-01";
  const windowTo = to ?? dates.slice().sort().reverse()[0] ?? windowFrom;

  const scale = ganttScale({ from: windowFrom, to: windowTo, width: Math.max(1, width) });
  const ticks = ticksFor(scale.from, scale.to);

  const colourOf = (task: GanttTask): string =>
    task.status != null
      ? statusColor(task.status, tokens)
      : toneColors(task.tone ?? "accent", t.color).fg;

  return (
    <div
      {...rest}
      style={{
        border: `1px solid ${t.color.borderSubtle}`,
        borderRadius: t.radius.lg,
        background: t.color.surface,
        fontFamily: t.fontFamily.sans,
        fontSize: t.fontSize.sm,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Axis */}
      <div style={{ display: "flex", borderBottom: `1px solid ${t.color.borderSubtle}` }}>
        <div style={{ flex: `0 0 ${labelWidth}px`, padding: t.space[3], color: t.color.textMuted }}>
          {`${formatDate(scale.from)} – ${formatDate(scale.to)}`}
        </div>
        <div style={{ position: "relative", flex: 1, height: 26 }}>
          {ticks.map((tick) => (
            <span
              key={tick.date}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: scale.x(tick.date),
                top: 0,
                bottom: 0,
                paddingLeft: 3,
                borderLeft: `1px solid ${t.color.borderSubtle}`,
                color: t.color.textFaint,
                fontSize: t.fontSize.xs,
                whiteSpace: "nowrap",
                lineHeight: "26px",
              }}
            >
              {tick.unit === "month"
                ? formatDate(tick.date, { month: "short" })
                : formatDate(tick.date, { day: "numeric", month: "short" })}
            </span>
          ))}
        </div>
      </div>

      {/* Rows */}
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {tasks.map((task) => {
          const bar = scale.bar(task.start, task.end);
          const colour = colourOf(task);
          return (
            <li
              key={task.id}
              style={{
                display: "flex",
                alignItems: "center",
                borderBottom: `1px solid ${t.color.borderSubtle}`,
                minHeight: rowHeight,
              }}
            >
              <div
                style={{
                  flex: `0 0 ${labelWidth}px`,
                  padding: `0 ${t.space[4]}`,
                  paddingLeft: `calc(${t.space[4]} + ${(task.depth ?? 0) * 12}px)`,
                  color: t.color.text,
                  fontSize: t.fontSize.md,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {task.label}
              </div>

              <div ref={plot} style={{ position: "relative", flex: 1, height: rowHeight }}>
                {task.milestone === true ? (
                  <span
                    aria-hidden="true"
                    title={formatDate(task.start)}
                    style={{
                      position: "absolute",
                      left: scale.x(task.start),
                      top: "50%",
                      width: 10,
                      height: 10,
                      marginTop: -5,
                      marginLeft: -5,
                      background: colour,
                      transform: "rotate(45deg)",
                    }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: bar.x,
                      width: bar.width,
                      top: "50%",
                      height: 12,
                      marginTop: -6,
                      // Square off the clipped end, so a bar that continues
                      // past the window does not look like it stops there.
                      borderRadius: `${bar.clippedStart ? 0 : 6}px ${bar.clippedEnd ? 0 : 6}px ${
                        bar.clippedEnd ? 0 : 6
                      }px ${bar.clippedStart ? 0 : 6}px`,
                      background: `color-mix(in srgb, ${colour} 28%, ${t.color.surface})`,
                      border: `1px solid ${colour}`,
                      overflow: "hidden",
                    }}
                  >
                    {task.progress != null && (
                      <span
                        style={{
                          display: "block",
                          width: `${Math.min(100, Math.max(0, task.progress))}%`,
                          height: "100%",
                          background: colour,
                        }}
                      />
                    )}
                  </span>
                )}

                {/* The text alternative. A chart of divs says nothing without
                    it, and "Cutover, 1 Mar to 14 Mar, 60% complete" is what a
                    screen-reader user needs from this row. */}
                <span
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                    clip: "rect(0 0 0 0)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {task.milestone === true
                    ? `Milestone, ${formatDate(task.start)}`
                    : `${formatDate(task.start)} to ${formatDate(task.end)}${
                        task.progress != null ? `, ${task.progress}% complete` : ""
                      }${bar.clippedStart || bar.clippedEnd ? ", extends beyond the chart" : ""}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Today */}
      {today != null && (
        <div style={{ display: "flex", position: "relative", height: 0 }} aria-hidden="true">
          <div style={{ flex: `0 0 ${labelWidth}px` }} />
          <div style={{ position: "relative", flex: 1 }}>
            <span
              style={{
                position: "absolute",
                left: scale.x(today),
                bottom: 0,
                width: 1,
                height: tasks.length * rowHeight + 26,
                background: t.color.danger,
                opacity: 0.7,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
