import { describe, expect, it } from "vitest";

import {
  TERRAIN_OPEN,
  TERRAIN_ROAD,
  compileProfile,
  edgeCost,
  edgeSeconds,
  type VehicleProfile,
} from "./profiles.js";

const BASE: VehicleProfile = {
  id: "test",
  kVehicle: 2,
  terrain: { [TERRAIN_OPEN]: 2, [TERRAIN_ROAD]: 1 },
};

describe("the cost model", () => {
  it("reproduces dist * (1 + k*slope) * m[terrain]", () => {
    const profile = compileProfile(BASE, 0.4);
    expect(edgeCost(profile, 1000, 0, TERRAIN_ROAD)).toBeCloseTo(1000);
    expect(edgeCost(profile, 1000, 0, TERRAIN_OPEN)).toBeCloseTo(2000);
    // Uphill 10% at k=2: 1000 * 1.2 * 1
    expect(edgeCost(profile, 1000, 0.1, TERRAIN_ROAD)).toBeCloseTo(1200);
    // Downhill is cheaper, but still positive.
    expect(edgeCost(profile, 1000, -0.1, TERRAIN_ROAD)).toBeCloseTo(800);
  });

  /**
   * The trap that makes an otherwise correct A* return nonsense. With
   * max_slope 0.4 in the data, any k above 2.5 drives (1 + k*slope) negative
   * on a descent — and a negative edge does not crash Dijkstra, it just
   * quietly invalidates it.
   */
  it("never produces a negative or zero edge cost", () => {
    const steep = compileProfile({ ...BASE, kVehicle: 6 }, 0.4);
    const cost = edgeCost(steep, 1000, -0.4, TERRAIN_ROAD);
    expect(cost).toBeGreaterThan(0);
    // Clamped at the floor: 1000 * 0.1 * 1
    expect(cost).toBeCloseTo(100);
  });

  it("lets a profile be stricter about slope than the data, never looser", () => {
    const cautious = compileProfile({ ...BASE, maxSlope: 0.2 }, 0.4);
    expect(edgeCost(cautious, 1000, 0.3, TERRAIN_ROAD)).toBe(Infinity);
    expect(edgeCost(cautious, 1000, 0.15, TERRAIN_ROAD)).toBeLessThan(Infinity);

    const reckless = compileProfile({ ...BASE, maxSlope: 5 }, 0.4);
    expect(reckless.maxSlope).toBe(0.4);
  });

  /**
   * Admissibility, stated as a property: the heuristic multiplies great-circle
   * distance by minCostPerMetre, so no real edge may ever cost less per metre
   * than that. If one could, A* would stop being optimal.
   */
  it("keeps minCostPerMetre below every achievable edge cost", () => {
    for (const kVehicle of [0, 1, 2, 6]) {
      const profile = compileProfile({ ...BASE, kVehicle }, 0.4);
      for (const slope of [-0.4, -0.2, 0, 0.2, 0.4]) {
        for (const terrain of [TERRAIN_OPEN, TERRAIN_ROAD, 7]) {
          const cost = edgeCost(profile, 1000, slope, terrain);
          if (!Number.isFinite(cost)) {continue;}
          expect(cost / 1000).toBeGreaterThanOrEqual(
            profile.minCostPerMetre - 1e-9,
          );
        }
      }
    }
  });

  it("uses the default multiplier for an unlisted terrain class", () => {
    const profile = compileProfile(
      { ...BASE, defaultTerrainMultiplier: 5 },
      0.4,
    );
    expect(edgeCost(profile, 100, 0, 9)).toBeCloseTo(500);
  });

  it("reports no ETA when the profile declares no speeds", () => {
    const profile = compileProfile(BASE, 0.4);
    expect(profile.speeds).toBeNull();
    expect(edgeSeconds(profile, 1000, 0, TERRAIN_ROAD)).toBe(0);

    const timed = compileProfile(
      { ...BASE, speedMps: { [TERRAIN_ROAD]: 10, [TERRAIN_OPEN]: 5 } },
      0.4,
    );
    expect(edgeSeconds(timed, 1000, 0, TERRAIN_ROAD)).toBeCloseTo(100);
    expect(edgeSeconds(timed, 1000, 0, TERRAIN_OPEN)).toBeCloseTo(200);
  });
});
