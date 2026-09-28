/**
 * ISO date strings, treated as dates rather than as timestamps.
 *
 * WHY THERE IS NO `Date` IN THIS API
 * ----------------------------------
 * `new Date("2026-03-01")` is midnight UTC, which in London in summer is the
 * 1st at 01:00 and in São Paulo the 28th at 21:00. Every date-only field in
 * this estate that round-trips through a `Date` is one timezone away from
 * being off by a day, and the readiness dashboard has actually shown a
 * cutover date a day early for exactly this reason.
 *
 * So the value type is `"YYYY-MM-DD"` — the format the native date input uses,
 * the format Foundry's date properties use, and a format with no timezone in
 * it at all. These helpers do the arithmetic on the string.
 */

/** A date with no time and no zone: `"2026-03-01"`. */
export type IsoDate = string;

const PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !PATTERN.test(value)) {
    return false;
  }
  // Shape is not validity: 2026-02-31 matches the pattern.
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  return day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one, and this arithmetic
  // is done in UTC so it cannot shift.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Today, in the user's own calendar rather than in UTC. */
export function today(now: Date = new Date()): IsoDate {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Compare two ISO dates. Lexicographic order is chronological — that is the point. */
export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return compareDates(a, b) < 0;
}

/** Clamp into a range, with either bound optional. */
export function clampDate(value: IsoDate, min?: IsoDate, max?: IsoDate): IsoDate {
  if (min != null && value < min) {
    return min;
  }
  if (max != null && value > max) {
    return max;
  }
  return value;
}

/**
 * Add days, without a timezone anywhere near it.
 *
 * Constructed and read in UTC so that a date in a zone with daylight saving
 * cannot gain or lose a day when a month boundary is crossed.
 */
export function addDays(value: IsoDate, days: number): IsoDate {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const y = shifted.getUTCFullYear();
  const m = `${shifted.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${shifted.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inclusive day count between two dates. `["2026-03-01", "2026-03-01"]` is 1. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const parse = (value: IsoDate): number => {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000) + 1;
}

/**
 * Display form for an ISO date, in the user's locale.
 *
 * `Intl.DateTimeFormat` with an explicit UTC timezone: without it the
 * formatter applies the local zone to a UTC midnight and prints the day
 * before, which is the same bug this module exists to avoid, one layer up.
 */
export function formatDate(
  value: IsoDate,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
  locale?: string,
): string {
  if (!isIsoDate(value)) {
    return "";
  }
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export type DateRange = [IsoDate | null, IsoDate | null];

/**
 * Keep a range in order.
 *
 * Moving the start past the end pushes the end, rather than swapping or
 * rejecting: a user changing "from" to a later date than "to" has almost
 * always finished with the old range, and an error message at that moment is
 * a correction of something they were about to fix anyway.
 */
export function normaliseRange(range: DateRange, changed: 0 | 1): DateRange {
  const [from, to] = range;
  if (from == null || to == null || from <= to) {
    return range;
  }
  return changed === 0 ? [from, from] : [to, to];
}

/**
 * "2 hours ago", locale-correct, with no dependency.
 *
 * A helper rather than something `Timeline` calls: a relative label computed
 * at render is wrong five minutes later, and a component that re-renders on
 * a timer to fix that keeps a widget awake. The caller formats and
 * re-renders when it has a reason to.
 *
 * Here rather than in `Timeline.tsx` so that file exports components only.
 */
export function relativeTime(
  at: Date | string | number,
  now: Date | number = Date.now(),
  locale?: string,
): string {
  const then = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const reference = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(then)) {
    return "";
  }
  const seconds = Math.round((then - reference) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, "second");
}
