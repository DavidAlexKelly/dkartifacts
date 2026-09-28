/**
 * Mobility profiles — the half of the cost model that is NOT in the data.
 *
 * Every cell declares:
 *
 *     costModel: "dist_m * (1 + k_vehicle * slope) * m[vehicle][terrain]"
 *
 * and stores only the raw inputs: `dist` in metres, signed `slope`, and a
 * `terrain` class per edge. `k_vehicle` and `m[vehicle][terrain]` are supplied
 * at query time, which is the single best property of this dataset: one graph
 * serves every vehicle, and adding a mobility class costs an object literal
 * rather than a rebuild.
 *
 * TWO TRAPS, BOTH GUARDED HERE
 * ----------------------------
 * 1. `slope` is SIGNED and stored per DIRECTION (which is why `from->to` and
 *    `to->from` are separate rows in edges.bin — do not treat the file as
 *    undirected). With max_slope 0.4 in the data, any profile with
 *    k_vehicle > 2.5 makes `1 + k*slope` NEGATIVE on a steep descent. Dijkstra
 *    and A* are undefined on negative edges: they do not crash, they return a
 *    confident, wrong answer. `slopeFloor` clamps the factor, and the same
 *    floor is used to derive the heuristic's lower bound so the two can never
 *    disagree.
 *
 * 2. The generator already dropped edges steeper than the cell's `max_slope`,
 *    so a profile can only ever be MORE restrictive. `maxSlope` filters at
 *    expansion time rather than at parse time — one graph, many vehicles.
 */

/** Terrain classes as the dataset declares them. */
export const TERRAIN_OPEN = 1;
export const TERRAIN_ROAD = 2;

export interface VehicleProfile {
  id: string;
  label?: string;
  /** k_vehicle: how much slope costs this vehicle. */
  kVehicle: number;
  /** m[vehicle][terrain]: cost multiplier per terrain class. */
  terrain: Record<number, number>;
  /** Multiplier for a terrain class the profile does not list. */
  defaultTerrainMultiplier?: number;
  /** Refuse edges steeper than this. Defaults to the cell's own max_slope. */
  maxSlope?: number;
  /**
   * Lower bound on the slope factor. See trap 1 — this is what keeps edge
   * costs positive, and therefore what keeps the search correct.
   */
  slopeFloor?: number;
  /** Optional, for ETA only: metres per second per terrain class. */
  speedMps?: Record<number, number>;
}

export const DEFAULT_SLOPE_FLOOR = 0.1;

/**
 * Presets, chosen to be reasonable and obvious to override — not authoritative.
 * The dataset carries no mobility table, so these are the package's opinion
 * until an enrollment supplies its own.
 */
export const FOOT: VehicleProfile = {
  id: "foot",
  label: "Dismounted",
  kVehicle: 3.5,
  terrain: { [TERRAIN_OPEN]: 1, [TERRAIN_ROAD]: 0.8 },
  speedMps: { [TERRAIN_OPEN]: 1.1, [TERRAIN_ROAD]: 1.4 },
};

export const WHEELED: VehicleProfile = {
  id: "wheeled",
  label: "Wheeled",
  kVehicle: 2,
  terrain: { [TERRAIN_OPEN]: 2.5, [TERRAIN_ROAD]: 1 },
  maxSlope: 0.25,
  speedMps: { [TERRAIN_OPEN]: 4, [TERRAIN_ROAD]: 14 },
};

export const TRACKED: VehicleProfile = {
  id: "tracked",
  label: "Tracked",
  kVehicle: 1.2,
  terrain: { [TERRAIN_OPEN]: 1.3, [TERRAIN_ROAD]: 1 },
  maxSlope: 0.35,
  speedMps: { [TERRAIN_OPEN]: 6, [TERRAIN_ROAD]: 11 },
};

export const DEFAULT_PROFILE = TRACKED;

/**
 * A profile flattened into the numbers the inner loop needs.
 *
 * Built once per route. Terrain multipliers become a small dense array so the
 * hot path indexes rather than doing a property lookup on a Record with number
 * keys (which is a string conversion every time).
 */
export interface CompiledProfile {
  readonly id: string;
  readonly kVehicle: number;
  readonly slopeFloor: number;
  readonly maxSlope: number;
  readonly terrainMultipliers: Float64Array;
  readonly defaultMultiplier: number;
  readonly speeds: Float64Array | null;
  readonly defaultSpeed: number;
  /**
   * Cheapest achievable cost per metre. The A* heuristic multiplies raw
   * great-circle distance by this, which keeps it an underestimate and
   * therefore keeps the result optimal.
   */
  readonly minCostPerMetre: number;
}

const MAX_TERRAIN_CLASS = 16;

export function compileProfile(
  profile: VehicleProfile,
  dataMaxSlope: number,
): CompiledProfile {
  const slopeFloor = profile.slopeFloor ?? DEFAULT_SLOPE_FLOOR;
  const defaultMultiplier = profile.defaultTerrainMultiplier ?? 1;

  const terrainMultipliers = new Float64Array(MAX_TERRAIN_CLASS).fill(
    defaultMultiplier,
  );
  let minMultiplier = defaultMultiplier;
  for (const [cls, multiplier] of Object.entries(profile.terrain)) {
    const index = Number(cls);
    if (!Number.isInteger(index) || index < 0 || index >= MAX_TERRAIN_CLASS) {
      continue;
    }
    terrainMultipliers[index] = multiplier;
    minMultiplier = Math.min(minMultiplier, multiplier);
  }

  let speeds: Float64Array | null = null;
  let defaultSpeed = 0;
  if (profile.speedMps) {
    speeds = new Float64Array(MAX_TERRAIN_CLASS);
    const values = Object.entries(profile.speedMps);
    defaultSpeed =
      values.reduce((sum, [, v]) => sum + v, 0) / Math.max(1, values.length);
    speeds.fill(defaultSpeed);
    for (const [cls, speed] of values) {
      const index = Number(cls);
      if (!Number.isInteger(index) || index < 0 || index >= MAX_TERRAIN_CLASS) {
        continue;
      }
      speeds[index] = speed;
    }
  }

  // The profile may be stricter than the data, never looser: edges above the
  // cell's max_slope were never written.
  const maxSlope = Math.min(profile.maxSlope ?? dataMaxSlope, dataMaxSlope);

  // Steepest downhill is the cheapest the slope factor can ever be, floored.
  const minSlopeFactor = Math.max(
    slopeFloor,
    1 - profile.kVehicle * Math.abs(maxSlope),
  );

  return {
    id: profile.id,
    kVehicle: profile.kVehicle,
    slopeFloor,
    maxSlope,
    terrainMultipliers,
    defaultMultiplier,
    speeds,
    defaultSpeed,
    minCostPerMetre: Math.max(1e-6, minMultiplier * minSlopeFactor),
  };
}

/**
 * Cost of traversing one edge, in metre-equivalents.
 *
 * Returns Infinity for an edge the profile refuses, which the search reads as
 * "no such edge" — cheaper than a second predicate call per neighbour.
 */
export function edgeCost(
  profile: CompiledProfile,
  distM: number,
  slope: number,
  terrain: number,
): number {
  if (Math.abs(slope) > profile.maxSlope) {return Infinity;}
  const multiplier =
    terrain < MAX_TERRAIN_CLASS
      ? profile.terrainMultipliers[terrain]
      : profile.defaultMultiplier;
  const slopeFactor = Math.max(
    profile.slopeFloor,
    1 + profile.kVehicle * slope,
  );
  return distM * slopeFactor * multiplier;
}

/** Seconds to traverse an edge, or 0 when the profile declares no speeds. */
export function edgeSeconds(
  profile: CompiledProfile,
  distM: number,
  slope: number,
  terrain: number,
): number {
  if (!profile.speeds) {return 0;}
  const speed =
    terrain < MAX_TERRAIN_CLASS ? profile.speeds[terrain] : profile.defaultSpeed;
  if (!(speed > 0)) {return 0;}
  // Slope slows a vehicle by the same factor it costs it — crude, but it keeps
  // ETA consistent with the routing decision rather than contradicting it.
  const slopeFactor = Math.max(
    profile.slopeFloor,
    1 + profile.kVehicle * slope,
  );
  return (distM * slopeFactor) / speed;
}
