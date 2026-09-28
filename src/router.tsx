import { createBrowserRouter } from "react-router-dom";
import AuthCallback from "@/AuthCallback";
import AppShell from "@/components/AppShell";
import MapPage from "@/PackageApps/dechoBasemap/MapPage";
import SymbolsPage from "@/PackageApps/tacticalGraphics/SymbolsPage";
import MilMapPage from "@/mil/MilMapPage";
import ElevationPage from "@/PackageApps/dechoElevation/ElevationPage";
import CompositeDemoPage from "@/demo/CompositeDemoPage";
import EventsPage from "@/demo/events/EventsPage";
import UnitSymbolPickerPage from "@/PackageApps/unitSymbolPicker/UnitSymbolPickerPage";
import RoutePage from "@/PackageApps/dechoPathfinding/RoutePage";
import StylingPage from "@/PackageApps/dechoStyling/StylingPage";
import ComponentsPage from "@/PackageApps/dechoComponents/ComponentsPage";
import AdvancedComponentsPage from "@/PackageApps/dechoComponents/AdvancedComponentsPage";
import InstallPage from "@/install/InstallPage";
// One example app per package in packages/: each is that library's live
// harness, and the only consumer this repo has. Keep them stock — a harness
// that grows conveniences is one the library quietly starts depending on.
//
// The paths live in PackageApps/apps.ts, which the header's switcher reads
// too; the two would otherwise drift the first time a route was renamed.
export const router = createBrowserRouter(
  [
    {
      // Layout route: the header and the full-height content pane are shared,
      // so no page has to arrange its own full-bleed layout.
      element: <AppShell />,
      children: [
        {
          // @acc/decho-basemap — the offline Foundry basemap.
          path: "/",
          element: <MapPage />,
        },
        {
          // @acc/app6d — the built-in APP-6D catalog.
          path: "/symbols",
          element: <SymbolsPage />,
        },
        {
          // The app's own military planning workflow, over the basemap.
          path: "/mil",
          element: <MilMapPage />,
        },
        {
          // @acc/decho-elevation — the basemap plus the elevation extension,
          // added from outside it.
          path: "/elevation",
          element: <ElevationPage />,
        },
        {
          // Every package at once — the composition the extension contract
          // exists for.
          path: "/demo",
          element: <CompositeDemoPage />,
        },
        {
          // A world-monitor style event map: mock data, clustered, over the
          // basemap and elevation extensions.
          path: "/events",
          element: <EventsPage />,
        },
        {
          // @acc/unit-symbol-picker — a SIDC, three ways.
          path: "/symbol-picker",
          element: <UnitSymbolPickerPage />,
        },
        {
          // @acc/decho-pathfinding — routing over the tiled graphs, attached
          // to a stock basemap from outside it.
          path: "/route",
          element: <RoutePage />,        },
        {
          // @acc/decho-styling — the design system's own catalogue: both
          // deliveries side by side, which is the only way to see them drift.
          path: "/styling",
          element: <StylingPage />,
        },
        {
          // @acc/decho-components — the inventory: every component in the
          // library, live, in whichever theme and mode is picked. The grid is
          // the library's own <ComponentShowcase />, so it cannot fall behind
          // the package the way an app-maintained gallery would.
          path: "/components",
          element: <ComponentsPage />,
        },
        {
          // The same showcase, narrowed to the heavyweight shelves. A second
          // page rather than three more sections, because these specimens
          // render 800 table rows, a pivot and a month grid between them.
          path: "/components/advanced",
          element: <AdvancedComponentsPage />,
        },
        {
          // Not a package's harness: how to consume any of them elsewhere.
          // Reads the manifests in packages/, so the versions it quotes are
          // the versions this repo would publish.
          path: "/install",
          element: <InstallPage />,
        },
      ],
    },
    {
      // The route defined in the application's redirect URL. Deliberately
      // outside the shell: it renders for a moment mid-sign-in, and a header
      // offering navigation there is at best noise.
      path: "/auth/callback",
      element: <AuthCallback />,
    },
  ],
  { basename: import.meta.env.BASE_URL },
);
