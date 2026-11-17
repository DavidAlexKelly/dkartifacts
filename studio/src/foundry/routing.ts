/**
 * Terrain-aware routing, through the repo's own @acc/decho-pathfinding: the
 * tiled pathfinding graphs in Foundry, read with @acc/decho-foundry-bytes
 * (configured here with the studio's Foundry token).
 *
 * The graph dataset defaults to the one the package ships with
 * (PATHFINDING_STORE) and can be set in .env (VITE_PATHFINDING_DATASET) or in
 * the route panel.
 */
import { createPlatformClient } from "@osdk/client";
import { configureFoundryBytes } from "@acc/decho-foundry-bytes";
import { createPathfinder, FOOT, PATHFINDING_STORE, TRACKED, WHEELED, type Pathfinder, type RouteResult } from "@acc/decho-pathfinding";
import type { FoundryConfig } from "./auth";

export const PROFILES = { tracked: TRACKED, wheeled: WHEELED, foot: FOOT } as const;
export type ProfileName = keyof typeof PROFILES;

export const defaultGraphDataset: string =
  (import.meta.env.VITE_PATHFINDING_DATASET as string | undefined) || PATHFINDING_STORE.datasetRid;

let configured = false;
const pathfinders = new Map<string, Pathfinder>();

function pathfinder(foundry: FoundryConfig, datasetRid: string, profile: ProfileName): Pathfinder {
  if (!configured) {
    const origin = new URL(foundry.foundryUrl).origin;
    configureFoundryBytes({ foundryUrl: origin, getToken: foundry.getToken, platformClient: createPlatformClient(origin, foundry.getToken) });
    configured = true;
  }
  const key = `${datasetRid}|${profile}`;
  let p = pathfinders.get(key);
  if (!p) {
    p = createPathfinder({ profile: PROFILES[profile], store: { ...PATHFINDING_STORE, datasetRid } });
    pathfinders.set(key, p);
  }
  return p;
}

export async function routeBetween(
  foundry: FoundryConfig,
  datasetRid: string,
  profile: ProfileName,
  from: [number, number],
  to: [number, number],
): Promise<RouteResult> {
  return pathfinder(foundry, datasetRid, profile).route({ lat: from[1], lon: from[0] }, { lat: to[1], lon: to[0] });
}

export type { RouteResult };
