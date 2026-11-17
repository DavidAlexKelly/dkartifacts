/**
 * Text → position, for "go to coordinate" boxes and pasted references.
 *
 * Accepted:
 *   61.6 8.3 · 61.6, 8.3 · -33.9;151.2         decimal degrees, lat first
 *   8.3E 61.6N · N61.6 E8.3                    hemisphere letters decide the axes
 *   61°38'12"N 8°18'45"E · 61 38 12 N, 8 18 45 E · 61°38′12″N   DMS (ASCII or Unicode primes)
 *   61°38.2'N 8°18.75'E · 61 38.2, 8 18.75     degrees + decimal minutes
 *   32VMP1234567890 · 32V MP 12345 67890 · 32VMP · Z AH 123 456   MGRS / UPS-MGRS, any precision (centre of the square)
 *   32V 466000 6833000 · 32N 466000E 6833000N · 32S …            UTM, with a band or hemisphere letter
 *   Z 2000000E 2000000N                        UPS
 *
 * Without hemisphere letters the order is "lat, lon" (as Google Maps), unless
 * the first value cannot be a latitude (|v| > 90) and the second can, in which
 * case it is "lon, lat". Anything else ambiguous or out of range is null.
 *
 * UTM letters: a latitude band letter is checked against the northing. "N"
 * always means the northern hemisphere (it is also the band at 0–8°N). "S" is
 * read as band S (32–40°N) when the northing lies in that band, else as the
 * southern hemisphere.
 */
import type { CoordSystem } from "./format";
import { BANDS, bandRange, fromUps, fromUtm, mgrsToLonLat } from "./utm";

export interface ParsedCoord {
  lon: number;
  lat: number;
}

export interface ParsedCoordDetailed extends ParsedCoord {
  format: CoordSystem;
  /** How the two values were assigned to axes (geographic formats only). */
  order?: "hemisphere" | "latlon" | "lonlat";
  /** MGRS: size of the referenced square in metres. */
  precision?: number;
}

function normalize(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/[  -​ ]/g, " ")
    .replace(/[−–‐]/g, "-")
    .replace(/[′’‘´`]/g, "'")
    .replace(/[″”“]/g, '"')
    .replace(/''/g, '"')
    .replace(/[º˚]/g, "°");
}

// ---------------------------------------------------------------- grid references

function parseMgrs(s: string): ParsedCoordDetailed | null {
  const m = /^(\d{1,2}\s*[A-Z]|[ABYZ])\s*([A-Z])\s*([A-Z])\s*(\d*)(?:\s+(\d+))?$/.exec(s);
  if (!m) {return null;}
  if (m[5] !== undefined && m[4].length !== m[5].length) {return null;}
  const r = mgrsToLonLat(`${m[1]}${m[2]}${m[3]}${m[4]}${m[5] ?? ""}`);
  return r ? { lon: r.lon, lat: r.lat, format: "mgrs", precision: r.precision } : null;
}

function parseUtm(s: string): ParsedCoordDetailed | null {
  const m = /^(\d{1,2})?\s*([A-Z])[\s,;]+(\d+(?:\.\d+)?)\s*(M?[EN])?[\s,;]+(\d+(?:\.\d+)?)\s*(M?[EN])?$/.exec(s);
  if (!m) {return null;}
  let easting = Number(m[3]);
  let northing = Number(m[5]);
  const s1 = m[4]?.replace("M", "");
  const s2 = m[6]?.replace("M", "");
  if (s1 && s2 && s1 === s2) {return null;}
  if (s1 === "N" || s2 === "E") {[easting, northing] = [northing, easting];}
  const letter = m[2];
  if (m[1] === undefined) {
    // UPS: band letter only.
    if (!"ABYZ".includes(letter)) {return null;}
    if (easting < 0 || easting > 4000000 || northing < 0 || northing > 4000000) {return null;}
    const hem = letter === "Y" || letter === "Z" ? "N" : "S";
    const ll = fromUps(hem, easting, northing);
    if (hem === "N" ? ll.lat < 83.5 : ll.lat > -79.5) {return null;}
    const east = easting >= 2000000;
    if ((letter === "B" || letter === "Z") !== east) {return null;}
    return { ...ll, format: "utm" };
  }
  const zone = Number(m[1]);
  if (zone < 1 || zone > 60) {return null;}
  if (easting < 100000 || easting > 900000 || northing < 0 || northing > 10000000) {return null;}
  const inBand = (band: string, lat: number) => {
    const r = bandRange(band)!;
    return lat >= r[0] - 0.5 && lat <= r[1] + 0.5;
  };
  if (letter === "N") {
    const ll = fromUtm(zone, "N", easting, northing);
    return ll.lat <= 84.5 ? { ...ll, format: "utm" } : null;
  }
  if (letter === "S") {
    const asBand = fromUtm(zone, "N", easting, northing);
    if (inBand("S", asBand.lat)) {return { ...asBand, format: "utm" };}
    const ll = fromUtm(zone, "S", easting, northing);
    return ll.lat >= -80.5 && ll.lat <= 0 ? { ...ll, format: "utm" } : null;
  }
  if (!BANDS.includes(letter)) {return null;}
  const ll = fromUtm(zone, letter < "N" ? "S" : "N", easting, northing);
  return inBand(letter, ll.lat) ? { ...ll, format: "utm" } : null;
}

// ---------------------------------------------------------------- geographic

type Token =
  | { t: "num"; v: number; raw: string }
  | { t: "unit"; rank: number }
  | { t: "hem"; h: "N" | "S" | "E" | "W" }
  | { t: "sep" };

function tokenize(s: string): Token[] | null {
  const out: Token[] = [];
  const re = /\s*(?:([+-]?(?:\d+(?:\.\d*)?|\.\d+))|(°|DEG|D(?![A-Z]))|(')|(")|([NSEW])|([,;/])|(\S))/y;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[0].trim() === "" && re.lastIndex >= s.length) {break;}
    if (m[1] !== undefined) {out.push({ t: "num", v: Number(m[1]), raw: m[1] });}
    else if (m[2] !== undefined) {out.push({ t: "unit", rank: 0 });}
    else if (m[3] !== undefined) {out.push({ t: "unit", rank: 1 });}
    else if (m[4] !== undefined) {out.push({ t: "unit", rank: 2 });}
    else if (m[5] !== undefined) {out.push({ t: "hem", h: m[5] as "N" | "S" | "E" | "W" });}
    else if (m[6] !== undefined) {out.push({ t: "sep" });}
    else {return null;}
  }
  return out;
}

interface Comp {
  raw: string;
  v: number;
  unit: number | null;
}

/** Numbers with the unit symbol that follows each, or null on stray symbols. */
function components(tokens: Token[]): Comp[] | null {
  const out: Comp[] = [];
  for (const tok of tokens) {
    if (tok.t === "num") {out.push({ raw: tok.raw, v: tok.v, unit: null });}
    else if (tok.t === "unit") {
      const last = out[out.length - 1];
      if (!last || last.unit !== null) {return null;}
      last.unit = tok.rank;
    } else {return null;}
  }
  return out;
}

/** Degrees from 1–3 components (d, m, s), with their rank. */
function angle(comps: Comp[]): { value: number; rank: number; negative: boolean } | null {
  if (comps.length < 1 || comps.length > 3) {return null;}
  const parts = [0, 0, 0];
  let prev = -1;
  let negative = false;
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    const rank = c.unit ?? prev + 1;
    if (rank <= prev || rank > 2) {return null;}
    if (i > 0 && /^[+-]/.test(c.raw)) {return null;}
    if (i < comps.length - 1 && c.raw.includes(".")) {return null;}
    if (rank > 0 && c.v >= 60) {return null;}
    if (i === 0) {negative = c.raw.startsWith("-");}
    parts[rank] = Math.abs(c.v);
    prev = rank;
  }
  if (!Number.isFinite(parts[0])) {return null;}
  const value = (negative ? -1 : 1) * (parts[0] + parts[1] / 60 + parts[2] / 3600);
  return { value, rank: prev, negative };
}

function splitByUnits(comps: Comp[]): Comp[][] | null {
  if (comps.every((c) => c.unit === null)) {
    const n = comps.length;
    if (n !== 2 && n !== 4 && n !== 6) {return null;}
    return [comps.slice(0, n / 2), comps.slice(n / 2)];
  }
  const groups: Comp[][] = [];
  let prev = 99;
  for (const c of comps) {
    let rank = c.unit ?? prev + 1;
    if (!groups.length || rank <= prev || rank > 2) {
      groups.push([]);
      rank = c.unit ?? 0;
    }
    groups[groups.length - 1].push(c);
    prev = rank;
  }
  return groups.length === 2 ? groups : null;
}

function parseGeographic(s: string): ParsedCoordDetailed | null {
  const tokens = tokenize(s);
  if (!tokens || !tokens.length) {return null;}
  const hemIdx = tokens.map((t, i) => (t.t === "hem" ? i : -1)).filter((i) => i >= 0);
  const stripSeps = (ts: Token[]) => {
    let a = 0;
    let b = ts.length;
    while (a < b && ts[a].t === "sep") {a++;}
    while (b > a && ts[b - 1].t === "sep") {b--;}
    const inner = ts.slice(a, b);
    return inner.some((t) => t.t === "sep") ? null : inner;
  };

  let groups: Comp[][];
  let hems: Array<"N" | "S" | "E" | "W"> | null = null;
  if (hemIdx.length) {
    if (hemIdx.length !== 2) {return null;}
    const [h0, h1] = hemIdx;
    let parts: Array<Token[] | null>;
    if (h0 === 0) {parts = [stripSeps(tokens.slice(1, h1)), stripSeps(tokens.slice(h1 + 1))];}
    else if (h1 === tokens.length - 1) {parts = [stripSeps(tokens.slice(0, h0)), stripSeps(tokens.slice(h0 + 1, h1))];}
    else {return null;}
    if (!parts[0] || !parts[1]) {return null;}
    const c0 = components(parts[0]);
    const c1 = components(parts[1]);
    if (!c0 || !c1) {return null;}
    groups = [c0, c1];
    hems = [tokens[h0], tokens[h1]].map((t) => (t as { h: "N" | "S" | "E" | "W" }).h);
  } else {
    const sepIdx = tokens.map((t, i) => (t.t === "sep" ? i : -1)).filter((i) => i >= 0);
    if (sepIdx.length > 1) {return null;}
    if (sepIdx.length === 1) {
      const c0 = components(tokens.slice(0, sepIdx[0]));
      const c1 = components(tokens.slice(sepIdx[0] + 1));
      if (!c0 || !c1) {return null;}
      groups = [c0, c1];
    } else {
      const comps = components(tokens);
      const split = comps && splitByUnits(comps);
      if (!split) {return null;}
      groups = split;
    }
  }

  const a = angle(groups[0]);
  const b = angle(groups[1]);
  if (!a || !b) {return null;}
  const rank = Math.max(a.rank, b.rank);
  const format: CoordSystem = rank === 2 ? "dms" : rank === 1 ? "ddm" : "dd";

  let lat: number;
  let lon: number;
  let order: ParsedCoordDetailed["order"];
  if (hems) {
    if (a.negative || b.negative) {return null;}
    const isLat = (h: string) => h === "N" || h === "S";
    if (isLat(hems[0]) === isLat(hems[1])) {return null;}
    const signed = (v: number, h: string) => (h === "S" || h === "W" ? -v : v);
    const va = signed(a.value, hems[0]);
    const vb = signed(b.value, hems[1]);
    [lat, lon] = isLat(hems[0]) ? [va, vb] : [vb, va];
    order = "hemisphere";
  } else if (Math.abs(a.value) > 90 && Math.abs(b.value) <= 90) {
    [lon, lat] = [a.value, b.value];
    order = "lonlat";
  } else {
    [lat, lon] = [a.value, b.value];
    order = "latlon";
  }
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {return null;}
  return { lon, lat, format, order };
}

/** Parse a coordinate and say which format it was read as. */
export function parseCoordDetailed(text: string): ParsedCoordDetailed | null {
  if (typeof text !== "string") {return null;}
  const s = normalize(text);
  if (!s || s.length > 200) {return null;}
  return parseMgrs(s) ?? parseUtm(s) ?? parseGeographic(s);
}

/** Parse a coordinate in any supported format; null when invalid or ambiguous. */
export function parseCoord(text: string): ParsedCoord | null {
  const r = parseCoordDetailed(text);
  return r ? { lon: r.lon, lat: r.lat } : null;
}
