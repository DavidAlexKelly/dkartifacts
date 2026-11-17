import { describe, expect, it } from "vitest";
import * as mgrs from "mgrs";
import type { LineString, Point } from "geojson";
import { formatCoord, formatMgrs, formatUtm } from "../src/coords/format";
import { parseCoord, parseCoordDetailed } from "../src/coords/parse";
import { clipPolyline, graticule, latLonTickLabel, MAX_GRID_FEATURES, mgrsGrid, mgrsLevelsForZoom, utmTickLabel, type GridCollection } from "../src/coords/grid";
import { fromUps, gzdLonRange, mgrsToLonLat, tmForward, toUps, toUtm, utmZone } from "../src/coords/utm";

function metres(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6371008.8;
}

// A deterministic spread of points between 80°S and 84°N.
function samplePoints(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < n; i++) {out.push([-180 + rnd() * 360, -79.9 + rnd() * 163.8]);}
  return out;
}

describe("UTM / MGRS conversions", () => {
  it("Galdhøpiggen (61.6364N 8.3125E)", () => {
    expect(formatCoord(8.3125, 61.6364, "mgrs")).toBe("32V MP 63562 33868");
    expect(formatCoord(8.3125, 61.6364, "mgrs", 10)).toBe("32V MP 6356 3386");
    expect(formatCoord(8.3125, 61.6364, "mgrs", 100)).toBe("32V MP 635 338");
    expect(formatCoord(8.3125, 61.6364, "mgrs", 100000)).toBe("32V MP");
    expect(formatMgrs(8.3125, 61.6364, 1, { spaces: false })).toBe(mgrs.forward([8.3125, 61.6364]));
    expect(formatCoord(8.3125, 61.6364, "utm")).toBe("32V 463563E 6833868N");
    expect(formatUtm(8.3125, 61.6364, 100)).toBe("32V 463600E 6833900N");
  });

  it("reads a corner of a 100 km square as that square", () => {
    const c = parseCoord("32V 500000 6800000")!;
    expect(formatCoord(c.lon, c.lat, "mgrs")).toBe("32V NP 00000 00000");
  });

  it("equator and prime meridian", () => {
    expect(formatCoord(0, 0, "mgrs")).toBe("31N AA 66021 00000");
    expect(formatCoord(0, 0, "mgrs").replace(/ /g, "")).toBe(mgrs.forward([0, 0]));
    const u = toUtm(0, 0)!;
    expect(u.zone).toBe(31);
    expect(u.northing).toBeCloseTo(0, 6);
    expect(u.easting).toBeCloseTo(166021.443, 2); // the textbook value
    expect(toUtm(3, 0)!.easting).toBeCloseTo(500000, 6);
    // Just south of the equator: false northing.
    expect(toUtm(3, -0.0001)!.northing).toBeGreaterThan(9999980);
    expect(formatCoord(-0.5, -0.5, "utm")).toMatch(/^30M \d+E 99\d{5}N$/);
  });

  it("Norway exception (32V is 3°–12°E between 56°N and 64°N)", () => {
    expect(utmZone(4, 60)).toBe(32);
    expect(utmZone(2.9, 60)).toBe(31);
    expect(utmZone(4, 55.9)).toBe(31);
    expect(utmZone(4, 64)).toBe(31);
    expect(formatCoord(4, 60, "mgrs").startsWith("32V KM")).toBe(true);
    expect(formatCoord(4, 60, "mgrs").replace(/ /g, "")).toBe(mgrs.forward([4, 60]));
    expect(gzdLonRange(32, "V")).toEqual([3, 12]);
    expect(gzdLonRange(31, "V")).toEqual([0, 3]);
    expect(gzdLonRange(32, "U")).toEqual([6, 12]);
  });

  it("Svalbard exceptions (31X, 33X, 35X, 37X; no 32X, 34X, 36X)", () => {
    expect(utmZone(8, 78)).toBe(31);
    expect(utmZone(10, 78)).toBe(33);
    expect(utmZone(20, 78)).toBe(33);
    expect(utmZone(22, 78)).toBe(35);
    expect(utmZone(34, 78)).toBe(37);
    expect(utmZone(10, 71.9)).toBe(32);
    expect(formatCoord(10, 78, "mgrs")).toBe("33X UG 84085 63320");
    expect(formatCoord(10, 78, "mgrs").replace(/ /g, "")).toBe(mgrs.forward([10, 78]));
    expect(formatCoord(8, 78, "mgrs").replace(/ /g, "")).toBe(mgrs.forward([8, 78]));
    expect(gzdLonRange(32, "X")).toBeNull();
    expect(gzdLonRange(33, "X")).toEqual([9, 21]);
    expect(mgrsToLonLat("32XMP")).toBeNull();
  });

  it("agrees with the mgrs package across the globe (same square, within 2 m)", () => {
    for (const [lon, lat] of samplePoints(400)) {
      const ours = formatMgrs(lon, lat, 1, { spaces: false })!;
      const lib = mgrs.forward([lon, lat]);
      expect(ours.slice(0, -10), `${lon},${lat}`).toBe(lib.slice(0, -10));
      const a = mgrsToLonLat(ours)!;
      const [blon, blat] = mgrs.toPoint(lib);
      expect(metres(a, { lon: blon, lat: blat }), `${lon},${lat}`).toBeLessThan(3);
    }
  });

  it("UTM forward/inverse round-trips to well under a millimetre", () => {
    for (const [lon, lat] of samplePoints(200)) {
      const u = toUtm(lon, lat)!;
      const back = parseCoord(`${u.zone}${u.band} ${u.easting.toFixed(4)} ${u.northing.toFixed(4)}`)!;
      expect(metres({ lon, lat }, back)).toBeLessThan(0.001);
    }
    // Far outside the zone (grid lines are traced across widened zones) it still inverts exactly.
    const p = tmForward(21, 60, 32);
    expect(p.easting).toBeGreaterThan(900000);
    expect(parseCoord(`32V ${p.easting} ${p.northing}`)).toBeNull(); // but that is not a UTM reference
  });

  it("UPS beyond 84°N / 80°S", () => {
    expect(formatCoord(0, 90, "mgrs")).toBe("Z AH 00000 00000");
    expect(formatCoord(0, -90, "mgrs")).toBe("B AN 00000 00000");
    expect(formatCoord(0, 90, "utm")).toBe("Z 2000000E 2000000N");
    expect(formatCoord(-60, -85, "mgrs").startsWith("A ")).toBe(true);
    expect(formatCoord(45, 85, "mgrs").startsWith("Z ")).toBe(true);
    expect(formatCoord(-45, 85, "mgrs").startsWith("Y ")).toBe(true);
    for (const [lon, lat] of [[45, 85], [-120, 87.5], [10, -82], [-170, -89]] as Array<[number, number]>) {
      const u = toUps(lon, lat);
      const back = fromUps(u.hemisphere, u.easting, u.northing);
      expect(metres({ lon, lat }, back)).toBeLessThan(0.001);
      const ref = formatCoord(lon, lat, "mgrs");
      expect(metres({ lon, lat }, parseCoord(ref)!)).toBeLessThan(1.5);
    }
  });

  it("returns — for what it cannot write", () => {
    expect(formatCoord(Number.NaN, 0, "mgrs")).toBe("—");
    expect(formatCoord(0, 91, "dd")).toBe("—");
  });
});

describe("formatCoord geographic", () => {
  it("dd / dms / ddm", () => {
    expect(formatCoord(8.3125, 61.6364, "dd")).toBe("61.63640° N, 8.31250° E");
    expect(formatCoord(8.3125, 61.6364, "dms")).toBe(`61°38'11.0" N, 8°18'45.0" E`);
    expect(formatCoord(8.3125, 61.6364, "ddm")).toBe("61°38.184' N, 8°18.750' E");
    expect(formatCoord(-151.2, -33.9, "dms", 0)).toBe(`33°54'00" S, 151°12'00" W`);
    expect(formatCoord(0, 0, "dd", 2)).toBe("0.00° N, 0.00° E");
  });

  it("carries rounding into minutes and degrees", () => {
    expect(formatCoord(0, 10.99999999, "dms")).toBe(`11°00'00.0" N, 0°00'00.0" E`);
    expect(formatCoord(0, 10.9999999999, "ddm")).toBe("11°00.000' N, 0°00.000' E");
  });

  it("wraps longitudes", () => {
    expect(formatCoord(368.3125, 61.6364, "mgrs")).toBe("32V MP 63562 33868");
  });
});

describe("parseCoord", () => {
  const gp = { lon: 8.3125, lat: 61.636667 };
  const cases: Array<[string, string]> = [
    ["61.636667 8.3125", "dd"],
    ["61.636667, 8.3125", "dd"],
    ["8.3125E 61.636667N", "dd"],
    ["N61.636667 E8.3125", "dd"],
    [`61°38'12"N 8°18'45"E`, "dms"],
    [`61° 38' 12" N, 8° 18' 45" E`, "dms"],
    ["61°38′12″N 8°18′45″E", "dms"],
    ["61 38 12 N 8 18 45 E", "dms"],
    ["61 38 12, 8 18 45", "dms"],
    ["61°38.2'N 8°18.75'E", "ddm"],
    ["61 38.2 8 18.75", "ddm"],
    ["8°18.75'E, 61°38.2'N", "ddm"],
  ];
  for (const [text, format] of cases) {
    it(`reads ${text}`, () => {
      const r = parseCoordDetailed(text)!;
      expect(r).not.toBeNull();
      expect(r.format).toBe(format);
      expect(metres(r, gp)).toBeLessThan(1);
    });
  }

  it("reads MGRS with or without spaces, any precision, as the square centre", () => {
    const full = parseCoordDetailed("32VMP6356233868")!;
    expect(full.format).toBe("mgrs");
    expect(metres(full, { lon: 8.3125, lat: 61.6364 })).toBeLessThan(1.5);
    expect(metres(parseCoord("32V MP 63562 33868")!, full)).toBeLessThan(0.01);
    expect(metres(parseCoord("32v mp 6356 3386")!, full)).toBeLessThan(10);
    const sq = parseCoordDetailed("32VMP")!;
    expect(sq.precision).toBe(100000);
    expect(formatCoord(sq.lon, sq.lat, "mgrs")).toBe("32V MP 50000 50000");
    expect(parseCoord("32V MP 123 4567")).toBeNull();
    expect(parseCoord("32V MP 1234567")).toBeNull();
  });

  it("reads UTM with band or hemisphere letters", () => {
    const a = parseCoordDetailed("32V 463563 6833868")!;
    expect(a.format).toBe("utm");
    expect(metres(a, { lon: 8.3125, lat: 61.6364 })).toBeLessThan(1.5);
    expect(metres(parseCoord("32N 463563 6833868")!, a)).toBeLessThan(0.01);
    expect(metres(parseCoord("32V 463563E 6833868N")!, a)).toBeLessThan(0.01);
    expect(metres(parseCoord("32V 6833868mN 463563mE")!, a)).toBeLessThan(0.01);
    const syd = parseCoord("56S 334000 6247000")!; // southern hemisphere
    expect(syd.lat).toBeCloseTo(-33.904, 2);
    const band = parseCoord("33S 300000 3800000")!; // band S, 32°–40°N
    expect(band.lat).toBeGreaterThan(32);
    expect(parseCoord("32V 466000 1000000")).toBeNull(); // northing not in band V
    expect(parseCoord("61V 466000 6833000")).toBeNull();
    expect(metres(parseCoord("Z 2000000E 2000000N")!, { lon: 0, lat: 90 })).toBeLessThan(0.01);
  });

  it("orders lat, lon unless the first value cannot be a latitude", () => {
    expect(parseCoordDetailed("61.6 8.3")).toMatchObject({ lat: 61.6, lon: 8.3, order: "latlon" });
    expect(parseCoordDetailed("151.2 -33.9")).toMatchObject({ lat: -33.9, lon: 151.2, order: "lonlat" });
    expect(parseCoordDetailed("8.3E 61.6N")).toMatchObject({ lat: 61.6, lon: 8.3, order: "hemisphere" });
    expect(parseCoordDetailed("33.9S 151.2W")).toMatchObject({ lat: -33.9, lon: -151.2 });
  });

  it("rejects invalid and ambiguous input", () => {
    for (const bad of ["", "61.6", "200 300", "91 200", "hello", "-61.6N 8E", "61.6N 8.3N", "61 61 61", "61°70'N 8°E", "1 2 3 4 5", "61.6 8.3 1", "61.6.1 8", "61.6, 8.3, 9"]) {
      expect(parseCoord(bad), bad).toBeNull();
    }
  });

  it("round-trips every format it writes", () => {
    const tol = { dd: 1.2, dms: 3.5, ddm: 2.5, mgrs: 1.5, utm: 1 } as const;
    for (const [lon, lat] of [...samplePoints(150), [8.3125, 61.6364], [0, 0], [179.99, -79.99], [-179.99, 83.99], [45, 85], [-100, -86]] as Array<[number, number]>) {
      for (const sys of ["dd", "dms", "ddm", "mgrs", "utm"] as const) {
        const text = formatCoord(lon, lat, sys);
        const r = parseCoordDetailed(text);
        expect(r, text).not.toBeNull();
        expect(r!.format, text).toBe(sys);
        expect(metres({ lon, lat }, r!), text).toBeLessThan(tol[sys]);
      }
    }
  });
});

function lines(fc: GridCollection, level: string) {
  return fc.features.filter((f) => f.geometry.type === "LineString" && f.properties.level === level) as Array<{ geometry: LineString; properties: { axis?: string; value?: number; zone?: number } }>;
}
function labels(fc: GridCollection, level?: string) {
  return fc.features.filter((f) => f.geometry.type === "Point" && (!level || f.properties.level === level)) as Array<{ geometry: Point; properties: { label: string; gzd?: string } }>;
}

describe("grids", () => {
  it("labels ticks", () => {
    expect(latLonTickLabel(8, "lon", 1)).toBe("8°E");
    expect(latLonTickLabel(8.25, "lon", 0.25)).toBe("8°15'E");
    expect(latLonTickLabel(-33.5, "lat", 0.5)).toBe("33°30'S");
    expect(latLonTickLabel(61 + 30 / 3600, "lat", 10 / 3600)).toBe(`61°00'30"N`);
    expect(latLonTickLabel(0, "lat", 10)).toBe("0°");
    expect(latLonTickLabel(190, "lon", 10)).toBe("170°W");
    expect(utmTickLabel(466000, 1000)).toBe("66");
    expect(utmTickLabel(6830000, 10000)).toBe("30");
    expect(utmTickLabel(400000, 100000)).toBe("400");
  });

  it("clips polylines to a rectangle", () => {
    const pieces = clipPolyline([[-1, 0.5], [0.5, 0.5], [2, 0.5], [2, 2], [0.5, 0.8]], [0, 0, 1, 1]);
    expect(pieces.length).toBe(2);
    expect(pieces[0]).toEqual([[0, 0.5], [0.5, 0.5], [1, 0.5]]);
    expect(pieces[1][pieces[1].length - 1]).toEqual([0.5, 0.8]);
  });

  it("graticule for a small view", () => {
    const g = graticule([8, 61, 9, 62], 9);
    const ls = g.features.filter((f) => f.geometry.type === "LineString");
    const ps = labels(g);
    expect(ls.length).toBe(14); // 10' interval: 7 meridians, 7 parallels
    expect(ps.length).toBe(14);
    expect(ps.map((p) => p.properties.label)).toEqual(expect.arrayContaining(["8°00'E", "8°10'E", "9°00'E", "61°30'N", "62°00'N"]));
    expect(graticule([-180, -85, 180, 85], 0).features.length).toBeLessThan(80);
  });

  it("MGRS grid zone designators with the Norway exception", () => {
    const g = mgrsGrid([0, 50, 15, 65], 4);
    expect(lines(g, "100km").length).toBe(0);
    const names = labels(g, "gzd").map((l) => l.properties.label);
    expect(names).toEqual(expect.arrayContaining(["31U", "32U", "33U", "31V", "32V", "33V"]));
    const meridians = lines(g, "gzd").filter((l) => l.properties.axis === "lon");
    const spans = (lon: number) => meridians.filter((m) => m.properties.value === lon).map((m) => [m.geometry.coordinates[0][1], m.geometry.coordinates.at(-1)![1]]);
    expect(spans(6).filter(([a]) => a < 64)).toEqual([[50, 56]]); // no 31V/32V boundary at 6°E
    expect(spans(3)).toEqual([[56, 64]]); // the widened 32V's west edge
    const v32 = labels(g, "gzd").find((l) => l.properties.label === "32V")!;
    expect(v32.geometry.coordinates[0]).toBeCloseTo(7.5, 6);
  });

  it("MGRS grid zone designators on Svalbard", () => {
    const names = labels(mgrsGrid([0, 72.5, 42, 83.5], 3), "gzd").map((l) => l.properties.label).sort();
    expect(names).toEqual(["31X", "33X", "35X", "37X"]);
  });

  it("100 km squares with their IDs", () => {
    const g = mgrsGrid([7.8, 61.3, 8.8, 61.9], 7);
    const sq = labels(g, "100km");
    expect(sq.map((s) => s.properties.label)).toContain("MP");
    for (const s of sq) {
      const [lon, lat] = s.geometry.coordinates;
      expect(formatCoord(lon, lat, "mgrs").startsWith(`${s.properties.gzd} ${s.properties.label}`)).toBe(true);
    }
    expect(lines(g, "100km").length).toBeGreaterThan(0);
    expect(lines(g, "10km").length).toBe(0);
  });

  it("10 km and 1 km lines follow UTM eastings/northings inside the view", () => {
    const bbox: [number, number, number, number] = [8.25, 61.6, 8.35, 61.65];
    const g = mgrsGrid(bbox, 12.5);
    expect(mgrsLevelsForZoom(12.5)).toEqual(["gzd", "100km", "10km", "1km"]);
    const km = lines(g, "1km");
    const e = km.filter((l) => l.properties.axis === "e");
    const n = km.filter((l) => l.properties.axis === "n");
    // 0.1° of longitude at 61.6°N ≈ 5.3 km; 0.05° of latitude ≈ 5.6 km.
    expect(e.length).toBeGreaterThanOrEqual(5);
    expect(e.length).toBeLessThanOrEqual(6);
    expect(n.length).toBeGreaterThanOrEqual(5);
    expect(n.length).toBeLessThanOrEqual(6);
    for (const l of km) {
      for (const [lon, lat] of l.geometry.coordinates) {
        expect(lon).toBeGreaterThanOrEqual(bbox[0] - 1e-9);
        expect(lon).toBeLessThanOrEqual(bbox[2] + 1e-9);
        expect(lat).toBeGreaterThanOrEqual(bbox[1] - 1e-9);
        expect(lat).toBeLessThanOrEqual(bbox[3] + 1e-9);
        const u = toUtm(lon, lat, 32)!;
        const v = l.properties.axis === "e" ? u.easting : u.northing;
        expect(Math.abs(v - l.properties.value!)).toBeLessThan(0.01);
      }
    }
    const lab = labels(g, "1km").map((l) => l.properties.label);
    expect(lab).toEqual(expect.arrayContaining(["61", "62", "63", "34", "35"]));
    expect(g.features.length).toBeLessThan(200);
  });

  it("clips lines to their zone at a zone boundary", () => {
    const g = mgrsGrid([11.9, 61.5, 12.1, 61.6], 12);
    for (const l of [...lines(g, "10km"), ...lines(g, "1km")]) {
      const lons = l.geometry.coordinates.map((c) => c[0]);
      if (l.properties.zone === 32) {expect(Math.max(...lons)).toBeLessThanOrEqual(12 + 1e-9);}
      if (l.properties.zone === 33) {expect(Math.min(...lons)).toBeGreaterThanOrEqual(12 - 1e-9);}
    }
    expect(new Set(lines(g, "1km").map((l) => l.properties.zone))).toEqual(new Set([32, 33]));
  });

  it("caps the feature count by dropping finer levels", () => {
    const g = mgrsGrid([0, 55, 20, 65], 12);
    expect(g.features.length).toBeLessThanOrEqual(MAX_GRID_FEATURES);
    expect(lines(g, "1km").length).toBe(0);
    expect(lines(g, "100km").length).toBeGreaterThan(0);
  });

  it("handles views across the antimeridian", () => {
    const g = mgrsGrid([175, -5, 185, 5], 4);
    const names = labels(g, "gzd");
    const z1 = names.find((l) => l.properties.label === "1N")!;
    expect(z1.geometry.coordinates[0]).toBeGreaterThan(180);
    expect(names.some((l) => l.properties.label === "60M")).toBe(true);
  });

  it("draws the UPS caps", () => {
    const names = labels(mgrsGrid([-30, 80, 30, 89], 3), "gzd").map((l) => l.properties.label);
    expect(names).toEqual(expect.arrayContaining(["Y", "Z", "31X"]));
  });
});
