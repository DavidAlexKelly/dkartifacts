/**
 * What each of the event monitor's themes changes, in one place.
 *
 * The pieces come from where they live: the map from decho-basemap's named
 * styles, the panels from a decho-styling theme (through mapPanelVariables,
 * so every panel on the page follows without being told), and the scanlines
 * from this app, because a screen effect is an app's choice and not a
 * package's.
 */

import type { CSSProperties } from "react";
import type { MapStyleName } from "@acc/decho-basemap/react";
import type { HillshadeOptions } from "@acc/decho-elevation/extension";
import { tokensFor } from "@acc/decho-styling";
import { mapPanelVariables } from "@/components/mapPanel";
import type { EventTheme } from "./appearance";

export interface ThemeLook {
  /** A named map style, or null to keep the sprite-set variable's choice. */
  mapStyle: MapStyleName | null;
  /** Custom properties for the page's root: the panels' colours and type. */
  panels: CSSProperties;
  /** Behind the map, where a globe or tilted terrain shows past the edge. */
  pageBackground: string;
  hillshade: true | HillshadeOptions;
  /** MapLibre sky over the terrain; true for the elevation package's own. */
  sky: true | Record<string, unknown>;
  /** Scanlines and a vignette over the whole page. */
  scanlines: boolean;
}

const crt = tokensFor("crt");

const LOOKS: Record<EventTheme, ThemeLook> = {
  standard: {
    mapStyle: null,
    panels: {},
    pageBackground: "transparent",
    hillshade: true,
    sky: true,
    scanlines: false,
  },
  crt: {
    mapStyle: "crt",
    panels: mapPanelVariables(crt, {
      // Text on a phosphor screen bleeds a little light round itself.
      glow: "0 0 4px rgba(51, 255, 102, 0.45)",
    }),
    pageBackground: crt.color.bg,
    // Relief in the phosphor too: dark slopes, faintly lit ridges. A grey
    // hillshade would put the only non-green on the map under the labels.
    hillshade: {
      shadowColour: "#000000",
      highlightColour: "#1f8a40",
      accentColour: "#0b3318",
      exaggeration: 0.3,
    },
    sky: {
      "sky-color": "#000000",
      "horizon-color": "#0b3318",
      "fog-color": crt.color.bg,
      "sky-horizon-blend": 0.5,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.2,
    },
    scanlines: true,
  },
};

export function lookFor(theme: EventTheme): ThemeLook {
  return LOOKS[theme];
}

/** What the settings' theme switch calls each. */
export const THEME_LABELS: Record<EventTheme, string> = {
  standard: "Standard",
  crt: "CRT",
};
