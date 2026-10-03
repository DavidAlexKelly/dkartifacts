/**
 * What a consuming repository has to do, per package.
 *
 * The facts that go stale — version, peer dependencies, published subpaths,
 * which Artifacts repository it lands in — are read from each package's own
 * `package.json` rather than retyped here. A published version in a hand-
 * written install guide is wrong within a week, and wrong in the most
 * expensive way: it is the one number a reader copies without checking.
 *
 * What is written by hand is the part a machine cannot derive: the smallest
 * honest example of using the thing, and the platform access it needs before
 * that example does anything. Those come from each package's README, so there
 * is one place they can disagree — and the harness on the other pages is the
 * check, because it imports the same specifiers a consumer will.
 */
/*
 * The screenshots are imported rather than written as paths into `public/`.
 *
 * They were in `public/` first, and the URLs were built as
 * `${import.meta.env.BASE_URL}install/<file>`. That is wrong here, and wrong
 * invisibly: in a Code Workspace `DEV_SERVER_BASE_PATH` has no trailing slash,
 * so `BASE_URL` is ".../port8082" and the concatenation produced
 * ".../port8082install/…" — a 404, on a page whose entire job is to be
 * followed step by step.
 *
 * Importing them hands the problem to the bundler, which knows the base in
 * every environment, fingerprints the file for caching, and — the part that
 * matters most — fails the BUILD if one is renamed or deleted, instead of
 * shipping a page of alt text.
 */
import step1 from "./screenshots/install-1-libraries-search.png";
import step2 from "./screenshots/install-2-add-package.png";
import step3 from "./screenshots/install-3-reorder-libraries.png";
import step4 from "./screenshots/install-4-npm-install.png";
import app6d from "../../packages/app6d/package.json";
import basemap from "../../packages/decho-basemap/package.json";
import elevation from "../../packages/decho-elevation/package.json";
import countriesPackage from "../../packages/decho-countries/package.json";
import bytes from "../../packages/decho-foundry-bytes/package.json";
import pathfinding from "../../packages/decho-pathfinding/package.json";
import components from "../../packages/decho-components/package.json";
import styling from "../../packages/decho-styling/package.json";
import symbolPicker from "../../packages/unit-symbol-picker/package.json";

/** The minimum shape this module reads out of a package manifest. */
interface Manifest {
  name: string;
  version: string;
  description?: string;
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
  publishConfig?: { registry?: string };
}

export interface UsageStep {
  title: string;
  note: string;
  code: string;
}

export interface FlowStep {
  title: string;
  note: string;
  /**
   * A screenshot, shown under the note. `src` is a URL produced by the
   * bundler, not a path written by hand — see the imports at the top of this
   * file for why.
   */
  image?: { src: string; alt: string };
  code?: string;
}

export interface PackageGuide {
  /** The specifier a consumer types, and the key for this guide. */
  name: string;
  version: string;
  /** One line, from the manifest. */
  summary: string;
  /** The Artifacts repository that hosts it. */
  registryRid: string;
  /** Peers npm will not install for them. */
  peers: string[];
  /** Published subpaths, `.` shown as the package name itself. */
  subpaths: string[];
  /**
   * Platform access the package needs at runtime, beyond installing it. Null
   * for the packages that touch no platform API — worth stating rather than
   * omitting, because "does this need Developer Console setup?" is the
   * question being asked.
   */
  platform: string | null;
  usage: UsageStep[];
  /** The page in this app that exercises it. */
  examplePath?: string;
}

/**
 * The RID out of a publish URL.
 *
 * Parsed rather than listed: `publishConfig.registry` is the value that
 * actually decides where a version lands, so reading it is the only way this
 * page cannot be quietly wrong about where to install from.
 */
function registryRidOf(manifest: Manifest): string {
  const url = manifest.publishConfig?.registry ?? "";
  return /ri\.artifacts\.main\.repository\.[0-9a-f-]+/.exec(url)?.[0] ?? "(unpublished)";
}

function subpathsOf(manifest: Manifest): string[] {
  return Object.keys(manifest.exports ?? {}).map((key) =>
    key === "." ? manifest.name : `${manifest.name}${key.slice(1)}`,
  );
}

function base(manifest: Manifest): Omit<PackageGuide, "platform" | "usage"> {
  return {
    name: manifest.name,
    version: manifest.version,
    summary: manifest.description ?? "",
    registryRid: registryRidOf(manifest),
    peers: Object.keys(manifest.peerDependencies ?? {}),
    subpaths: subpathsOf(manifest),
  };
}

/** The configure call three packages share, written once. */
const CONFIGURE_BYTES = [
  "// once, at application startup",
  'import { configureFoundryBytes } from "@acc/decho-foundry-bytes";',
  'import { auth, foundryUrl, platformClient } from "@/client";',
  "",
  "configureFoundryBytes({ foundryUrl, getToken: auth, platformClient });",
].join("\n");

export const PACKAGE_GUIDES: PackageGuide[] = [
  {
    ...base(styling),
    platform: null,
    examplePath: "/styling",
    usage: [
      {
        title: "Choose a theme once, at your root",
        note: "Seven themes: classic (flat military green), modern (indigo glass), daylight (light), command (amber on near-black), accenture-light, accenture-dark and accenture-sap (Accenture purple on white, the SAP migration estate's look). Nothing switches theme on its own — no component, hook or stylesheet — so this is the only place it is decided. A theme travels as values \u2014 handed to a DechoSurface, which writes them as custom properties \u2014 or as the class name on your root element.",
        code: [
          'import { tokensFor } from "@acc/decho-styling";',
          'import { DechoSurface } from "@acc/decho-components";',
          "",
          '<DechoSurface tokens={tokensFor("accenture-sap")} filled>',
          "  {/* everything below is themed, classes and components alike */}",
          "</DechoSurface>;",
        ].join("\n"),
      },
      {
        title: "Or just the tokens",
        note: "The same values behind both deliveries, for elements you already have — and for anything that cannot read a CSS variable at all, which is every map, canvas and milsymbol layer.",
        code: [
          'import { tokensFor, chartSeries } from "@acc/decho-styling";',
          "",
          'const t = tokensFor("modern");',
          "t.color.accent;   // the theme's primary",
          "t.radius.lg;",
          "chartSeries(0);   // first series colour",
        ].join("\n"),
      },
      {
        title: "Generate the stylesheet, never paste it",
        note: "If a repo needs the variables as CSS — usually because it re-tints — generate them in a prebuild step. A pasted block of hexes and a withAccent() call in a theme module are exactly the drift this package exists to remove, reintroduced at the consumer.",
        code: [
          '"scripts": {',
          '  "prebuild": "decho css --theme modern --accent \\"#2fbf71\\" --out src/theme.css"',
          "}",
        ].join("\n"),
      },
      {
        title: "Keep raw colours out",
        note: "The package ships an ESLint rule that flags a hex literal in a style, so the next person cannot quietly reintroduce the problem the tokens solve. recommended warns; move to decho.configs.strict once you have been through the existing ones.",
        code: [
          "// eslint.config.mjs",
          'import decho from "@acc/decho-styling/eslint";',
          "",
          "export default [...decho.configs.recommended];",
        ].join("\n"),
      },
    ],
  },
  {
    ...base(components),
    platform: null,
    examplePath: "/components",
    usage: [
      {
        title: "See what is in it, before writing anything",
        note: "The library carries its own gallery: every component, live, in the theme you hand it. Render it on a scratch route for ten seconds and you will not rebuild the progress bar that already exists \u2014 which is what five widget sets in this estate each did. A test in the package compares the gallery against the package's exports, so it cannot fall behind the library.",
        code: [
          'import { ComponentShowcase } from "@acc/decho-components";',
          'import { tokensFor } from "@acc/decho-styling";',
          "",
          '<ComponentShowcase tokens={tokensFor("accenture-sap")} />',
          "",
          "// Or narrowed, when you know roughly what you want:",
          '<ComponentShowcase groups={["Charts"]} query="donut" />',
        ].join("\n"),
      },
      {
        title: "Install it, and that is the installation",
        note: "No stylesheet, no provider, no configuration. Every value is var(--decho-\u2026, <fallback>), so the components are correct on their own and follow @acc/decho-styling's themes when a theme is present. It is not a dependency of this package \u2014 the fallbacks are generated from its tokens.json at build time, and a test fails if they drift.",
        code: [
          'import { MetricTile, ProgressBar, StatusChip } from "@acc/decho-components";',
          "",
          '<MetricTile label="Objects in scope" value={412} />',
          '<ProgressBar value={68} label="Harmonised" emphasis="headline"',
          '             caption="1,284 of 1,888 fields" />',
          '<StatusChip status="atRisk" />',
        ].join("\n"),
      },
      {
        title: "Use the components",
        note: "Styled from var(--decho-\u2026, <fallback>), so no stylesheet has to survive your bundler, your import order or your host's reset. In a Foundry widget this is the path that cannot fail silently — a stylesheet that does not resolve renders your markup unstyled and says nothing.",
        code: [
          'import { Card, Tag, Button, Panel } from "@acc/decho-components";',
          "",
          '<Panel title="Order of battle" actions={<Tag tone="neutral">24</Tag>} scroll>',
          '  <Card title="AV-27 Recovery" meta="Bn · 612 pax" tone="warning" interactive',
          '        actions={<Tag tone="warning">Degraded</Tag>}',
          '        footer={<Button variant="primary" size="sm">Review ›</Button>}>',
          "    Two platoons detached to the crossing.",
          "  </Card>",
          "</Panel>;",
        ].join("\n"),
      },
      {
        title: "Re-tint it to a deployment's colour",
        note: "One accent on the root re-tints everything the accent owns — hovers, focus rings, the selection glow, primary buttons, modern's hairline — and leaves surfaces, text, status colours and geometry alone. A re-tint is a token set rather than a prop, so it is decided once, where the theme is: withAccent() returns the theme with the accent swapped through every token that owns it \u2014 hovers, focus rings, the selection glow, primary buttons, modern's hairline \u2014 and leaves surfaces, text, status colours and geometry alone.",
        code: [
          '<DechoSurface tokens={withAccent("modern", "#2fbf71")} filled>',
          "  <AppShell>{/* inherits the green */}</AppShell>",
          "</DechoSurface>;",
        ].join("\n"),
      },
      {
        title: "Take the whole application frame",
        note: "Header, sidebar, nav, breadcrumb, content and footer, with no layout CSS of your own. Composed rather than configured — there is no sidebar={} prop, so the first app that needs two of them does not have to fork the grid.",
        code: [
          "import {",
          "  AppShell, AppHeader, AppBody, AppSidebar, AppSidebarNav,",
          "  AppContent, AppBreadcrumb, AppFooter,",
          '} from "@acc/decho-components";',
          "",
          '<AppShell tokens={withAccent("modern", "#2fbf71")}>',
          '  <AppHeader brand="Mission Control" />',
          "  <AppBody>",
          "    <AppSidebar>",
          "      <AppSidebarNav items={nav} activeKey={key} onSelect={setKey} />",
          "    </AppSidebar>",
          "    <AppContent header={<AppBreadcrumb items={crumbs} />}>{page}</AppContent>",
          "  </AppBody>",
          "  <AppFooter>v1.4.0</AppFooter>",
          "</AppShell>;",
        ].join("\n"),
      },
      {
        title: "Charts, without a charting dependency",
        note: "SVG, coloured from the theme's ten-colour series. The heatmap uses the fixed RAG scale, which is a separate token group from the six tones — a status is not a tag.",
        code: [
          "import {",
          "  Sparkline, BarChart, DonutChart, ChartLegend, StatusHeatmap,",
          '} from "@acc/decho-components";',
          "",
          "<Sparkline values={trend} area width={240} height={48} />",
          "<BarChart data={workstreams} />",
          "<StatusHeatmap columns={weeks} rows={domains} />",
        ].join("\n"),
      },
      {
        title: "Or CSS classes, if you control the page",
        note: "Better than inline styles when you own the document \u2014 note it needs the variables, which is the one path that does want the tokens stylesheet: one copy of the rules, real :hover, real media queries. Put the theme class on your outermost element — never on :root, because a widget shares its page with its host and everything else on it.",
        code: [
          'import "@acc/decho-styling/tokens.css";',
          'import "@acc/decho-components/styles.css";',
          "",
          '<div className="decho-root decho-modern">',
          '  <article className="decho-card">',
          '    <div className="decho-card__title">CSS card</div>',
          "  </article>",
          '  <button className="decho-button decho-button--primary">Primary</button>',
          "</div>;",
        ].join("\n"),
      },
      {
        title: "The estate's own components, once",
        note: "ProgressBar replaces six hand-written copies across the migration widget sets, StatusChip five, MetricTile five, EmptyState five. Where the copies differed for a reason the reason survives \u2014 ProgressBar keeps inline and headline \u2014 and where they differed by accident they do not.",
        code: [
          "import {",
          "  ProgressBar, StackedBar, MetricTile, KpiTile, StatusChip, StatusDot,",
          "  Legend, Callout, EmptyState, Skeleton, Tooltip, SectionHeader,",
          '} from "@acc/decho-components";',
        ].join("\n"),
      },
      {
        title: "A state is never carried by colour alone",
        note: "StatusChip writes the words, StatusDot puts them in its accessible name, StackedBar labels each band \"Complete: 30 (75%)\", StatusHeatmap puts the state in each cell's name, and anything clickable is a real button with aria-pressed. These are the things the originals got wrong that a screenshot does not show.",
        code: [
          "<StackedBar segments={segments} onSelect={setFilter} legend />",
          "// each band: <button aria-label=\"Complete: 30 (75%)\" aria-pressed=\"\u2026\">",
        ].join("\n"),
      },
    ],
  },
  {
    ...base(bytes),
    platform:
      "Developer Console → your app → Resources must list every dataset or media set you read. The api:use-datasets-read scope on its own returns 403.",
    usage: [
      {
        title: "Configure once, then read",
        note: "The token, the LRU and the Cache Storage keyed by transaction RID are all set up by the one call. Every decho package that reads from Foundry shares it — configure it once per application, not once per package.",
        code: [
          CONFIGURE_BYTES,
          "",
          "// anywhere",
          'import { getFile } from "@acc/decho-foundry-bytes";',
          "",
          'const body = await getFile(datasetRid, "path/inside/dataset.bin");',
        ].join("\n"),
      },
    ],
  },
  {
    ...base(basemap),
    platform:
      "Developer Console → your app → Resources must list the tile and map-assets datasets. Without them the map loads and stays blank, with 403s in the network tab.",
    examplePath: "/",
    usage: [
      {
        title: "Configure, then mount",
        note: "No external network calls: tiles, glyphs and sprites all come from the datasets above, which is what makes it work on an air-gapped deployment.",
        code: [
          "// once, at application startup",
          'import { configureBasemap } from "@acc/decho-basemap";',
          'import { auth, foundryUrl, platformClient } from "@/client";',
          "",
          "configureBasemap({ foundryUrl, getToken: auth, platformClient });",
          "",
          "// anywhere",
          'import { DechoBasemap } from "@acc/decho-basemap/react";',
          "",
          "<DechoBasemap spawnLat={48.8566} spawnLong={2.3522} spawnZoom={12} />;",
        ].join("\n"),
      },
    ],
  },
  {
    ...base(elevation),
    platform:
      "The basemap's two datasets plus the DEM dataset. Forgetting the third is the most common way this package appears broken: the map draws, the terrain never arrives.",
    examplePath: "/elevation",
    usage: [
      {
        title: "An extension, added from outside the basemap",
        note: "The basemap does not know this package exists. Pass the extension and it attaches its own terrain, hillshade and sky — which is the contract that lets both be versioned separately.",
        code: [
          'import { DechoBasemap } from "@acc/decho-basemap/react";',
          'import { elevation } from "@acc/decho-elevation/extension";',
          "",
          "<DechoBasemap",
          "  extensions={[elevation({ terrain: true, hillshade: true, sky: true })]}",
          "  spawnLat={61.5} spawnLong={9} spawnZoom={10}",
          "/>;",
        ].join("\n"),
      },
    ],
  },
  {
    ...base(countriesPackage),
    platform:
      "Nothing, to start: the package carries a low-detail world. For full detail and several border views, build a dataset with the package's scripts/build-data.mjs, upload it, and add it as a Resource on your app in Developer Console — without that the country layer is missing and onError says why, while the map itself is unaffected.",
    examplePath: "/countries",
    usage: [
      {
        title: "An extension, with a card for what is clicked",
        note: "No store means the built-in world. Pass { kind: \"dataset\", datasetRid } for your own; the views and region schemes it carries appear on the controller handed to onReady.",
        code: [
          'import { DechoBasemap } from "@acc/decho-basemap/react";',
          'import { countries } from "@acc/decho-countries/extension";',
          'import { CountryCard } from "@acc/decho-countries/react";',
          "",
          "const [selection, setSelection] = useState(null);",
          "",
          "<DechoBasemap extensions={[countries({ onSelect: setSelection })]} />;",
          "<CountryCard selection={selection} />;",
        ].join("\n"),
      },
      {
        title: "Headless: which country is this point in?",
        note: "Bounding boxes first, so tagging thousands of points is cheap.",
        code: [
          'import { loadCountries } from "@acc/decho-countries";',
          "",
          "const data = await loadCountries();",
          "const index = await data.index();",
          'index.countryAt(2.35, 48.85); // "FRA"',
        ].join("\n"),
      },
    ],
  },
  {
    ...base(pathfinding),
    platform:
      "Developer Console → your app → Resources must list the pathfinding graph dataset. Cells are fetched as the search reaches them, so a missing resource looks like a route that never returns.",
    examplePath: "/route",
    usage: [
      {
        title: "Headless routing, with an optional map layer",
        note: "The same configureFoundryBytes call the basemap needs — not a second one. The router itself needs no map; /map is there when you have one.",
        code: [
          CONFIGURE_BYTES,
          "",
          'import { usePathfinding } from "@acc/decho-pathfinding/react";',
          'import { useRouteLayer } from "@acc/decho-pathfinding/map";',
          "",
          "const { route, result, routing, error } = usePathfinding();",
          "useRouteLayer(map, result?.waypoints ?? null);",
          "",
          "await route({ lat: 48.85, lon: 2.35 }, { lat: 49.1, lon: 2.9 }, { profile: TRACKED });",
        ].join("\n"),
      },
    ],
  },
  {
    ...base(app6d),
    platform: null,
    examplePath: "/symbols",
    usage: [
      {
        title: "Symbols on a MapLibre map",
        note: "One call wires the adapter, the editing handles and the callbacks you persist from. The catalog is a plain immutable value — .extend() returns a new one rather than mutating the built-ins.",
        code: [
          'import { createMaplibreTacticGraphics } from "@acc/app6d/maplibre";',
          'import { APP6D_CATALOG } from "@acc/app6d/symbols";',
          "",
          "const handle = createMaplibreTacticGraphics(APP6D_CATALOG, map, {",
          "  onMoveEnd: (id, end, world) => { /* persist the new [lng, lat] */ },",
          "  onRemove: (id) => { /* drop the order from your state */ },",
          "});",
        ].join("\n"),
      },
      {
        title: "Or nothing but the geometry",
        note: "/engine, /symbols, /adapter and /core have zero runtime dependencies and run anywhere — Node, browser, SSR. Only reach for a peer when you use the subpath that needs it.",
        code: [
          'import { APP6D_CATALOG } from "@acc/app6d/symbols";',
          "",
          "APP6D_CATALOG.list(); // every built-in tactical graphic",
        ].join("\n"),
      },
    ],
  },
  {
    ...base(symbolPicker),
    platform: null,
    examplePath: "/symbol-picker",
    usage: [
      {
        title: "The component",
        note: "Renders through milsymbol and drives itself from the published symbology tables.",
        code: [
          'import { UnitSymbolPicker } from "@acc/unit-symbol-picker/react";',
          "",
          "<UnitSymbolPicker onChange={(sidc, code) => console.log(code)} />;",
        ].join("\n"),
      },
      {
        title: "Or the model on its own",
        note: "Parsing, editing and formatting a SIDC with no React involved — useful server-side, or anywhere you are validating rather than picking.",
        code: [
          'import { parseSidc, withField, formatSidc } from "@acc/unit-symbol-picker";',
          "",
          'const hostile = withField(parseSidc("10-0-3-10-0-0-00-121100-00-00"), "identity", "6");',
          "formatSidc(hostile);",
        ].join("\n"),
      },
    ],
  },
];

export function guideFor(name: string): PackageGuide {
  const found = PACKAGE_GUIDES.find((guide) => guide.name === name);
  // The list is the source of the picker's buttons, so this cannot happen from
  // the UI — it can only happen from a typo in a link, and returning the first
  // guide silently would hide it.
  if (found == null) {
    throw new Error(`No install guide for ${name}`);
  }
  return found;
}

/**
 * Installing, as it is actually done — from the Libraries panel, not by hand.
 *
 * The manual route (add a RID under Settings → Libraries, then override npm's
 * registry from the terminal) is what the Artifacts repository's own
 * instructions describe, and it is the slow way round: the Libraries panel
 * already knows which repositories serve a package and will add them for you.
 * The screenshots are of `@acc/decho-styling` because they were taken while
 * installing it; every step is identical for the other packages except the
 * repository named in step 2.
 */
export function installFlow(guide: PackageGuide): FlowStep[] {
  const short = guide.name.replace("@acc/", "acc/");
  return [
    {
      title: "Find it in the Libraries panel",
      note: `Libraries, in the left-hand rail of the code editor — not Settings. Search for "${short}", then click the version button. "Copy install command" does two things: it puts the command on your clipboard, and it works out which Artifacts repositories serve the package.`,
      image: {
        src: step1,
        alt: "The Libraries panel with acc/decho-sty typed into the search box, one result for @acc/decho-styling tagged NPM and INTERNAL, and a Copy install command tooltip over its Latest button.",
      },
    },
    {
      title: "Add the backing repository when it offers to",
      note: 'A package is only installable if the repositories serving it back this workspace. The dialog lists them — "Decho Styles" for the design system — and "Add package" adds them. Skip this and npm reports a 404, which reads as "no such package" rather than "you have not been given it".',
      image: {
        src: step2,
        alt: "The Add package dependencies dialog, listing Decho Styles as a recommended source for @acc/decho-styling, with Cancel and Add package buttons.",
      },
    },
    {
      title: "Put the external repository last",
      note: "Settings → Libraries → Reorder / Delete, or just the Fix order button in the warning. Backing repositories resolve top to bottom, so while external-npm-npmjs sits above the internal ones, a name that was meant to come from Foundry can quietly resolve from the public registry instead.",
      image: {
        src: step3,
        alt: "Settings → Libraries showing backing Artifacts repositories resolved top to bottom, a warning that external repositories should be resolved last with a Fix order button, and Decho Styles at the end of the list.",
      },
    },
    {
      title: "Install, in the workspace terminal",
      note: "Plain npm — no --registry flags and no FOUNDRY_TOKEN, because the step above configured resolution for the whole workspace. Adding a library and installing it are two separate actions; the panel only does the first.",
      code: `npm install ${guide.name}`,
      image: {
        src: step4,
        alt: "A terminal running npm install @acc/decho-styling, which reports adding 1 package in 4 seconds.",
      },
    },
  ];
}

/**
 * The two Artifacts repositories, and why there are two.
 *
 * A consumer that wants the design system *and* a map package needs both
 * configured, which is the single most surprising thing about installing from
 * this repo — it is the difference between one `npm install` working and the
 * next one 404ing for no visible reason.
 */
export const REGISTRIES: { rid: string; holds: string; why: string }[] = [
  {
    rid: registryRidOf(basemap),
    holds: "the map packages, the byte layer, the symbol packages",
    why: "One Artifacts repository hosts any number of packages, and consumers of the maps already resolve through this one.",
  },
  {
    rid: registryRidOf(styling),
    holds: "@acc/decho-styling and @acc/decho-components",
    why: "Deliberately separate from the map packages: the design system is aimed at widget repositories across the estate. The two share one registry because a scope can only point at one, and tokens plus components is the pair a widget repo installs together.",
  },
];
