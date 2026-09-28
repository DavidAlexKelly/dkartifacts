/**
 * Surface colours for anything this package draws over the map.
 *
 * A separate module rather than a constant in DechoBasemap.tsx: a file
 * exporting both components and an object breaks React Fast Refresh, and the lint rule that catches it is right
 * to. Hosts import DEFAULT_SURFACE_THEME, spread it, and override the two or
 * three values their design system cares about.
 *
 * THE PALETTE IS SHARED WITH THE MIL MENUS
 * ----------------------------------------
 * Same hues as the harness app's DEFAULT_MENU_THEME (src/mil/theme.ts), so a
 * map showing this toolbar and the unit menus looks like one product rather than two libraries
 * that happen to be on screen together. The background is translucent here
 * because this floats over the map rather than over a click: a solid slab
 * hides exactly the terrain you are drawing on.
 */

import type { CSSProperties } from "react";

export interface SurfaceTheme {
  /** Panel fill. Translucent on purpose — see above. */
  background: string;
  border: string;
  text: string;
  /** Secondary text: hints, counts, keyboard help. */
  muted: string;
  /** Selected tool. Lighter than the mil map's green so it reads on dark. */
  accent: string;
  /** Fill behind the selected tool. */
  accentBackground: string;
  /**
   * CSS `backdrop-filter`. Empty string disables it.
   *
   * Without the blur, a translucent panel over a busy vector map is unreadable
   * — labels and roads show through the text. With it, the panel reads as
   * frosted glass and the map still shows through. Unsupported browsers get a
   * plain translucent panel, which is the same thing minus the polish.
   */
  blur: string;
}

export const DEFAULT_SURFACE_THEME: SurfaceTheme = {
  background: "rgba(17, 19, 24, 0.78)",
  border: "rgba(255, 255, 255, 0.14)",
  text: "#e8ecf4",
  muted: "#8b93a7",
  accent: "#7fb08c",
  accentBackground: "rgba(127, 176, 140, 0.18)",
  blur: "blur(6px)",
};

/**
 * The toolbar's own surface, and its buttons.
 *
 * Style functions rather than components, and in this module rather than
 * beside the components that use them, so that both the built-in toolbar and a
 * host adding a button to the end of it are laying out the same 28-pixel
 * square. A control that is two pixels off, or a shade lighter, reads as
 * bolted on — which is exactly what an extension's control must not look like.
 */
export function toolbarSurface(theme: SurfaceTheme): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: 4,
    background: theme.background,
    backdropFilter: theme.blur || undefined,
    WebkitBackdropFilter: theme.blur || undefined,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
    color: theme.text,
  };
}

export function toolbarButton(
  theme: SurfaceTheme,
  state: { active?: boolean; disabled?: boolean } = {},
): CSSProperties {
  const { active = false, disabled = false } = state;
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    padding: 0,
    cursor: disabled ? "default" : "pointer",
    border: `1px solid ${active ? theme.accent : "transparent"}`,
    borderRadius: 6,
    background: active ? theme.accentBackground : "transparent",
    // The icons stroke with currentColor, so the state lives here and nowhere
    // else — no second icon for the active look.
    color: active ? theme.accent : theme.text,
    opacity: disabled ? 0.35 : 1,
  };
}

export function toolbarSeparator(theme: SurfaceTheme): CSSProperties {
  return { width: 1, background: theme.border, alignSelf: "stretch" };
}
