/**
 * Text formatting for the event monitor. A module of its own rather than
 * exports from EventsPage.tsx: a file exporting both components and functions
 * breaks React Fast Refresh.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(time: number, now: number): string {
  const elapsed = Math.max(0, now - time);
  if (elapsed < HOUR) {return `${Math.max(1, Math.round(elapsed / MINUTE))} min ago`;}
  if (elapsed < DAY) {return `${Math.round(elapsed / HOUR)} h ago`;}
  return `${Math.round(elapsed / DAY)} d ago`;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
