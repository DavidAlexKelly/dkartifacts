/**
 * Coordinates as text, in the systems the status bar and "go to" offer.
 *
 *   dd    61.63640° N, 8.31250° E
 *   dms   61°38'11.0" N, 8°18'45.0" E
 *   ddm   61°38.184' N, 8°18.750' E
 *   mgrs  32V MP 12345 67890          (UPS beyond 80°S / 84°N: "Z AH 12345 67890")
 *   utm   32V 466123E 6833456N        (UPS beyond 80°S / 84°N: "Z 2012345E 1987654N")
 *
 * Everything this writes, parse.ts reads back.
 */
import { mgrsDigits, toMgrsParts, toUps, toUtm } from "./utm";

export type CoordSystem = "dd" | "dms" | "ddm" | "mgrs" | "utm";

export const COORD_SYSTEMS: Array<{ id: CoordSystem; label: string }> = [
  { id: "dd", label: "Decimal degrees" },
  { id: "dms", label: "Degrees, minutes, seconds" },
  { id: "ddm", label: "Degrees, decimal minutes" },
  { id: "mgrs", label: "MGRS" },
  { id: "utm", label: "UTM" },
];

/** Shown when a position cannot be expressed in the system. */
export const NO_COORD = "—";

/**
 * Default precision per system. For dd / dms / ddm it is the number of
 * decimals (of degrees, seconds and minutes respectively); for mgrs and utm
 * it is a distance in metres (1, 10, 100, 1000, 10000, 100000).
 */
export const DEFAULT_PRECISION: Record<CoordSystem, number> = { dd: 5, dms: 1, ddm: 3, mgrs: 1, utm: 1 };

function splitAngle(value: number, decimals: number, withSeconds: boolean): { d: number; m: number; s: number } {
  // Round once at the smallest unit so carries (59.99… → 60) propagate.
  const unit = withSeconds ? 3600 : 60;
  const scale = 10 ** decimals;
  const total = Math.round(Math.abs(value) * unit * scale);
  const perDeg = unit * scale;
  const d = Math.floor(total / perDeg);
  const rest = total - d * perDeg;
  if (!withSeconds) {return { d, m: rest / scale, s: 0 };}
  const m = Math.floor(rest / (60 * scale));
  const s = (rest - m * 60 * scale) / scale;
  return { d, m, s };
}

function pad(n: number, decimals: number): string {
  const s = n.toFixed(decimals);
  const int = s.split(".")[0];
  return int.length < 2 ? `0${s}` : s;
}

/** One angle in dd / dms / ddm with its hemisphere letter. */
export function formatAngle(value: number, axis: "lat" | "lon", system: "dd" | "dms" | "ddm", decimals?: number): string {
  const hemi = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  const dec = Math.max(0, Math.min(10, Math.round(decimals ?? DEFAULT_PRECISION[system])));
  if (system === "dd") {return `${Math.abs(value).toFixed(dec)}° ${hemi}`;}
  if (system === "ddm") {
    const { d, m } = splitAngle(value, dec, false);
    return `${d}°${pad(m, dec)}' ${hemi}`;
  }
  const { d, m, s } = splitAngle(value, dec, true);
  return `${d}°${String(m).padStart(2, "0")}'${pad(s, dec)}" ${hemi}`;
}

/** "32V MP 12345 67890" at a precision in metres; null outside the grid. */
export function formatMgrs(lon: number, lat: number, precisionM = 1, opts: { spaces?: boolean } = {}): string | null {
  const parts = toMgrsParts(lon, lat, mgrsDigits(precisionM));
  if (!parts) {return null;}
  const bits = [parts.gzd, parts.square, parts.easting, parts.northing].filter(Boolean);
  return opts.spaces === false ? bits.join("") : bits.join(" ");
}

/** "32V 466123E 6833456N"; UPS ("Z 2012345E 1987654N") beyond the UTM latitudes. */
export function formatUtm(lon: number, lat: number, precisionM = 1): string | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) {return null;}
  const p = Math.max(1, precisionM);
  const r = (v: number) => String(Math.round(v / p) * p);
  const utm = toUtm(lon, lat);
  if (utm) {return `${utm.zone}${utm.band} ${r(utm.easting)}E ${r(utm.northing)}N`;}
  const ups = toUps(lon, lat);
  return `${ups.band} ${r(ups.easting)}E ${r(ups.northing)}N`;
}

/**
 * A position as text. `precision` is decimals for dd / dms / ddm and metres
 * for mgrs / utm (see DEFAULT_PRECISION). Returns "—" where the position
 * cannot be written (non-finite, or latitude outside ±90°).
 */
export function formatCoord(lon: number, lat: number, system: CoordSystem, precision?: number): string {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) {return NO_COORD;}
  const l = lon >= -180 && lon <= 180 ? lon : ((((lon + 180) % 360) + 360) % 360) - 180;
  const p = precision ?? DEFAULT_PRECISION[system];
  switch (system) {
    case "dd":
    case "dms":
    case "ddm":
      return `${formatAngle(lat, "lat", system, p)}, ${formatAngle(l, "lon", system, p)}`;
    case "mgrs":
      return formatMgrs(l, lat, p) ?? NO_COORD;
    case "utm":
      return formatUtm(l, lat, p) ?? NO_COORD;
  }
}
