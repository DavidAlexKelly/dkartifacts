/**
 * UTM, UPS and MGRS on WGS84, self-contained.
 *
 * Transverse Mercator uses Krüger's series to sixth order in n (Karney 2011),
 * which is accurate to well under a millimetre within a zone and stays good
 * several degrees outside it, so grid lines can be traced across a zone's
 * whole width (Norway's widened zone 32, Svalbard's 12° zones). UPS is the
 * ellipsoidal polar stereographic with k0 = 0.994.
 *
 * MGRS letters follow the WGS84 ("AA") lettering scheme. Zone choice includes
 * the Norway (32V) and Svalbard (31X/33X/35X/37X) exceptions.
 */

const A_AXIS = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const K0 = 0.9996;
const UPS_K0 = 0.994;
const FALSE_EASTING = 500000;
const FALSE_NORTHING_S = 10000000;
const UPS_FALSE = 2000000;

const N = F / (2 - F);
const N2 = N * N;
const N3 = N2 * N;
const N4 = N3 * N;
const N5 = N4 * N;
const N6 = N5 * N;
const A_RECT = (A_AXIS / (1 + N)) * (1 + N2 / 4 + N4 / 64 + N6 / 256);

const ALPHA = [
  0,
  N / 2 - (2 / 3) * N2 + (5 / 16) * N3 + (41 / 180) * N4 - (127 / 288) * N5 + (7891 / 37800) * N6,
  (13 / 48) * N2 - (3 / 5) * N3 + (557 / 1440) * N4 + (281 / 630) * N5 - (1983433 / 1935360) * N6,
  (61 / 240) * N3 - (103 / 140) * N4 + (15061 / 26880) * N5 + (167603 / 181440) * N6,
  (49561 / 161280) * N4 - (179 / 168) * N5 + (6601661 / 7257600) * N6,
  (34729 / 80640) * N5 - (3418889 / 1995840) * N6,
  (212378941 / 319334400) * N6,
];
const BETA = [
  0,
  N / 2 - (2 / 3) * N2 + (37 / 96) * N3 - (1 / 360) * N4 - (81 / 512) * N5 + (96199 / 604800) * N6,
  (1 / 48) * N2 + (1 / 15) * N3 - (437 / 1440) * N4 + (46 / 105) * N5 - (1118711 / 3870720) * N6,
  (17 / 480) * N3 - (37 / 840) * N4 - (209 / 4480) * N5 + (5569 / 90720) * N6,
  (4397 / 161280) * N4 - (11 / 504) * N5 - (830251 / 7257600) * N6,
  (4583 / 161280) * N5 - (108847 / 3991680) * N6,
  (20648693 / 638668800) * N6,
];

const RAD = Math.PI / 180;

/** Latitude bands C..X, 8° each from 80°S; X is 12° (72°N–84°N). */
export const BANDS = "CDEFGHJKLMNPQRSTUVWX";

export interface Utm {
  zone: number;
  /** Latitude band letter (C..X). */
  band: string;
  hemisphere: "N" | "S";
  easting: number;
  northing: number;
}

export interface Ups {
  /** "A" / "B" (south, west / east of 0°) or "Y" / "Z" (north). */
  band: "A" | "B" | "Y" | "Z";
  hemisphere: "N" | "S";
  easting: number;
  northing: number;
}

function conformalTau(tau: number): number {
  const sigma = Math.sinh(E * Math.atanh((E * tau) / Math.sqrt(1 + tau * tau)));
  return tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
}

/** Inverse of conformalTau by Newton's method (Karney 2011, eq. 19–21). */
function geodeticTau(taup: number): number {
  let tau = taup;
  for (let i = 0; i < 12; i++) {
    const tauip = conformalTau(tau);
    const d = ((taup - tauip) / Math.sqrt(1 + tauip * tauip)) * ((1 + (1 - E2) * tau * tau) / ((1 - E2) * Math.sqrt(1 + tau * tau)));
    tau += d;
    if (Math.abs(d) < 1e-14) {break;}
  }
  return tau;
}

export function centralMeridian(zone: number): number {
  return (zone - 1) * 6 - 180 + 3;
}

function wrapLon(lon: number): number {
  const w = ((((lon + 180) % 360) + 360) % 360) - 180;
  return w === -180 && lon > 0 ? 180 : w;
}

/**
 * Transverse Mercator in a given zone (any longitude, not only the zone's
 * own six degrees). Northing is the true northing; add 10 000 km for the
 * southern hemisphere's false northing yourself, or use toUtm.
 */
export function tmForward(lon: number, lat: number, zone: number): { easting: number; northing: number } {
  let dl = wrapLon(lon - centralMeridian(zone)) * RAD;
  const phi = lat * RAD;
  const tau = Math.tan(phi);
  const taup = Math.abs(lat) >= 90 ? Math.sign(lat) * Infinity : conformalTau(tau);
  if (!Number.isFinite(dl)) {dl = 0;}
  const cosl = Math.cos(dl);
  const xip = Number.isFinite(taup) ? Math.atan2(taup, cosl) : Math.sign(lat) * (Math.PI / 2);
  const etap = Number.isFinite(taup) ? Math.asinh(Math.sin(dl) / Math.sqrt(taup * taup + cosl * cosl)) : 0;
  let xi = xip;
  let eta = etap;
  for (let j = 1; j <= 6; j++) {
    xi += ALPHA[j] * Math.sin(2 * j * xip) * Math.cosh(2 * j * etap);
    eta += ALPHA[j] * Math.cos(2 * j * xip) * Math.sinh(2 * j * etap);
  }
  return { easting: FALSE_EASTING + K0 * A_RECT * eta, northing: K0 * A_RECT * xi };
}

/** Inverse of tmForward: easting with false easting, true (signed) northing. */
export function tmInverse(easting: number, northing: number, zone: number): { lon: number; lat: number } {
  const xi = northing / (K0 * A_RECT);
  const eta = (easting - FALSE_EASTING) / (K0 * A_RECT);
  let xip = xi;
  let etap = eta;
  for (let j = 1; j <= 6; j++) {
    xip -= BETA[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etap -= BETA[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const sinhetap = Math.sinh(etap);
  const sinxip = Math.sin(xip);
  const cosxip = Math.cos(xip);
  const taup = sinxip / Math.sqrt(sinhetap * sinhetap + cosxip * cosxip);
  const tau = geodeticTau(taup);
  const lat = Math.atan(tau) / RAD;
  const lon = centralMeridian(zone) + Math.atan2(sinhetap, cosxip) / RAD;
  return { lon, lat };
}

/** The latitude band letter for a latitude in [-80, 84], else null. */
export function bandLetter(lat: number): string | null {
  if (!(lat >= -80 && lat <= 84)) {return null;}
  return BANDS[Math.min(19, Math.floor((lat + 80) / 8))];
}

/** South and north latitude of a band letter. */
export function bandRange(band: string): [number, number] | null {
  const i = BANDS.indexOf(band.toUpperCase());
  if (i < 0) {return null;}
  const s = -80 + i * 8;
  return [s, i === 19 ? 84 : s + 8];
}

/** The UTM zone for a position, with the Norway and Svalbard exceptions. */
export function utmZone(lon: number, lat: number): number {
  const l = wrapLon(lon);
  let zone = Math.floor((l + 180) / 6) + 1;
  if (zone > 60) {zone = 60;}
  if (lat >= 56 && lat < 64 && l >= 3 && l < 12) {zone = 32;}
  if (lat >= 72 && lat <= 84) {
    if (l >= 0 && l < 9) {zone = 31;}
    else if (l >= 9 && l < 21) {zone = 33;}
    else if (l >= 21 && l < 33) {zone = 35;}
    else if (l >= 33 && l < 42) {zone = 37;}
  }
  return zone;
}

/**
 * The longitude extent of a grid zone designator (zone + band), honouring the
 * Norway and Svalbard exceptions; null where the GZD does not exist (32X,
 * 34X, 36X).
 */
export function gzdLonRange(zone: number, band: string): [number, number] | null {
  const b = band.toUpperCase();
  if (zone < 1 || zone > 60 || BANDS.indexOf(b) < 0) {return null;}
  let w = (zone - 1) * 6 - 180;
  let e = w + 6;
  if (b === "V") {
    if (zone === 31) {e = 3;}
    if (zone === 32) {w = 3;}
  }
  if (b === "X") {
    if (zone === 32 || zone === 34 || zone === 36) {return null;}
    if (zone === 31) {e = 9;}
    if (zone === 33) {w = 9; e = 21;}
    if (zone === 35) {w = 21; e = 33;}
    if (zone === 37) {w = 33;}
  }
  return [w, e];
}

/** UTM for a position in [-80, 84] latitude, else null. `zone` forces a zone. */
export function toUtm(lon: number, lat: number, zone?: number): Utm | null {
  const band = bandLetter(lat);
  if (!band || !Number.isFinite(lon)) {return null;}
  const z = zone ?? utmZone(lon, lat);
  const { easting, northing } = tmForward(lon, lat, z);
  const hemisphere = lat < 0 ? "S" : "N";
  return { zone: z, band, hemisphere, easting, northing: hemisphere === "S" ? northing + FALSE_NORTHING_S : northing };
}

/** Easting and northing back to lon/lat. Northing includes the southern false northing. */
export function fromUtm(zone: number, hemisphere: "N" | "S", easting: number, northing: number): { lon: number; lat: number } {
  const ll = tmInverse(easting, hemisphere === "S" ? northing - FALSE_NORTHING_S : northing, zone);
  return { lon: wrapLon(ll.lon), lat: ll.lat };
}

const UPS_C = Math.sqrt(Math.pow(1 + E, 1 + E) * Math.pow(1 - E, 1 - E));

/** Universal Polar Stereographic, for latitudes north of 84°N or south of 80°S (works anywhere poleward of the equator). */
export function toUps(lon: number, lat: number): Ups {
  const north = lat >= 0;
  const phi = Math.abs(lat) * RAD;
  const s = Math.sin(phi);
  const t = Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - E * s) / (1 + E * s), E / 2);
  const rho = (2 * A_AXIS * UPS_K0 * t) / UPS_C;
  const l = wrapLon(lon) * RAD;
  const easting = UPS_FALSE + rho * Math.sin(l);
  const northing = north ? UPS_FALSE - rho * Math.cos(l) : UPS_FALSE + rho * Math.cos(l);
  const east = easting >= UPS_FALSE;
  const band = north ? (east ? "Z" : "Y") : east ? "B" : "A";
  return { band, hemisphere: north ? "N" : "S", easting, northing };
}

export function fromUps(hemisphere: "N" | "S", easting: number, northing: number): { lon: number; lat: number } {
  const north = hemisphere === "N";
  const dx = easting - UPS_FALSE;
  const dy = northing - UPS_FALSE;
  const rho = Math.hypot(dx, dy);
  const t = (rho * UPS_C) / (2 * A_AXIS * UPS_K0);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 15; i++) {
    const s = Math.sin(phi);
    const next = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - E * s) / (1 + E * s), E / 2));
    if (Math.abs(next - phi) < 1e-15) {phi = next; break;}
    phi = next;
  }
  const lon = rho === 0 ? 0 : (north ? Math.atan2(dx, -dy) : Math.atan2(dx, dy)) / RAD;
  return { lon, lat: (north ? 1 : -1) * (phi / RAD) };
}

// ---------------------------------------------------------------- MGRS

const COL_SETS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];
const ROWS = "ABCDEFGHJKLMNPQRSTUV";
// UPS lettering (as in GeographicLib's MGRS): columns per band A, B, Y, Z.
const UPS_COLS: Record<string, string> = { A: "JKLPQRSTUXYZ", B: "ABCFGHJKLPQR", Y: "RSTUXYZ", Z: "ABCFGHJ" };
const UPS_ROWS = { S: "ABCDEFGHJKLMNPQRSTUVWXYZ", N: "ABCDEFGHJKLMNP" };
const UPS_MIN_ROW = { S: 8, N: 13 };
// First 100 km column index of each UPS band (easting / 100 km).
const UPS_MIN_COL: Record<string, number> = { A: 8, B: 20, Y: 13, Z: 20 };

/** The two-letter 100 km square identifier of a UTM position. */
export function utmSquareId(zone: number, easting: number, northing: number): string | null {
  const col = Math.floor(easting / 100000);
  const set = COL_SETS[(zone - 1) % 3];
  if (col < 1 || col > 8) {return null;}
  const row = ((Math.floor(northing / 100000) % 20) + 20) % 20;
  const rowLetter = ROWS[(row + (zone % 2 === 0 ? 5 : 0)) % 20];
  return set[col - 1] + rowLetter;
}

export function upsSquareId(band: string, easting: number, northing: number): string | null {
  const hem = band === "Y" || band === "Z" ? "N" : "S";
  const col = Math.floor(easting / 100000) - UPS_MIN_COL[band];
  const row = Math.floor(northing / 100000) - UPS_MIN_ROW[hem];
  const cols = UPS_COLS[band];
  const rows = UPS_ROWS[hem];
  if (!cols || col < 0 || col >= cols.length || row < 0 || row >= rows.length) {return null;}
  return cols[col] + rows[row];
}

export interface MgrsParts {
  /** "32V", or "Z" for UPS. */
  gzd: string;
  square: string;
  easting: string;
  northing: string;
}

/** Digits per axis for a precision in metres (1 → 5 digits … 100000 → 0). */
export function mgrsDigits(precisionM: number): number {
  const d = 5 - Math.round(Math.log10(Math.max(1, Math.min(100000, precisionM))));
  return Math.max(0, Math.min(5, d));
}

/**
 * MGRS parts for a position; UTM between 80°S and 84°N, UPS outside. Digits
 * are truncated, as MGRS references are (a reference names the square the
 * point is in).
 */
export function toMgrsParts(lon: number, lat: number, digits = 5): MgrsParts | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) {return null;}
  const trunc = (v: number) => {
    const inSquare = Math.floor(((v % 100000) + 100000) % 100000);
    return digits === 0 ? "" : String(Math.floor(inSquare / 10 ** (5 - digits))).padStart(digits, "0");
  };
  // A hair (1 µm) of tolerance so 49999.99999… from a round trip reads as 50000.
  const eps = 1e-6;
  const utm = toUtm(lon, lat);
  if (utm) {
    const [e, n] = [utm.easting + eps, utm.northing + eps];
    const sq = utmSquareId(utm.zone, e, n);
    if (!sq) {return null;}
    return { gzd: `${utm.zone}${utm.band}`, square: sq, easting: trunc(e), northing: trunc(n) };
  }
  const ups = toUps(lon, lat);
  const [e, n] = [ups.easting + eps, ups.northing + eps];
  const sq = upsSquareId(ups.band, e, n);
  if (!sq) {return null;}
  return { gzd: ups.band, square: sq, easting: trunc(e), northing: trunc(n) };
}

/**
 * The centre of an MGRS reference's square (any precision), or null when it
 * is not a valid reference. `ref` may contain spaces.
 */
export function mgrsToLonLat(ref: string): { lon: number; lat: number; precision: number } | null {
  const s = ref.replace(/\s+/g, "").toUpperCase();
  let m = /^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/.exec(s);
  if (m) {
    const zone = Number(m[1]);
    const band = m[2];
    const digits = m[5];
    if (zone < 1 || zone > 60 || digits.length % 2 !== 0 || digits.length > 10) {return null;}
    if (!gzdLonRange(zone, band)) {return null;}
    const set = COL_SETS[(zone - 1) % 3];
    const col = set.indexOf(m[3]);
    if (col < 0) {return null;}
    const rowIdx = ROWS.indexOf(m[4]);
    const row = (rowIdx - (zone % 2 === 0 ? 5 : 0) + 20) % 20;
    const k = digits.length / 2;
    const precision = 10 ** (5 - k);
    const off = (str: string) => (k === 0 ? 0 : Number(str) * precision) + precision / 2;
    const easting = (col + 1) * 100000 + off(digits.slice(0, k));
    const n0 = row * 100000 + off(digits.slice(k));
    const range = bandRange(band)!;
    const hemisphere = band < "N" ? "S" : "N";
    let best: { lon: number; lat: number } | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < 6; i++) {
      const northing = n0 + i * 2000000;
      if (northing > FALSE_NORTHING_S) {break;}
      const ll = fromUtm(zone, hemisphere, easting, northing);
      if (hemisphere === "N" ? ll.lat < -0.5 : ll.lat > 0.5) {continue;}
      const d = ll.lat < range[0] ? range[0] - ll.lat : ll.lat > range[1] ? ll.lat - range[1] : 0;
      if (d < bestDist) {bestDist = d; best = ll;}
    }
    if (!best || bestDist > 1.5) {return null;}
    return { ...best, precision };
  }
  m = /^([ABYZ])([A-HJ-NP-Z])([A-HJ-NP-Z])(\d*)$/.exec(s);
  if (m) {
    const band = m[1];
    const hem = band === "Y" || band === "Z" ? "N" : "S";
    const digits = m[4];
    if (digits.length % 2 !== 0 || digits.length > 10) {return null;}
    const col = UPS_COLS[band].indexOf(m[2]);
    const row = UPS_ROWS[hem].indexOf(m[3]);
    if (col < 0 || row < 0) {return null;}
    const k = digits.length / 2;
    const precision = 10 ** (5 - k);
    const off = (str: string) => (k === 0 ? 0 : Number(str) * precision) + precision / 2;
    const easting = (UPS_MIN_COL[band] + col) * 100000 + off(digits.slice(0, k));
    const northing = (UPS_MIN_ROW[hem] + row) * 100000 + off(digits.slice(k));
    const ll = fromUps(hem, easting, northing);
    if (hem === "N" ? ll.lat < 83.5 : ll.lat > -79.5) {return null;}
    return { ...ll, precision };
  }
  return null;
}
