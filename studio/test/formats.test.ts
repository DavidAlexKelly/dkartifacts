import type { Feature, LineString, Point, Polygon, Position } from "geojson";
import proj4 from "proj4";
import { describe, expect, it } from "vitest";
import type { StudioFeature } from "../src/project/types";
import { CRS_OPTIONS, defFromPrj, guessCrsFromCoords, isGeographic, reprojectFeatures } from "../src/formats/crs";
import { readDxf } from "../src/formats/dxf";
import { parseGpkgGeometry, readGeoPackage, writeGeoPackage } from "../src/formats/geopackage";
import { exportLayer, importFiles } from "../src/formats/import";
import { readKmz, writeKmz } from "../src/formats/kmz";
import { readShapefile, writeShapefile } from "../src/formats/shapefile";
import { crc32, readZip, writeZip } from "../src/formats/zip";

const feat = (id: string, geometry: StudioFeature["geometry"], properties: Record<string, unknown> = {}): StudioFeature => ({ type: "Feature", id, geometry, properties });

const UTM32N_ESRI =
  'PROJCS["WGS_1984_UTM_Zone_32N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",9.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

/** An independent UTM forward (Krüger series, as on Wikipedia) to check proj4 against. */
function utmForward(lon: number, lat: number, zone: number): [number, number] {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const n = f / (2 - f);
  const A = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
  const al = [n / 2 - (2 * n ** 2) / 3 + (5 * n ** 3) / 16 + (41 * n ** 4) / 180, (13 * n ** 2) / 48 - (3 * n ** 3) / 5 + (557 * n ** 4) / 1440, (61 * n ** 3) / 240 - (103 * n ** 4) / 140, (49561 * n ** 4) / 161280];
  const phi = (lat * Math.PI) / 180;
  const lam = ((lon - (zone * 6 - 183)) * Math.PI) / 180;
  const c = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)));
  const xi = Math.atan(t / Math.cos(lam));
  const eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let E = eta;
  let N = xi;
  al.forEach((aj, j) => {
    E += aj * Math.cos(2 * (j + 1) * xi) * Math.sinh(2 * (j + 1) * eta);
    N += aj * Math.sin(2 * (j + 1) * xi) * Math.cosh(2 * (j + 1) * eta);
  });
  return [500000 + 0.9996 * A * E, 0.9996 * A * N];
}

function ringArea2(ring: Position[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {s += (ring[i][0] - ring[j][0]) * (ring[i][1] + ring[j][1]);}
  return s; // > 0: clockwise
}

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips stored and deflated entries with UTF-8 names", async () => {
    const big = "lorem ipsum dolor sit amet ".repeat(200);
    const bin = new Uint8Array(300).map((_, i) => (i * 37) & 0xff);
    const zip = await writeZip({ "a.txt": "hi", "dir/big.txt": big, "ünï/bin.dat": bin });
    expect(zip.length).toBeLessThan(big.length);
    const back = await readZip(zip);
    expect([...back.keys()].sort()).toEqual(["a.txt", "dir/big.txt", "ünï/bin.dat"]);
    expect(new TextDecoder().decode(back.get("a.txt"))).toBe("hi");
    expect(new TextDecoder().decode(back.get("dir/big.txt"))).toBe(big);
    expect([...back.get("ünï/bin.dat")!]).toEqual([...bin]);
  });

  it("reads entries written with a data descriptor (sizes only in the central directory)", async () => {
    const zip = await writeZip({ "x.txt": "data descriptor ".repeat(20) });
    const dv = new DataView(zip.buffer);
    dv.setUint16(6, 0x808, true); // flag bit 3
    dv.setUint32(14, 0, true);
    dv.setUint32(18, 0, true);
    dv.setUint32(22, 0, true);
    const back = await readZip(zip);
    expect(new TextDecoder().decode(back.get("x.txt"))).toBe("data descriptor ".repeat(20));
  });

  it("rejects non-zip bytes", async () => {
    await expect(readZip(new Uint8Array(100))).rejects.toThrow(/Not a ZIP/);
  });
});

describe("crs", () => {
  it("defines the picker's CRSs, including every UTM zone", () => {
    const codes = CRS_OPTIONS.map((o) => o.code);
    for (const c of ["EPSG:4326", "EPSG:3857", "EPSG:27700", "EPSG:2154", "EPSG:3035", "EPSG:2056", "EPSG:31370", "EPSG:25832", "EPSG:32601", "EPSG:32660", "EPSG:32760", "EPSG:5070"]) {
      expect(codes).toContain(c);
    }
    expect(codes.filter((c) => /^EPSG:32[67]\d\d$/.test(c))).toHaveLength(120);
    expect(isGeographic("EPSG:4258")).toBe(true);
    expect(isGeographic("EPSG:32632")).toBe(false);
  });

  it("projects to UTM 32N in agreement with an independent formula, and back, within 1 cm", () => {
    for (const [lon, lat] of [[9, 0], [10.5, 51.3], [7.2, 45.9], [11.9, 60.1]]) {
      const [e, n] = proj4("EPSG:4326", "EPSG:32632", [lon, lat]);
      const [e2, n2] = utmForward(lon, lat, 32);
      expect(Math.abs(e - e2)).toBeLessThan(0.01);
      expect(Math.abs(n - n2)).toBeLessThan(0.01);
      const [back] = reprojectFeatures([feat("p", { type: "Point", coordinates: [e, n] })], "EPSG:32632").map((f) => (f.geometry as Point).coordinates);
      // 1e-7 degrees is about 1 cm.
      expect(Math.abs(back[0] - lon)).toBeLessThan(1e-7);
      expect(Math.abs(back[1] - lat)).toBeLessThan(1e-7);
    }
    expect(proj4("EPSG:4326", "EPSG:32632", [9, 0])).toEqual([500000, 0]);
  });

  it("matches the Ordnance Survey's British National Grid worked example", () => {
    // OS "A guide to coordinate systems in Great Britain", Annex C: Caister water tower, on OSGB36.
    const osgb36 = "+proj=longlat +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +no_defs";
    const lon = 1 + 43 / 60 + 4.5177 / 3600;
    const lat = 52 + 39 / 60 + 27.2531 / 3600;
    const [e, n] = proj4(osgb36, "EPSG:27700", [lon, lat]);
    expect(e).toBeCloseTo(651409.903, 2);
    expect(n).toBeCloseTo(313177.27, 2);
    // To WGS84 the 7-parameter datum shift applies: OSGB36 and WGS84 lon/lat differ by roughly 100 m here.
    const [lonW, latW] = proj4("EPSG:27700", "EPSG:4326", [651409.903, 313177.27]);
    const shiftM = Math.hypot((lonW - lon) * 111320 * Math.cos((lat * Math.PI) / 180), (latW - lat) * 110950);
    expect(shiftM).toBeGreaterThan(50);
    expect(shiftM).toBeLessThan(200);
    const [e2, n2] = proj4("EPSG:4326", "EPSG:27700", [lonW, latW]);
    expect(Math.abs(e2 - 651409.903)).toBeLessThan(0.01);
    expect(Math.abs(n2 - 313177.27)).toBeLessThan(0.01);
  });

  it("recognises .prj files by authority code, ESRI name, or as parsable WKT", () => {
    expect(defFromPrj(UTM32N_ESRI)).toBe("EPSG:32632");
    expect(defFromPrj('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]')).toBe("EPSG:4326");
    expect(defFromPrj('PROJCS["British_National_Grid",GEOGCS["GCS_OSGB_1936",DATUM["D_OSGB_1936",SPHEROID["Airy_1830",6377563.396,299.3249646]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",400000.0],PARAMETER["False_Northing",-100000.0],PARAMETER["Central_Meridian",-2.0],PARAMETER["Scale_Factor",0.9996012717],PARAMETER["Latitude_Of_Origin",49.0],UNIT["Meter",1.0]]')).toBe("EPSG:27700");
    expect(defFromPrj('PROJCS["RGF93 / Lambert-93",GEOGCS["RGF93"],UNIT["metre",1],AUTHORITY["EPSG","2154"]]')).toBe("EPSG:2154");
    const custom = 'PROJCS["Custom_TM",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",15.0],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
    const def = defFromPrj(custom);
    expect(def).toBe(custom);
    const [lon, lat] = proj4(def!, "EPSG:4326", [0, 0]);
    expect(lon).toBeCloseTo(15, 6);
    expect(lat).toBeCloseTo(0, 6);
    expect(defFromPrj("nonsense")).toBeNull();
  });

  it("reprojects every geometry type and tells lon/lat from projected", () => {
    const fs = [
      feat("a", { type: "MultiPolygon", coordinates: [[[[500000, 0], [510000, 0], [510000, 10000], [500000, 0]]]] }),
      feat("b", { type: "GeometryCollection", geometries: [{ type: "LineString", coordinates: [[500000, 0, 12], [500000, 1000, 13]] }] }),
    ];
    expect(guessCrsFromCoords(fs)).toBeNull();
    const out = reprojectFeatures(fs, "EPSG:32632");
    expect(guessCrsFromCoords(out)).toBe("EPSG:4326");
    expect(fs[0].geometry).not.toBe(out[0].geometry);
    const line = (out[1].geometry as { geometries: LineString[] }).geometries[0].coordinates;
    expect(line[0][0]).toBeCloseTo(9, 9);
    expect(line[1][2]).toBe(13);
  });
});

const POINTS: StudioFeature[] = [
  feat("p1", { type: "Point", coordinates: [8.5417, 47.3769] }, { name: "Zürich – 東京 ✓", population: 421878, ratio: 0.25, capital: false, a_very_long_field_name: "first", a_very_long_field_name_2: "second", when: null }),
  feat("p2", { type: "Point", coordinates: [-0.1276, 51.5072] }, { name: "London", population: 8_982_000, ratio: -1.125, capital: true, a_very_long_field_name: "", a_very_long_field_name_2: "z", when: "2024-01-02" }),
];
const FIELDS = ["name", "population", "ratio", "capital", "a_very_long_field_name", "a_very_long_field_name_2", "when"];
const LINE = feat("l1", { type: "LineString", coordinates: [[0, 0], [1, 1], [2, 0]] }, { name: "line" });
const POLY = feat("g1", {
  type: "Polygon",
  coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], // CCW outer (RFC 7946)
    [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]], // CW hole
  ],
}, { name: "square with hole" });
const MULTIPOLY = feat("g2", { type: "MultiPolygon", coordinates: [[[[20, 0], [21, 0], [21, 1], [20, 0]]], [[[30, 0], [31, 0], [31, 1], [30, 0]]]] }, { name: "two parts" });

describe("shapefile", () => {
  it("round-trips mixed geometries as one shapefile per family, with attributes", async () => {
    const zip = await writeShapefile("places", [...POINTS, LINE, POLY, MULTIPOLY], FIELDS);
    const files = await readZip(zip);
    expect([...files.keys()].sort()).toEqual(
      ["lines", "points", "polygons"].flatMap((f) => ["cpg", "dbf", "prj", "shp", "shx"].map((x) => `places_${f}.${x}`)).sort(),
    );
    const layers = readShapefile(files);
    const by = Object.fromEntries(layers.map((l) => [l.title, l]));
    expect(Object.keys(by).sort()).toEqual(["places_lines", "places_points", "places_polygons"]);

    const pts = by.places_points;
    expect(pts.fields).toEqual(["name", "population", "ratio", "capital", "a_very_lon", "a_very_l_1", "when"]);
    expect(pts.features.map((f) => (f.geometry as Point).coordinates)).toEqual([[8.5417, 47.3769], [-0.1276, 51.5072]]);
    expect(pts.features[0].properties).toEqual({ name: "Zürich – 東京 ✓", population: 421878, ratio: 0.25, capital: false, a_very_lon: "first", a_very_l_1: "second", when: null });
    expect(pts.features[1].properties).toMatchObject({ population: 8982000, ratio: -1.125, capital: true, a_very_lon: null, when: "2024-01-02" });
    expect(pts.needsCrs).toBeFalsy();

    expect((by.places_lines.features[0].geometry as LineString).coordinates).toEqual([[0, 0], [1, 1], [2, 0]]);

    const polys = by.places_polygons.features;
    expect(polys).toHaveLength(2);
    const sq = polys[0].geometry as Polygon;
    expect(sq.type).toBe("Polygon");
    expect(sq.coordinates).toHaveLength(2);
    expect(ringArea2(sq.coordinates[0])).toBeLessThan(0); // outer CCW
    expect(ringArea2(sq.coordinates[1])).toBeGreaterThan(0); // hole CW
    expect(sq.coordinates[1].map((p) => p.join(",")).sort()).toEqual(POLY.geometry.type === "Polygon" ? POLY.geometry.coordinates[1].map((p) => p.join(",")).sort() : []);
    expect(polys[1].geometry.type).toBe("MultiPolygon");
    expect(polys[1].properties.name).toBe("two parts");
  });

  it("uses the plain name for a single family and writes a valid .shx index", async () => {
    const files = await readZip(await writeShapefile("only", POINTS, FIELDS));
    expect(files.has("only.shp")).toBe(true);
    const shx = new DataView(files.get("only.shx")!.buffer);
    expect(shx.getInt32(0, false)).toBe(9994);
    expect(shx.getInt32(24, false) * 2).toBe(100 + 8 * POINTS.length);
    expect(shx.getInt32(100, false)).toBe(50); // first record at byte 100
  });

  it("reprojects from the .prj, and flags a projected shapefile without one", async () => {
    const utm = [feat("u", { type: "Point", coordinates: [500000, 5_316_000] }, { id: 1 })];
    const files = await readZip(await writeShapefile("utm", utm, ["id"]));
    files.set("utm.prj", new TextEncoder().encode(UTM32N_ESRI));
    const [layer] = readShapefile(files);
    expect(layer.sourceCrs).toBe("EPSG:32632");
    const [lon, lat] = (layer.features[0].geometry as Point).coordinates;
    expect(lon).toBeCloseTo(9, 6);
    expect(lat).toBeGreaterThan(47.9);
    expect(lat).toBeLessThan(48.1);

    files.delete("utm.prj");
    const [unknown] = readShapefile(files);
    expect(unknown.needsCrs).toBe(true);
    const [given] = readShapefile(files, { crs: "EPSG:32632" });
    expect((given.features[0].geometry as Point).coordinates[0]).toBeCloseTo(9, 6);
  });

  it("decodes latin-1 attributes when there is no .cpg and the bytes are not UTF-8", async () => {
    const files = await readZip(await writeShapefile("enc", [feat("x", { type: "Point", coordinates: [1, 2] }, { name: "Muller" })], ["name"]));
    const dbf = files.get("enc.dbf")!;
    const at = dbf.indexOf(0x4d); // "M" of the value
    dbf[at + 1] = 0xfc; // "ü" in latin-1
    files.delete("enc.cpg");
    expect(readShapefile(files)[0].features[0].properties.name).toBe("Müller");
  });
});

describe("geopackage", () => {
  it("round-trips layers through sql.js, with typed columns", async () => {
    const bytes = await writeGeoPackage([
      { name: "places", features: POINTS, fields: FIELDS },
      { name: "shapes", features: [LINE, POLY, MULTIPOLY], fields: ["name"] },
    ]);
    // "SQLite format 3\0" and application_id "GPKG"
    expect(new TextDecoder().decode(bytes.subarray(0, 15))).toBe("SQLite format 3");
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(68, false)).toBe(0x47504b47);
    const layers = await readGeoPackage(bytes);
    expect(layers.map((l) => l.title)).toEqual(["places", "shapes"]);
    const [places, shapes] = layers;
    expect(places.fields).toEqual(FIELDS);
    expect(places.features[0].properties).toEqual(POINTS[0].properties);
    expect(places.features[1].properties).toEqual({ ...POINTS[1].properties });
    expect(places.features.map((f) => f.geometry)).toEqual(POINTS.map((f) => f.geometry));
    expect(shapes.features.map((f) => f.geometry)).toEqual([LINE.geometry, POLY.geometry, MULTIPOLY.geometry]);
  });

  it("parses geometry blobs with Z, big-endian WKB and other envelopes, and reprojects from the srs", async () => {
    // Big-endian WKB PointZ (ISO 1001) after a GP header with an XYZ envelope (code 2).
    const blob = new Uint8Array(8 + 48 + 29);
    const dv = new DataView(blob.buffer);
    blob.set([0x47, 0x50, 0, 0b0100], 0); // big-endian header, envelope 2
    dv.setInt32(4, 32632, false);
    const w = 56;
    blob[w] = 0;
    dv.setUint32(w + 1, 1001, false);
    dv.setFloat64(w + 5, 500000, false);
    dv.setFloat64(w + 13, 0, false);
    dv.setFloat64(w + 21, 42.5, false);
    const parsed = parseGpkgGeometry(blob);
    expect(parsed.srsId).toBe(32632);
    expect(parsed.geometry).toEqual({ type: "Point", coordinates: [500000, 0, 42.5] });

    // Write a file in WGS84, then relabel it as UTM 32N and put the UTM blob in.
    const { loadSql } = await import("../src/formats/geopackage");
    const SQL = await loadSql();
    const db = new SQL.Database(await writeGeoPackage([{ name: "t", features: [feat("a", { type: "Point", coordinates: [0, 0] }, { v: 1 })], fields: ["v"] }]));
    db.run("INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84 / UTM zone 32N', 32632, 'EPSG', 32632, 'PROJCS[\"WGS 84 / UTM zone 32N\"]', '')");
    db.run("UPDATE gpkg_geometry_columns SET srs_id = 32632");
    db.run("UPDATE t SET geom = ?", [blob]);
    const [layer] = await readGeoPackage(db.export());
    db.close();
    expect(layer.sourceCrs).toBe("EPSG:32632");
    const c = (layer.features[0].geometry as Point).coordinates;
    expect(c[0]).toBeCloseTo(9, 9);
    expect(c[1]).toBeCloseTo(0, 9);
    expect(c[2]).toBe(42.5);
  });
});

describe("kmz", () => {
  it("round-trips through doc.kml", async () => {
    const bytes = await writeKmz("places", POINTS, ["name", "population"], "name");
    expect([...(await readZip(bytes)).keys()]).toEqual(["doc.kml"]);
    const back = await readKmz(bytes, "places");
    expect(back.features).toHaveLength(2);
    expect(back.features[0].properties.name).toBe("Zürich – 東京 ✓");
    expect(back.features[1].properties.population).toBe(8982000);
    expect((back.features[1].geometry as Point).coordinates).toEqual([-0.1276, 51.5072]);
  });
});

const DXF = [
  "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "POINT", "8", "Trees", "10", "500100.0", "20", "5316100.0", "30", "0.0",
  "0", "LINE", "8", "Roads", "10", "500000", "20", "5316000", "11", "500200", "21", "5316000",
  "0", "LWPOLYLINE", "8", "Buildings", "90", "4", "70", "1", "10", "500000", "20", "5316000", "10", "500010", "20", "5316000", "10", "500010", "20", "5316010", "10", "500000", "20", "5316010",
  "0", "LWPOLYLINE", "8", "Paths", "90", "2", "70", "0", "10", "500000", "20", "5316020", "10", "500050", "20", "5316030",
  "0", "POLYLINE", "8", "Fences", "66", "1", "70", "0",
  "0", "VERTEX", "8", "Fences", "10", "500000", "20", "5316100",
  "0", "VERTEX", "8", "Fences", "10", "500020", "20", "5316120",
  "0", "VERTEX", "8", "Fences", "10", "500040", "20", "5316100",
  "0", "SEQEND",
  "0", "CIRCLE", "8", "Wells", "10", "500100", "20", "5316100", "40", "5",
  "0", "ARC", "8", "Roads", "10", "500000", "20", "5316000", "40", "10", "50", "0", "51", "90",
  "0", "TEXT", "8", "Labels", "10", "500005", "20", "5316005", "40", "2.5", "1", "Town hall",
  "0", "MTEXT", "8", "Labels", "10", "500006", "20", "5316006", "40", "2", "3", "{\\fArial|b1;Multi", "1", "\\Pline}",
  "0", "ELLIPSE", "8", "Other", "10", "0", "20", "0",
  "0", "ENDSEC", "0", "EOF",
].join("\r\n");

describe("dxf", () => {
  it("parses entities into features, flagging the missing CRS", () => {
    const r = readDxf(DXF);
    expect(r.needsCrs).toBe(true);
    expect(r.skipped).toBe(1); // ELLIPSE
    const kinds = r.features.map((f) => `${f.properties.entity}:${f.geometry.type}`);
    expect(kinds).toEqual([
      "POINT:Point", "LINE:LineString", "LWPOLYLINE:Polygon", "LWPOLYLINE:LineString", "POLYLINE:LineString",
      "CIRCLE:Polygon", "ARC:LineString", "TEXT:Point", "MTEXT:Point",
    ]);
    expect(r.features[0].properties.layer).toBe("Trees");
    const circle = r.features[5].geometry as Polygon;
    expect(circle.coordinates[0]).toHaveLength(65);
    expect(circle.coordinates[0][0]).toEqual(circle.coordinates[0][64]);
    const arc = (r.features[6].geometry as LineString).coordinates;
    expect(arc[0][0]).toBeCloseTo(500010, 6);
    expect(arc[arc.length - 1][1]).toBeCloseTo(5316010, 6);
    expect((r.features[4].geometry as LineString).coordinates).toHaveLength(3);
    expect(r.features[7].properties.text).toBe("Town hall");
    expect(r.features[8].properties.text).toBe("Multi\nline");
    expect(r.fields).toEqual(["layer", "entity", "text", "height", "radius"]);
  });

  it("reprojects when given a CRS", () => {
    const r = readDxf(DXF, "EPSG:32632");
    expect(r.needsCrs).toBeFalsy();
    const [lon, lat] = (r.features[0].geometry as Point).coordinates;
    expect(lon).toBeCloseTo(9.00135, 4);
    expect(lat).toBeGreaterThan(47.9);
    expect(lat).toBeLessThan(48.1);
  });
});

describe("import dispatcher", () => {
  const file = (name: string, content: Uint8Array | string) => new File([content], name);

  it("groups shapefile sidecars by name, opens zips, gpkg, kmz, dxf and text formats", async () => {
    const shpZip = await readZip(await writeShapefile("roads", [LINE], ["name"]));
    const pointsZip = await writeShapefile("pois", POINTS, FIELDS);
    const gpkg = await writeGeoPackage([{ name: "parcels", features: [POLY], fields: ["name"] }]);
    const kmz = await writeKmz("kmz layer", [POINTS[1]], ["name"]);
    const geojson = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [1, 2] }, properties: { a: 1 } }] });
    const res = await importFiles([
      ...[...shpZip].map(([n, b]) => file(n.toUpperCase().replace(".SHP", ".shp"), b)),
      file("lonely.dbf", shpZip.get("roads.dbf")!),
      file("pois.zip", pointsZip),
      file("db.gpkg", gpkg),
      file("trip.kmz", kmz),
      file("plain.geojson", geojson),
      file("notes.docx", "x"),
    ]);
    const titles = res.layers.map((l) => l.title).sort();
    expect(titles).toEqual(["ROADS", "parcels", "plain", "pois", "trip"]);
    const roads = res.layers.find((l) => l.title === "ROADS")!;
    expect(roads.features[0].properties.name).toBe("line");
    expect(res.layers.find((l) => l.title === "pois")!.features[0].properties.name).toBe("Zürich – 東京 ✓");
    expect(res.errors.some((e) => e.startsWith("lonely.dbf"))).toBe(true);
    expect(res.errors.some((e) => e.startsWith("notes.docx"))).toBe(true);
    expect(res.errors).toHaveLength(2);
    expect(res.needsCrs).toEqual([]);
  });

  it("asks for a CRS for projected CSV, GeoJSON and DXF, and applies one when given", async () => {
    const csv = "name,x,y\nA,500000,5316000\nB,500100,5316100\n";
    const gj = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [500000, 5316000] }, properties: {} }] });
    const files = () => [new File([csv], "pts.csv"), new File([gj], "pts.geojson"), new File([DXF], "plan.dxf")];
    const first = await importFiles(files());
    expect(first.layers).toEqual([]);
    expect(first.needsCrs.sort()).toEqual(["plan.dxf", "pts.csv", "pts.geojson"]);
    const second = await importFiles(files(), { crs: "EPSG:32632" });
    expect(second.needsCrs).toEqual([]);
    expect(second.errors).toEqual([]);
    for (const l of second.layers) {expect(guessCrsFromCoords(l.features)).toBe("EPSG:4326");}
    const csvLayer = second.layers.find((l) => l.title === "pts" && l.fields.includes("name"))!;
    expect(csvLayer.features).toHaveLength(2);
    expect((csvLayer.features[0].geometry as Point).coordinates[0]).toBeCloseTo(9, 6);
  });

  it("honours a GeoJSON's legacy crs member", async () => {
    const gj = JSON.stringify({
      type: "FeatureCollection",
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::32632" } },
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [500000, 0] }, properties: {} } satisfies Feature],
    });
    const res = await importFiles([new File([gj], "legacy.json")]);
    expect((res.layers[0].features[0].geometry as Point).coordinates[0]).toBeCloseTo(9, 9);
  });

  it("exports each format with a matching filename", async () => {
    const fs = [...POINTS, POLY];
    for (const [format, ext] of [["geojson", "geojson"], ["csv", "csv"], ["kml", "kml"], ["kmz", "kmz"], ["shapefile", "zip"], ["geopackage", "gpkg"]] as const) {
      const { blob, filename } = await exportLayer(format, "My layer", fs, FIELDS, "name");
      expect(filename).toBe(`My_layer.${ext}`);
      expect(blob.size).toBeGreaterThan(100);
    }
    const { blob } = await exportLayer("geopackage", "My layer", fs, FIELDS);
    const back = await importFiles([new File([blob], "My_layer.gpkg")]);
    expect(back.layers[0].features).toHaveLength(3);
  });
});
