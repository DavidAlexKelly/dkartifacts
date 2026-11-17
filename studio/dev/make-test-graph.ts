/**
 * A synthetic pathfinding graph for trying the Route tool without Foundry:
 * two 2° cells over Jotunheimen, byte-for-byte in the real format (built with
 * decho-pathfinding's own test fixtures), with a 2,400 m massif and a lake
 * wall with a single gap, so routes across it must detour.
 *
 *   npx vite-node dev/make-test-graph.ts <data-folder>/pathgraph
 *
 * then serve <data-folder> with the fake Foundry and use the folder's fake RID.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildSyntheticCell, syntheticDataset } from "../../packages/decho-pathfinding/src/testing/fixtures";
// A 2° cell over Jotunheimen with a 2,400 m massif in the middle and an
// impassable wall with one gap, so a route across it has to detour.
const grid = { originLon: -180, originLat: 85, cellDeg: 2 };
const cells = [93, 94].map((col) => buildSyntheticCell({
  grid, col, row: 11, size: 120, diagonals: true, maxSlope: 0.6,
  elevation: (lon, lat) => 400 + 2000 * Math.exp(-(((lon - 8.4) / 0.25) ** 2 + ((lat - 61.65) / 0.12) ** 2)),
  // A wall of impassable ground at about 8.5°E, from 62.5°N down to 61.2°N,
  // with one gap near 61.25°N: a direct route across it has to detour south.
  omit: (i, j) => col === 94 && i >= 29 && i <= 31 && j >= 8 && j <= 105 && !(j >= 102 && j <= 105),
}));
const out = process.argv[2] ?? "test-graph";
for (const [path, buf] of syntheticDataset(cells)) {
  const file = join(out, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, new Uint8Array(buf));
}
console.log("wrote", [...syntheticDataset(cells).keys()].join(", "));
