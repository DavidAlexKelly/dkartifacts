import { describe, expect, it, vi } from "vitest";

import { ASSET_STORE, PLANET_STORE, THEATRE_STORE } from "../core/defaults.js";
import {
  MAP_STYLES,
  resolveAssetStore,
  resolveTileStore,
  resolveView,
  spritePathForStyle,
} from "./options.js";

describe("resolveTileStore", () => {
  it("defaults to the preset planet store", () => {
    expect(resolveTileStore({})).toEqual(PLANET_STORE);
  });

  it("builds a manifest store from a bare rid", () => {
    expect(resolveTileStore({ rid: "ri.foundry.main.dataset.x" })).toEqual({
      kind: "manifest",
      datasetRid: "ri.foundry.main.dataset.x",
      mediaSetRid: undefined,
    });
  });

  it("prefers an explicit store over the shorthand", () => {
    // `tiles` is strictly more expressive — it is the only way to reach the
    // fixed-grid scheme, which a bare RID cannot describe.
    expect(
      resolveTileStore({ rid: "ri.foundry.main.dataset.x", tiles: THEATRE_STORE }),
    ).toEqual(THEATRE_STORE);
  });
});

describe("resolveView", () => {
  it("composes spawn* over center/zoom rather than replacing them", () => {
    // The point of composing: center={[lon, lat]} spawnZoom={9} should do what
    // it reads as, with no precedence rule to remember.
    expect(resolveView({ center: [10, 20], spawnZoom: 9 })).toEqual({
      center: [10, 20],
      zoom: 9,
    });
    expect(resolveView({ center: [10, 20], spawnLat: 55 })).toEqual({
      center: [10, 55],
      zoom: 2,
    });
  });

  it("takes lon and lat in the order the props name them", () => {
    // spawnLat/spawnLong exist precisely so a [lon, lat] tuple cannot be
    // transposed by accident; assert the mapping explicitly.
    expect(resolveView({ spawnLat: 48.8566, spawnLong: 2.3522 }).center).toEqual([
      2.3522, 48.8566,
    ]);
  });
});

describe("resolveAssetStore", () => {
  it("defaults to the preset bundle", () => {
    expect(resolveAssetStore({})).toEqual(ASSET_STORE);
  });

  it("treats an explicit null as 'no labels', not as absent", () => {
    expect(resolveAssetStore({ assets: null })).toBeNull();
  });

  it("selects the sprite that matches a named style", () => {
    // A dark basemap with light icons is the failure this prevents.
    expect(resolveAssetStore({ mapStyle: "dark" })?.spritePath).toBe(
      "sprites/dark",
    );
    expect(resolveAssetStore({ mapStyle: "black" })?.spritePath).toBe(
      "sprites/black",
    );
  });

  it("lets an explicit spritePath override the style's default", () => {
    expect(
      resolveAssetStore({ mapStyle: "dark", spritePath: "sprites/custom" })
        ?.spritePath,
    ).toBe("sprites/custom");
  });

  it("leaves the preset alone when no style is named", () => {
    expect(resolveAssetStore({})?.spritePath).toBe(ASSET_STORE.spritePath);
  });

  it("warns when assetsRid is given with no way to find a sprite", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveAssetStore({ assetsRid: "ri.foundry.main.dataset.assets" });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/spritePath/);
    warn.mockRestore();
  });

  it("does not warn when a style supplies the sprite", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = resolveAssetStore({
      assetsRid: "ri.foundry.main.dataset.assets",
      mapStyle: "grayscale",
    });
    expect(warn).not.toHaveBeenCalled();
    expect(store?.spritePath).toBe("sprites/grayscale");
    warn.mockRestore();
  });
});

describe("MAP_STYLES", () => {
  it("lists only styles the bundled asset dataset ships sprites for", () => {
    // The bundle contains sprites/{black,dark,grayscale,light,white}. Offering
    // a name with no sprite would produce one console error per missing icon.
    expect([...MAP_STYLES].sort()).toEqual([
      "black",
      "dark",
      "grayscale",
      "light",
      "white",
    ]);
  });

  it("maps every style to a sprite path", () => {
    for (const style of MAP_STYLES) {
      expect(spritePathForStyle(style)).toBe(`sprites/${style}`);
    }
  });
});
