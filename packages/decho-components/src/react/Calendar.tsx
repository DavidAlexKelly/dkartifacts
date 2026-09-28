/**
 * A month, with things on it.
 *
 * Grid in `monthGrid.ts`; this is the chrome, the events and the keyboard. Two
 * jobs in one component, which is deliberate: a cutover calendar and a date
 * picker are the same grid, and the second is what makes a themed alternative
 * to the native date input possible later without a second month grid.
 *
 * WEEK START AND WEEKDAY NAMES COME FROM `Intl`
 * ---------------------------------------------
 * A calendar with hard-coded "Mon Tue Wed" is a calendar in English forever,
 * and one that hard-codes a Monday start is wrong for half the world. Both are
 * props with locale-aware defaults.
 */

import React from "react";
import { focusRingStyle } from "../core/recipes.js";
import { resolveTokens, toneColors, type DechoTokenSet, type DechoTone } from "../core/vars.js";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
import { addDays, formatDate, type IsoDate } from "./dateValue.js";
import { monthGrid, monthOf, shiftMonth, weekdayLabels, type IsoMonth } from "./monthGrid.js";

export interface CalendarEvent {
  id: string;
  date: IsoDate;
  label: string;
  tone?: DechoTone;
}

export interface CalendarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  /** The month shown. Uncontrolled from `defaultMonth` when omitted. */
  month?: IsoMonth;
  onMonthChange?: (month: IsoMonth) => void;
  defaultMonth?: IsoMonth;
  /** The chosen day, if this is being used as a picker. */
  selected?: IsoDate | null;
  onSelect?: (date: IsoDate) => void;
  events?: CalendarEvent[];
  /** Marked with a ring. Pass `today()`; not read from the clock here. */
  today?: IsoDate;
  min?: IsoDate;
  max?: IsoDate;
  weekStartsOn?: 0 | 1;
  locale?: string;
  /** Taller cells with event labels, rather than dots. */
  size?: "compact" | "full";
  tokens?: DechoTokenSet;
}

export function Calendar({
  month,
  onMonthChange,
  defaultMonth,
  selected,
  onSelect,
  events = [],
  today,
  min,
  max,
  weekStartsOn = 1,
  locale,
  size = "compact",
  tokens,
  style,
  ...rest
}: CalendarProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const [internalMonth, setInternalMonth] = React.useState<IsoMonth>(
    defaultMonth ?? (selected != null ? monthOf(selected) : today != null ? monthOf(today) : "2026-01"),
  );
  const shown = month ?? internalMonth;
  const [focusedDate, setFocusedDate] = React.useState<IsoDate | null>(null);

  const grid = monthGrid(shown, today != null ? { weekStartsOn, today } : { weekStartsOn });
  const labels = weekdayLabels(weekStartsOn, locale, size === "compact" ? "narrow" : "short");

  const byDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      map.set(event.date, [...(map.get(event.date) ?? []), event]);
    }
    return map;
  }, [events]);

  const go = (delta: number): void => {
    const next = shiftMonth(shown, delta);
    if (month == null) {
      setInternalMonth(next);
    }
    onMonthChange?.(next);
  };

  const outOfRange = (date: IsoDate): boolean =>
    (min != null && date < min) || (max != null && date > max);

  const onKeyDown = (event: React.KeyboardEvent, date: IsoDate): void => {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = moves[event.key];
    if (delta == null) {
      return;
    }
    event.preventDefault();
    const target = addDays(date, delta);
    // Moving off the edge of the month pages it, which is what makes the
    // keyboard usable for anything more than a week away.
    if (monthOf(target) !== shown) {
      const next = monthOf(target);
      if (month == null) {
        setInternalMonth(next);
      }
      onMonthChange?.(next);
    }
    setFocusedDate(target);
    // The next render puts the button in the DOM; focusing it here would
    // target the element that is about to be replaced.
    window.setTimeout(() => {
      document.getElementById(`${gridId}-${target}`)?.focus();
    }, 0);
  };

  const gridId = React.useId();
  const cell = size === "compact" ? 30 : 64;

  return (
    <div
      {...rest}
      style={{
        display: "inline-grid",
        gap: t.space[3],
        padding: t.space[4],
        border: `1px solid ${t.color.borderSubtle}`,
        borderRadius: t.radius.lg,
        background: t.color.surface,
        fontFamily: t.fontFamily.sans,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.space[4] }}>
        <Button size="sm" iconOnly aria-label="Previous month" onClick={() => go(-1)} tokens={tokens}>
          <Icon name="chevronLeft" />
        </Button>
        {/* A live region: paging with the buttons otherwise announces nothing,
            and the grid's contents changing silently is disorienting. */}
        <span aria-live="polite" style={{ fontWeight: 600, fontSize: t.fontSize.md, color: t.color.text }}>
          {formatDate(`${shown}-01`, { month: "long", year: "numeric" }, locale)}
        </span>
        <Button size="sm" iconOnly aria-label="Next month" onClick={() => go(1)} tokens={tokens}>
          <Icon name="chevronRight" />
        </Button>
      </div>

      <table role="grid" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {labels.map((label, index) => (
              <th
                key={`${label}-${index}`}
                scope="col"
                // `abbr` so a narrow "M" is announced as the full day name.
                abbr={weekdayLabels(weekStartsOn, locale, "short")[index]}
                style={{
                  padding: t.space[2],
                  fontSize: t.fontSize.xs,
                  fontWeight: 600,
                  color: t.color.textFaint,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.weeks.map((week) => (
            <tr key={week[0]?.date}>
              {week.map((day) => {
                const dayEvents = byDate.get(day.date) ?? [];
                const isSelected = selected === day.date;
                const disabled = outOfRange(day.date);
                const isFocusTarget =
                  focusedDate === day.date ||
                  (focusedDate == null && (selected === day.date || (selected == null && day.isToday)));

                return (
                  <td key={day.date} style={{ padding: 1 }}>
                    <button
                      id={`${gridId}-${day.date}`}
                      type="button"
                      // One tab stop for the grid: the arrows move within it.
                      tabIndex={isFocusTarget ? 0 : -1}
                      aria-current={day.isToday ? "date" : undefined}
                      aria-pressed={onSelect != null ? isSelected : undefined}
                      aria-label={`${formatDate(day.date, { weekday: "long", day: "numeric", month: "long" }, locale)}${
                        dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""
                      }`}
                      disabled={disabled}
                      onClick={() => onSelect?.(day.date)}
                      onKeyDown={(event) => onKeyDown(event, day.date)}
                      onFocus={() => setFocusedDate(day.date)}
                      style={{
                        display: "grid",
                        gap: 2,
                        alignContent: "start",
                        width: size === "compact" ? cell : cell + 20,
                        height: cell,
                        padding: size === "compact" ? 0 : t.space[2],
                        border: day.isToday ? `1px solid ${t.color.accent}` : "1px solid transparent",
                        borderRadius: t.radius.sm,
                        background: isSelected ? t.color.accent : "transparent",
                        color: isSelected
                          ? t.color.onAccent
                          : disabled
                            ? t.color.textFaint
                            : day.inMonth
                              ? t.color.text
                              : t.color.textFaint,
                        font: "inherit",
                        fontSize: t.fontSize.sm,
                        fontVariantNumeric: "tabular-nums",
                        cursor: disabled ? "not-allowed" : onSelect != null ? "pointer" : "default",
                        opacity: day.inMonth ? 1 : 0.55,
                        outline: "none",
                        ...(focusedDate === day.date ? focusRingStyle({ tokens }) : {}),
                      }}
                    >
                      <span>{day.day}</span>
                      {dayEvents.length > 0 &&
                        (size === "compact" ? (
                          <span style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                            {dayEvents.slice(0, 3).map((event) => (
                              <span
                                key={event.id}
                                aria-hidden="true"
                                style={{
                                  width: 4,
                                  height: 4,
                                  borderRadius: "50%",
                                  background: toneColors(event.tone ?? "accent", t.color).fg,
                                }}
                              />
                            ))}
                          </span>
                        ) : (
                          <span style={{ display: "grid", gap: 1 }}>
                            {dayEvents.slice(0, 2).map((event) => (
                              <span
                                key={event.id}
                                style={{
                                  padding: "0 3px",
                                  borderRadius: 3,
                                  background: t.color.accentTint,
                                  color: t.color.text,
                                  fontSize: t.fontSize.xs,
                                  textAlign: "left",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {event.label}
                              </span>
                            ))}
                            {dayEvents.length > 2 && (
                              <span style={{ fontSize: t.fontSize.xs, color: t.color.textFaint }}>
                                {`+${dayEvents.length - 2}`}
                              </span>
                            )}
                          </span>
                        ))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
