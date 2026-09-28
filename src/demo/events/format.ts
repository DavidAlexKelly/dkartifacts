/**
 * Text formatting for the event monitor. A module of its own rather than
 * exports from EventsPage.tsx: a file exporting both components and functions
 * breaks React Fast Refresh.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(time: number | null, now: number): string {
  if (time == null) {return "time unknown";}
  const elapsed = Math.max(0, now - time);
  if (elapsed < HOUR) {return `${Math.max(1, Math.round(elapsed / MINUTE))} min ago`;}
  if (elapsed < DAY) {return `${Math.round(elapsed / HOUR)} h ago`;}
  return `${Math.round(elapsed / DAY)} d ago`;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "location ← lat + lon · time ← event_date · …", for the sources panel. */
export function describeFieldMap(map: {
  geo: { kind: string; lat?: string; lng?: string; field?: string } | null;
  time?: string;
  category?: string;
  severity?: string;
  magnitude?: string;
  casualties?: string;
  title?: string;
  media?: string[];
}): string {
  const parts: string[] = [];
  if (map.geo) {
    parts.push(
      `location ← ${map.geo.kind === "latlng" ? `${map.geo.lat} + ${map.geo.lng}` : map.geo.field === "__geometry" ? "GeoJSON geometry" : map.geo.field}`,
    );
  }
  if (map.title) {parts.push(`title ← ${map.title}`);}
  if (map.time) {parts.push(`time ← ${map.time}`);}
  if (map.category) {parts.push(`category ← ${map.category}`);}
  const severity = map.severity ?? map.magnitude ?? map.casualties;
  if (severity) {parts.push(`severity ← ${severity}`);}
  if (map.media && map.media.length > 0) {parts.push(`media ← ${map.media.join(", ")}`);}
  return parts.join(" · ");
}

/** "28 Sep 2026 07:19 UTC", or nothing for an event with no time. */
export function absoluteTime(time: number | null): string {
  return time == null ? "" : `${new Date(time).toUTCString().slice(5, 22)} UTC`;
}

/** A field value for the raw-fields table: short, and never "[object Object]". */
export function displayValue(value: unknown, limit = 240): string {
  if (value == null || value === "") {return "—";}
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
