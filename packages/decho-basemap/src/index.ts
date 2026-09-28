/**
 * @acc/decho-basemap
 *
 * A MapLibre basemap served entirely from Foundry — no CDN, no external
 * network calls, works under the default Content Security Policy.
 *
 * This entry point is the FRAMEWORK-FREE core. The React surface lives at
 * "@acc/decho-basemap/react" and is deliberately not re-exported here:
 *
 *   - it imports maplibre-gl and its stylesheet, so re-exporting it would pull
 *     ~1 MB into every chunk that touches the byte layer — including ones with
 *     no map at all;
 *   - the whole codebase already takes care to let callers supply their own
 *     maplibregl instance rather than importing it, and a barrel that quietly
 *     imports it would undo that;
 *   - it mirrors the "." / "./react" export map this package will publish
 *     with, so in-repo imports and post-extraction imports look identical.
 *
 *   import { createBasemap } from "@acc/decho-basemap";
 *   import { DechoBasemap }       from "@acc/decho-basemap/react";
 */

export * from "./core";
