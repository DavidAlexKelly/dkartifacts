/**
 * A month as six weeks of seven days.
 *
 * The layout behind `Calendar`, and pure. Three details that are wrong in
 * nearly every hand-rolled month grid:
 *
 *   1. Weeks start on Monday in most of Europe and on Sunday in the US. A grid
 *      that hard-codes either is wrong for half its users, and the day the
 *      programme adds a US workstream is the day somebody notices.
 *   2. The leading and trailing days belong to the neighbouring months and
 *      must be marked as such — rendering them as blanks loses the week
 *      structure, and rendering them as normal days invites clicks that land
 *      in the wrong month.
 *   3. Always six rows. A grid that is five rows in one month and six in the
 *      next changes height as you page through it, which makes the control
 *      jump under the cursor.
 */

import { addDays, daysInMonth, type IsoDate } from "./dateValue.js";

/** `"2026-03"`. A month with no day in it. */
export type IsoMonth = string;

export interface GridDay {
  date: IsoDate;
  /** Day of the month, 1–31. */
  day: number;
  /** False for the neighbouring months' days that pad the grid. */
  inMonth: boolean;
  isToday: boolean;
  /** 0 = Sunday … 6 = Saturday, so a caller can shade weekends. */
  weekday: number;
}

export interface MonthGrid {
  month: IsoMonth;
  year: number;
  /** 1–12. */
  monthNumber: number;
  /** Always six, always seven long. */
  weeks: GridDay[][];
}

export interface MonthGridOptions {
  /** 0 = Sunday, 1 = Monday. Defaults to Monday. */
  weekStartsOn?: 0 | 1;
  /** Which date to mark. Defaults to none, so a grid is deterministic. */
  today?: IsoDate;
}

/** Day of week for an ISO date, 0 = Sunday. Computed in UTC so it cannot shift. */
function weekdayOf(date: IsoDate): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function monthGrid(month: IsoMonth, options: MonthGridOptions = {}): MonthGrid {
  const weekStartsOn = options.weekStartsOn ?? 1;
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];

  const first = `${month}-01` as IsoDate;
  const firstWeekday = weekdayOf(first);
  // How many days of the previous month to show before the 1st.
  const lead = (firstWeekday - weekStartsOn + 7) % 7;
  const start = addDays(first, -lead);

  const length = daysInMonth(year, monthNumber);
  const weeks: GridDay[][] = [];

  // Six rows always: 6 × 7 = 42 covers every month in every alignment, and a
  // fixed height stops the control jumping as you page.
  for (let week = 0; week < 6; week += 1) {
    const days: GridDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(start, week * 7 + index);
      const [, dateMonth, dateDay] = date.split("-").map(Number) as [number, number, number];
      days.push({
        date,
        day: dateDay,
        inMonth: dateMonth === monthNumber && date.startsWith(`${year}-`),
        isToday: options.today != null && options.today === date,
        weekday: weekdayOf(date),
      });
    }
    weeks.push(days);
  }

  // `length` is read for the month's own day count; asserting it here keeps
  // the variable honest rather than unused if the loop above is ever changed.
  if (weeks.flat().filter((day) => day.inMonth).length !== length) {
    throw new Error(`monthGrid: ${month} produced the wrong number of in-month days`);
  }

  return { month, year, monthNumber, weeks };
}

/** The month n months away. `shiftMonth("2026-12", 1)` is `"2027-01"`. */
export function shiftMonth(month: IsoMonth, delta: number): IsoMonth {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const zeroBased = (year * 12 + (monthNumber - 1)) + delta;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;
  return `${nextYear}-${`${nextMonth}`.padStart(2, "0")}`;
}

/** The month an ISO date falls in. */
export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

/**
 * Weekday headings, localised, in the grid's own order.
 *
 * From `Intl` rather than a hard-coded array: the abbreviations differ by
 * locale and so does their length, and a component that ships "Mon Tue Wed" is
 * a component that is in English forever.
 */
export function weekdayLabels(
  weekStartsOn: 0 | 1 = 1,
  locale?: string,
  format: "short" | "narrow" = "short",
): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: format, timeZone: "UTC" });
  // 2026-03-01 is a Sunday, so it is day 0 of the reference week.
  return Array.from({ length: 7 }, (_, index) => {
    const day = ((index + weekStartsOn) % 7) + 1;
    return formatter.format(new Date(Date.UTC(2026, 2, day)));
  });
}
