/**
 * Dates to pixels, for a Gantt chart.
 *
 * Built on `dateValue`'s ISO strings rather than on `Date`, for the reason
 * given there: a plan drawn from UTC midnights is a plan whose bars are a day
 * out for half the world.
 *
 * TWO THINGS THAT ARE ALWAYS WRONG IN A HAND-ROLLED GANTT
 * -------------------------------------------------------
 * A one-day task with zero width, because the bar is measured as `end - start`
 * and a task that starts and ends on the same day is zero days long. A plan is
 * inclusive of both ends: 1 March to 1 March is one day, and 1 to 14 March is
 * fourteen.
 *
 * And bars that run off the edge when the window is narrower than the plan.
 * Clamping is easy; saying that it happened is the part that gets skipped, so
 * `bar()` reports `clippedStart`/`clippedEnd` and the component draws an arrow
 * rather than pretending the task ends where the chart does.
 */

import { addDays, compareDates, daysBetween, type IsoDate } from "./dateValue.js";

export interface GanttBar {
  x: number;
  width: number;
  /** The task starts before the window; draw an arrow at the left edge. */
  clippedStart: boolean;
  /** …and after it. */
  clippedEnd: boolean;
}

export interface GanttScale {
  from: IsoDate;
  to: IsoDate;
  /** Inclusive day count of the window. */
  days: number;
  width: number;
  /** Pixels per day. */
  dayWidth: number;
  /** The x of a date's left edge, clamped to the window. */
  x: (date: IsoDate) => number;
  /** A bar for a task, clamped, never narrower than a day. */
  bar: (start: IsoDate, end: IsoDate) => GanttBar;
}

export function ganttScale({
  from,
  to,
  width,
}: {
  from: IsoDate;
  to: IsoDate;
  width: number;
}): GanttScale {
  // A backwards window is almost always argument order, so it is swapped
  // rather than rejected: negative widths render as nothing at all, which
  // looks like missing data rather than like a mistake. Swapping is the
  // recovery that shows the plan the caller meant.
  const ordered = compareDates(from, to) <= 0;
  const start = ordered ? from : to;
  const end = ordered ? to : from;
  const days = daysBetween(start, end);
  const dayWidth = days > 0 ? width / days : 0;

  const offsetOf = (date: IsoDate): number => daysBetween(start, date) - 1;

  const x = (date: IsoDate): number => {
    const offset = offsetOf(date);
    return Math.min(width, Math.max(0, offset * dayWidth));
  };

  const bar = (taskStart: IsoDate, taskEnd: IsoDate): GanttBar => {
    const first = compareDates(taskStart, taskEnd) <= 0 ? taskStart : taskEnd;
    const last = compareDates(taskStart, taskEnd) <= 0 ? taskEnd : taskStart;

    const clippedStart = compareDates(first, start) < 0;
    const clippedEnd = compareDates(last, end) > 0;

    const left = x(clippedStart ? start : first);
    // The bar covers whole days: the right edge is the day AFTER the last one.
    const rightDate = clippedEnd ? addDays(end, 1) : addDays(last, 1);
    const right = Math.min(width, Math.max(0, (daysBetween(start, rightDate) - 1) * dayWidth));

    return {
      x: left,
      width: Math.max(dayWidth, right - left),
      clippedStart,
      clippedEnd,
    };
  };

  return { from: start, to: end, days, width, dayWidth, x, bar };
}

export interface GanttTick {
  date: IsoDate;
  /** `day` · `week` · `month` — the component picks a label format from this. */
  unit: "day" | "week" | "month";
}

/**
 * Axis ticks at a density that stays readable.
 *
 * Days up to a fortnight, weeks up to about a quarter, months beyond. Picked
 * from the window rather than configured, because "how many ticks fit" is a
 * question about the data and not a preference — and every hand-rolled Gantt
 * in this estate either labels every day (unreadable past a month) or every
 * month (useless for a two-week cutover).
 */
export function ticksFor(from: IsoDate, to: IsoDate): GanttTick[] {
  const days = daysBetween(from, to);

  if (days <= 14) {
    return Array.from({ length: days }, (_, index) => ({
      date: addDays(from, index),
      unit: "day" as const,
    }));
  }

  if (days <= 120) {
    const ticks: GanttTick[] = [];
    // Start on the first Monday in the window: weeks that start mid-week are
    // harder to read than a missing first tick.
    let cursor = from;
    for (let index = 0; index < 7; index += 1) {
      const [year, month, day] = cursor.split("-").map(Number) as [number, number, number];
      if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 1) {
        break;
      }
      cursor = addDays(cursor, 1);
    }
    while (compareDates(cursor, to) <= 0) {
      ticks.push({ date: cursor, unit: "week" });
      cursor = addDays(cursor, 7);
    }
    return ticks;
  }

  const ticks: GanttTick[] = [];
  const [startYear, startMonth] = from.split("-").map(Number) as [number, number, number];
  let year = startYear;
  let month = startMonth;
  while (true) {
    const date = `${year}-${`${month}`.padStart(2, "0")}-01` as IsoDate;
    if (compareDates(date, to) > 0) {
      break;
    }
    if (compareDates(date, from) >= 0) {
      ticks.push({ date, unit: "month" });
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return ticks;
}
