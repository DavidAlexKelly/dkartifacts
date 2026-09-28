import { describe, expect, it } from "vitest";

import { buildSyntheticCell } from "../testing/fixtures";
import { MalformedGraphError } from "./errors";
import { parseCellGraph } from "./format";
import { haversineM } from "./geo";
import type { CellGrid } from "./grid";

const GRID: CellGrid = { originLon: -180, originLat: 85, cellDeg: 2 };

const spec = {
  grid: GRID,
  col: 100,
  row: 12,
  size: 8,
  elevation: (lon: number, lat: number) => 100 * (lon + lat),
  terrain: (i: number) => (i === 0 ? 2 : 1),
};

describe("parsing a cell", () => {
  it("reads the packed 13/17-byte layout", () => {
    const cell = buildSyntheticCell(spec);
    const graph = parseCellGraph(cell.meta, cell.nodes, cell.edges);

    expect(graph.nodeCount).toBe(cell.meta.nodeCount);
    expect(graph.edgeCount).toBe(cell.meta.edgeCount);
    expect(graph.lon[0]).toBeCloseTo(cell.lon[0], 4);
    expect(graph.lat[0]).toBeCloseTo(cell.lat[0], 4);
    // CSR: offsets are non-decreasing and end at the edge count.
    expect(graph.offsets[0]).toBe(0);
    expect(graph.offsets[graph.nodeCount]).toBe(graph.edgeCount);
    for (let i = 0; i < graph.nodeCount; i++) {
      expect(graph.offsets[i + 1]).toBeGreaterThanOrEqual(graph.offsets[i]);
    }
  });

  /**
   * The reason format.ts derives the stride instead of hardcoding 13 and 17.
   * A padded generator would otherwise be read as noise: plausible numbers,
   * silently wrong routes.
   */
  it("reads a padded stride", () => {
    const cell = buildSyntheticCell(spec, { nodeStride: 16, edgeStride: 24 });
    const graph = parseCellGraph(cell.meta, cell.nodes, cell.edges);
    expect(graph.lon[5]).toBeCloseTo(cell.lon[5], 4);
    expect(graph.edgeCount).toBe(cell.meta.edgeCount);
  });

  it("reads big-endian words", () => {
    const cell = buildSyntheticCell(spec, { littleEndian: false });
    const graph = parseCellGraph(cell.meta, cell.nodes, cell.edges);
    expect(graph.lon[3]).toBeCloseTo(cell.lon[3], 4);
    expect(graph.lat[3]).toBeCloseTo(cell.lat[3], 4);
  });

  it("reads past a file header", () => {
    const cell = buildSyntheticCell(spec, { headerBytes: 16 });
    const graph = parseCellGraph(cell.meta, cell.nodes, cell.edges);
    expect(graph.lon[1]).toBeCloseTo(cell.lon[1], 4);
  });

  /**
   * The real dataset's layout, and a regression test for the reason the search
   * is over strides rather than over a list of header sizes.
   *
   * c091_r018 ships 219 834 bytes for 13 739 nodes: 16-byte records after a
   * 10-byte header. Ten was not in the original list of plausible header sizes,
   * so the parser refused to decode the cell at all — correctly, but uselessly.
   */
  it("reads 16-byte records after a 10-byte header, as the live cut writes them", () => {
    const cell = buildSyntheticCell(spec, {
      nodeStride: 16,
      edgeStride: 20,
      headerBytes: 10,
    });

    // The arithmetic that produced the original failure, in miniature.
    expect(cell.nodes.byteLength).toBe(10 + 16 * cell.meta.nodeCount);
    expect(cell.nodes.byteLength % cell.meta.nodeCount).not.toBe(0);

    const graph = parseCellGraph(cell.meta, cell.nodes, cell.edges);
    expect(graph.nodeCount).toBe(cell.meta.nodeCount);
    expect(graph.edgeCount).toBe(cell.meta.edgeCount);
    for (let i = 0; i < graph.nodeCount; i++) {
      expect(graph.lon[i]).toBeCloseTo(cell.lon[i], 4);
      expect(graph.lat[i]).toBeCloseTo(cell.lat[i], 4);
    }
  });

  it("reads records that sit before a trailer rather than after a header", () => {
    const cell = buildSyntheticCell(spec, { nodeStride: 16, edgeStride: 20 });
    const withTrailer = (buffer: ArrayBuffer) => {
      const padded = new Uint8Array(buffer.byteLength + 10);
      padded.set(new Uint8Array(buffer));
      padded.fill(0xab, buffer.byteLength);
      return padded.buffer;
    };

    const graph = parseCellGraph(
      cell.meta,
      withTrailer(cell.nodes),
      withTrailer(cell.edges),
    );
    expect(graph.lon[2]).toBeCloseTo(cell.lon[2], 4);
    expect(graph.edgeCount).toBe(cell.meta.edgeCount);
  });

  it("keeps each direction's own slope", () => {
    const cell = buildSyntheticCell(spec);
    const graph = parseCellGraph(cell.meta, cell.nodes, cell.edges);

    // Every edge should have a mirror with the opposite slope: the file is
    // directed, and treating it as undirected would lose the uphill penalty.
    let checked = 0;
    for (let from = 0; from < graph.nodeCount && checked < 5; from++) {
      for (let e = graph.offsets[from]; e < graph.offsets[from + 1]; e++) {
        const to = graph.edgeTo[e];
        if (graph.edgeSlope[e] === 0) {continue;}
        let mirror = -1;
        for (let f = graph.offsets[to]; f < graph.offsets[to + 1]; f++) {
          if (graph.edgeTo[f] === from) {mirror = f;}
        }
        expect(mirror).toBeGreaterThanOrEqual(0);
        expect(graph.edgeSlope[mirror]).toBeCloseTo(-graph.edgeSlope[e], 6);
        checked += 1;
        break;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  /**
   * The failure that produced "0 errors but every route is a straight line".
   *
   * A generator that writes terrain before slope yields a file the documented
   * offsets read as slope ≈ 0 (a denormal made of a class id and padding) and
   * terrain ≈ 143 (the first byte of the real slope float). A terrain class of
   * 143 is in no profile's table, so every edge takes the default multiplier,
   * every vehicle agrees, and the cheapest path is the straightest one — with
   * nothing thrown and nothing logged.
   */
  it("finds dist, slope and terrain wherever the generator put them", () => {
    const cell = buildSyntheticCell(
      { ...spec, elevation: (lon: number, lat: number) => 400 * (lon + lat) },
      {
        edgeStride: 20,
        // terrain first, then slope — the opposite of the format string.
        edgeFieldOffsets: { dist: 8, slope: 16, terrain: 12 },
      },
    );

    const graph = parseCellGraph(cell.meta, cell.nodes, cell.edges);

    // Slope must be the real gradient, not a denormal.
    let nonZeroSlopes = 0;
    for (let e = 0; e < graph.edgeCount; e++) {
      if (Math.abs(graph.edgeSlope[e]) > 1e-6) {nonZeroSlopes += 1;}
    }
    expect(nonZeroSlopes).toBeGreaterThan(0);

    // Terrain must be the declared classes, not an arbitrary byte.
    const classes = new Set(Array.from(graph.edgeTerrain));
    expect([...classes].every((c) => c === 1 || c === 2)).toBe(true);
    expect(classes.size).toBe(2);

    // And dist must still agree with the geometry it was checked against.
    for (let from = 0; from < graph.nodeCount; from++) {
      for (let e = graph.offsets[from]; e < graph.offsets[from + 1]; e++) {
        const to = graph.edgeTo[e];
        const ground = haversineM(
          graph.lon[from],
          graph.lat[from],
          graph.lon[to],
          graph.lat[to],
        );
        expect(Math.abs(graph.edgeDist[e] - ground) / ground).toBeLessThan(0.01);
      }
    }
  });

  it("still reads the documented order when that is what was written", () => {
    const cell = buildSyntheticCell({
      ...spec,
      elevation: (lon: number, lat: number) => 400 * (lon + lat),
    });
    const graph = parseCellGraph(cell.meta, cell.nodes, cell.edges);

    const classes = new Set(Array.from(graph.edgeTerrain));
    expect([...classes].every((c) => c === 1 || c === 2)).toBe(true);

    // Slope agrees with rise over run, in both directions.
    for (let from = 0; from < graph.nodeCount; from++) {
      for (let e = graph.offsets[from]; e < graph.offsets[from + 1]; e++) {
        const to = graph.edgeTo[e];
        const expected =
          (graph.elev[to] - graph.elev[from]) / graph.edgeDist[e];
        expect(graph.edgeSlope[e]).toBeCloseTo(expected, 4);
      }
    }
  });

  it("refuses a layout it was not written for, instead of guessing", () => {
    const cell = buildSyntheticCell(spec);
    const meta = {
      ...cell.meta,
      format: { ...cell.meta.format, nodes: "NODE v2: lon,f64 lat,f64" },
    };
    expect(() => parseCellGraph(meta, cell.nodes, cell.edges)).toThrow(
      MalformedGraphError,
    );
  });

  it("refuses bytes that do not decode to coordinates in the cell", () => {
    const cell = buildSyntheticCell(spec);
    const corrupt = new ArrayBuffer(cell.nodes.byteLength);
    new Uint8Array(corrupt).fill(0x7f);
    expect(() => parseCellGraph(cell.meta, corrupt, cell.edges)).toThrow(
      MalformedGraphError,
    );
  });

  it("refuses a count that does not divide the file", () => {
    const cell = buildSyntheticCell(spec);
    const meta = { ...cell.meta, nodeCount: cell.meta.nodeCount + 1 };
    expect(() => parseCellGraph(meta, cell.nodes, cell.edges)).toThrow(
      MalformedGraphError,
    );
  });
});
