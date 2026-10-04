import { describe, expect, it } from "vitest";
import { DEFAULT_SURFACE_THEME } from "@acc/decho-basemap/react";
import { tokensFor } from "@acc/decho-styling";

import { mapPanel, mapPanelVariables, panelRadius, panelVar, surface } from "@/components/mapPanel";
import { DEFAULT_APPEARANCE, EVENT_THEMES, themeFrom } from "./appearance";
import { THEME_LABELS, lookFor } from "./theme";

describe("the panel variables", () => {
  it("fall back to the colours the panels always had", () => {
    expect(surface.text).toBe(`var(--map-panel-text, ${DEFAULT_SURFACE_THEME.text})`);
    expect(surface.accentBackground).toBe(
      `var(--map-panel-accent-background, ${DEFAULT_SURFACE_THEME.accentBackground})`,
    );
    expect(mapPanel.font).toBe("12px/1.6 var(--map-panel-font, sans-serif)");
    expect(mapPanel.textShadow).toBe("var(--map-panel-glow, none)");
    expect(panelRadius(6)).toBe("calc(6px * var(--map-panel-round, 1))");
  });

  it("carry a decho-styling theme onto an element", () => {
    const crt = tokensFor("crt");
    const style = mapPanelVariables(crt, { glow: "0 0 4px green" }) as Record<string, string>;
    expect(style["--map-panel-text"]).toBe(crt.color.text);
    expect(style["--map-panel-background"]).toBe(crt.color.surfaceOverlay);
    expect(style["--map-panel-font"]).toBe(crt.fontFamily.sans);
    expect(style["--map-panel-glow"]).toBe("0 0 4px green");
    // crt's large radius is 2px; the panels are drawn at 8px.
    expect(style["--map-panel-round"]).toBe("0.25");
    // Every variable it sets is one the panels read.
    const read = new Set(Object.values(panelVar).map((v) => /var\((--[a-z-]+),/.exec(v)?.[1]));
    for (const name of Object.keys(style)) {
      expect(read, name).toContain(name);
    }
  });
});

describe("the event monitor's themes", () => {
  it("leave the standard look alone", () => {
    const look = lookFor("standard");
    expect(look.mapStyle).toBeNull();
    expect(look.panels).toEqual({});
    expect(look.scanlines).toBe(false);
    expect(DEFAULT_APPEARANCE.theme).toBe("standard");
  });

  it("put the whole page in crt", () => {
    const look = lookFor("crt");
    expect(look.mapStyle).toBe("crt");
    expect((look.panels as Record<string, string>)["--map-panel-accent"]).toBe(
      tokensFor("crt").color.accentOverMap,
    );
    expect(look.scanlines).toBe(true);
  });

  it("have a label each, and read from a variable in any case", () => {
    for (const theme of EVENT_THEMES) {
      expect(THEME_LABELS[theme]).toBeTruthy();
    }
    expect(themeFrom(" CRT ")).toEqual({ ok: true, value: "crt" });
    expect(themeFrom("")).toEqual({ ok: true, value: null });
    expect(themeFrom("green").ok).toBe(false);
  });
});
