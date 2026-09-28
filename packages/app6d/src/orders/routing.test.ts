import { describe, expect, it } from "vitest";

import {
  resolveRoute,
  sampleRoute,
  straightLineRoute,
  type OrderRouteRequest,
} from "./routing";
import type { MilOrderDef, PlacedMilUnit } from "./types";

const unit: PlacedMilUnit = {
  id: "u1",
  label: "1 PL",
  sidc: "SFGPUCI-----D---",
  lat: 59.4,
  lng: 28.2,
};
const order: MilOrderDef = { id: "seize", label: "Seize" };
const request: OrderRouteRequest = {
  from: { lat: 59.4, lng: 28.2 },
  to: { lat: 59.5, lng: 28.4 },
  unit,
  order,
};

describe("straightLineRoute", () => {
  it("returns exactly the two ends, in [lat, lng] order", () => {
    const route = straightLineRoute(request);
    expect(route.waypoints).toEqual([
      [59.4, 28.2],
      [59.5, 28.4],
    ]);
  });
});

describe("resolveRoute", () => {
  it("uses the straight line when no router is supplied, and does not call that a fallback", async () => {
    const { route, fallback } = await resolveRoute(undefined, request);
    expect(route.waypoints).toHaveLength(2);
    expect(fallback).toBe(false);
  });

  it("passes the request through to a supplied router", async () => {
    const seen: OrderRouteRequest[] = [];
    const { route, fallback } = await resolveRoute(
      {
        route: (req) => {
          seen.push(req);
          return {
            waypoints: [
              [1, 1],
              [2, 2],
              [3, 3],
            ],
            distanceKm: 42,
          };
        },
      },
      request,
    );
    expect(seen[0].unit.id).toBe("u1");
    expect(seen[0].order.id).toBe("seize");
    expect(route.distanceKm).toBe(42);
    expect(fallback).toBe(false);
  });

  it("awaits async routers", async () => {
    const { route } = await resolveRoute(
      {
        route: async () => ({
          waypoints: [
            [1, 1],
            [2, 2],
          ],
        }),
      },
      request,
    );
    expect(route.waypoints).toHaveLength(2);
  });

  // A host router that fails must not leave a half-assigned order behind: the
  // user clicked an objective and is owed a graphic either way.
  it("falls back to a straight line when the router returns null", async () => {
    const { route, fallback } = await resolveRoute(
      { route: () => null },
      request,
    );
    expect(route.waypoints).toHaveLength(2);
    expect(fallback).toBe(true);
  });

  it("falls back when the router returns a degenerate single-point path", async () => {
    const { route, fallback } = await resolveRoute(
      { route: () => ({ waypoints: [[1, 1]] as [number, number][] }) },
      request,
    );
    expect(route.waypoints).toHaveLength(2);
    expect(fallback).toBe(true);
  });

  it("falls back and reports the error when the router throws", async () => {
    const boom = new Error("terrain tiles unavailable");
    const { route, fallback, error } = await resolveRoute(
      {
        route: () => {
          throw boom;
        },
      },
      request,
    );
    expect(route.waypoints).toHaveLength(2);
    expect(fallback).toBe(true);
    expect(error).toBe(boom);
  });

  it("falls back when an async router rejects", async () => {
    const { fallback } = await resolveRoute(
      { route: () => Promise.reject(new Error("nope")) },
      request,
    );
    expect(fallback).toBe(true);
  });
});

describe("sampleRoute", () => {
  const straight = {
    waypoints: [
      [0, 0],
      [0, 10],
    ] as [number, number][],
  };

  it("returns the ends plus evenly spaced points between them", () => {
    expect(sampleRoute(straight, 3)).toEqual([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 5 },
      { lat: 0, lng: 10 },
    ]);
  });

  it("spaces by distance, not by waypoint index", () => {
    // Three waypoints, but the first segment is nine times the second: the
    // midpoint sample must land inside the long segment, not on the bend.
    const uneven = {
      waypoints: [
        [0, 0],
        [0, 9],
        [0, 10],
      ] as [number, number][],
    };
    const [, middle] = sampleRoute(uneven, 3);
    expect(middle.lng).toBeCloseTo(5, 10);
  });

  it("never produces NaN for a zero-length route", () => {
    const degenerate = {
      waypoints: [
        [3, 4],
        [3, 4],
      ] as [number, number][],
    };
    for (const point of sampleRoute(degenerate, 4)) {
      expect(Number.isFinite(point.lat)).toBe(true);
      expect(Number.isFinite(point.lng)).toBe(true);
    }
  });

  it("handles counts of one and zero without dividing by zero", () => {
    expect(sampleRoute(straight, 1)).toEqual([{ lat: 0, lng: 0 }]);
    expect(sampleRoute(straight, 0)).toEqual([]);
  });
});
