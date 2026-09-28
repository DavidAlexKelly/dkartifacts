/**
 * Binds this application's credentials to @acc/decho-basemap.
 *
 * The library deliberately knows nothing about how an app authenticates — that
 * is what makes it publishable — so every consumer does this once at startup.
 * Everything is read lazily, so this only has to run before the first map
 * mounts, not before the library is imported.
 */

import { configureBasemap } from "@acc/decho-basemap";
import { auth, client, foundryUrl } from "@/client";

let done = false;

export function setupBasemap(): void {
  if (done) {return;}
  done = true;

  configureBasemap({
    foundryUrl,
    // createPublicOauthClient returns a callable that resolves to a token.
    getToken: () => auth(),
    // The template's `client` is already a PlatformClient, which is what the
    // library needs for dataset branch lookups and media set path resolution.
    platformClient: client,
  });
}
