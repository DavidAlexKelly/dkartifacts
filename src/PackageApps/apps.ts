/**
 * The example apps, one per package in packages/.
 *
 * Single source of truth: the router builds routes from this, and the header's
 * switcher builds its dropdown from it. Adding a package means adding a page
 * and one entry here — nothing else knows the list.
 */

export interface ExampleApp {
  path: string;
  /** What the example is called in the switcher. */
  label: string;
  /** The package it exercises, shown next to the label. */
  packageName: string;
  /** One line on what the example actually demonstrates. */
  blurb: string;
}

export const EXAMPLE_APPS: ExampleApp[] = [
  {
    path: "/",
    label: "Basemap",
    packageName: "@acc/decho-basemap",
    blurb:
      "A MapLibre vector basemap served entirely from Foundry datasets — tiles, glyphs and sprites, no external network calls. Globe projection and drawing tools enabled, ground textures printed over the archive's own landuse polygons, and a 3D buildings toggle that extrudes its building layer.",
  },
  {
    path: "/symbols",
    label: "Symbol catalog",
    packageName: "@acc/app6d",
    blurb:
      "Every built-in APP-6D tactical graphic, rendered from the parametric engine through the package's published subpaths.",
  },
  {
    path: "/mil",
    label: "Military map",
    packageName: "@acc/app6d",
    blurb:
      "This application's own planning workflow over the basemap: right-click to place a unit, right-click a unit to order it, then click the objective. The graphics come from @acc/app6d/orders; the workflow is app code, not a library.",
  },
  {
    path: "/elevation",
    label: "Elevation",
    packageName: "@acc/decho-elevation",
    blurb:
      "The basemap with an add-on: DEM cells from Foundry decoded in the browser into 3D terrain, hillshade, hypsometric tint and slope bands, plus labelled contours traced per cell — and the raster contours the same DEM can draw without them. Click two points for the section between them and whether one can see the other.",
  },
  {
    path: "/events",
    label: "Event monitor",
    packageName: "basemap + elevation",
    blurb:
      "The events side of a world-monitor dashboard, on the Foundry basemap and DEM: mock incidents on a globe that group into clusters when zoomed out and split apart as you zoom in. Click a cluster to expand it, click an event for its details and the ground elevation under it, and filter by category, severity and time window.",
  },
  {
    path: "/symbol-picker",
    label: "Unit symbol picker",
    packageName: "@acc/unit-symbol-picker",
    blurb:
      "A SIDC three ways — the twenty-digit code, the legacy fifteen-character form, and a dropdown per position — all views of one value, rendered through milsymbol and driven by the published symbology tables.",
  },
  {
    path: "/demo",
    label: "Everything at once",
    packageName: "all four packages",
    blurb:
      "One map carrying every package: the Foundry basemap with its own buildings extruded, terrain and hillshade from DEM chunks, APP-6D graphics as an extension, and the symbol picker choosing what gets placed. Place a unit, give it an order, and the DEM says whether it can see the objective.",
  },
  {
    path: "/styling",
    label: "Design system",
    packageName: "@acc/decho-styling",
    blurb:
      "The shared look, on one page: tokens, tags, buttons, cards and panels, with the class-based delivery rendered beside the component one so a drift between the two is visible rather than theoretical. Scroll to the bottom for an accent override scoped to a subtree.",
  },
  {
    path: "/components",
    label: "Component library",
    packageName: "@acc/decho-components",
    blurb:
      "Every component in the library, live, in one grid: cards, tags, tiles, tables, charts, overlays and the application shell. The grid is the package's own <ComponentShowcase />, so it cannot fall behind the library — a test compares its specimen list against the package's exports. Switch theme and mode at the top to see all of it re-render.",
  },
  {
    path: "/components/advanced",
    label: "Component library — advanced",
    packageName: "@acc/decho-components",
    blurb:
      "The heavyweight half of the library: a virtualised table over 800 rows, a pivot with totals taken from the raw values, a treegrid, a Kanban board that moves with the keyboard, a Gantt, a calendar and a file drop. Each carries a tested pure module — a virtualiser, a pivot engine, a tree, a date scale — and none of them adds a dependency.",
  },
  {
    // Not an example of a package — the guide to consuming all of them. It
    // lives in this list because the switcher is the only navigation the shell
    // has, and a page nobody can reach is a page nobody reads.
    path: "/install",
    label: "Install & use",
    packageName: "every package",
    blurb:
      "Getting these packages into another repository: which Artifacts repository holds what, the install command for a Code Workspace as well as a laptop, the platform access each one needs, and the smallest honest example of using it. Versions and peers are read from the manifests, so they cannot go stale.",
  },
  {
    path: "/route",
    label: "Terrain routing",
    packageName: "@acc/decho-pathfinding",
    blurb:
      "Click a start and an objective: the route is found over the tiled pathfinding graphs in Foundry, cells loaded and stitched as the search reaches them. Switch mobility profile to see the same pair routed differently.",
  },
];

export function appForPath(pathname: string): ExampleApp | undefined {
  // Exact match only. The switcher's job is to say which example you are
  // looking at, and a prefix match would claim /auth/callback is the basemap.
  return EXAMPLE_APPS.find((app) => app.path === pathname);
}
