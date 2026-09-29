/**
 * Runtime configuration.
 *
 * WHY THIS EXISTS
 * ---------------
 * This layer used to import `auth`, `foundryUrl` and `platformClient` directly
 * from the host application's `@/client` singleton. That is the one thing a
 * library cannot do: it hard-wires the code to one app's OAuth setup, one
 * enrollment and one module graph.
 *
 * Inverting it costs a single call at startup and buys portability — any app
 * (OSDK React app, Workshop widget, another repo entirely) can supply its own
 * credentials without this package knowing anything about them.
 *
 *   import { configureFoundryBytes } from "@acc/decho-foundry-bytes";
 *   import { auth, foundryUrl, platformClient } from "./client";
 *
 *   configureFoundryBytes({ foundryUrl, getToken: auth, platformClient });
 *
 * @acc/decho-basemap re-exports this as `configureBasemap`, which is what it
 * was called before this layer was extracted. ONE call configures every package
 * built on it — basemap tiles, pathfinding chunks, anything added later.
 *
 * Everything is read lazily through access()/foundryOrigin(), so configuration
 * only has to happen before the first byte is fetched — not before this module
 * is imported.
 */

import type { PlatformClient } from "@osdk/client";

import { FoundryNotConfiguredError } from "./errors.js";

export interface FoundryAccess {
  /** Foundry host, e.g. "https://acme.palantirfoundry.com". */
  foundryUrl: string;
  /**
   * Returns a current access token. An `@osdk/oauth` PublicOauthClient
   * satisfies this directly — it is callable and returns Promise<string>.
   */
  getToken: () => Promise<string>;
  /** Used for dataset branch lookups and media set path resolution. */
  platformClient: PlatformClient;
  /**
   * Classify a path as a large transfer, for lane scheduling.
   *
   * Defaults to `isLargeFilePath` — see lanes.ts for why there are two lanes at
   * all. Worth overriding when an application's large files are named something
   * this package would not guess: a misclassified file still transfers
   * correctly, it just queues in the wrong place.
   */
  isLargeFile?: (filePath: string) => boolean;
}

let _access: FoundryAccess | null = null;
let _origin: string | null = null;

export function configureFoundryBytes(access: FoundryAccess): void {
  _access = access;
  // Parsed once, here, so a malformed host fails at configuration time rather
  // than on the first read.
  _origin = new URL(access.foundryUrl).origin;
}

export function isConfigured(): boolean {
  return _access !== null;
}

export function access(): FoundryAccess {
  if (!_access) {
    throw new FoundryNotConfiguredError(
      "@acc/decho-foundry-bytes is not configured. Call " +
        "configureFoundryBytes({ foundryUrl, getToken, platformClient }) once at " +
        "application startup, before anything reads. (@acc/decho-basemap " +
        "exports the same call as configureBasemap.)",
    );
  }
  return _access;
}

/**
 * The single origin this package is ever allowed to talk to.
 *
 * RIDs and file paths reach this layer from configuration, tile coordinates,
 * cell keys and font stack names, so they are untrusted by construction.
 * Pinning the origin means no combination of inputs can redirect a read off the
 * Foundry host, which keeps "no external network calls" a structural property
 * rather than something to re-audit at every call site.
 */
export function foundryOrigin(): string {
  if (!_origin) {
    throw new FoundryNotConfiguredError(
      "@acc/decho-foundry-bytes is not configured. Call " +
        "configureFoundryBytes(...) before fetching.",
    );
  }
  return _origin;
}
