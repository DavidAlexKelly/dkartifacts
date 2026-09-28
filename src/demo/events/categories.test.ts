/**
 * Custom categories, putting data into categories by hand, and media item
 * references: the pure halves. Previews and the map need a browser.
 */

import { describe, expect, it } from "vitest";
import {
  BUILTIN_REGISTRY,
  buildRegistry,
  matchCategory,
  matchesKeyword,
  parseCustomCategory,
  words,
  type CategoryDef,
} from "./categories";
import {
  NO_OVERRIDES,
  applyOverrides,
  overriddenCategory,
  withOverride,
} from "./categoryOverrides";
import { detectFields, flattenRecord, interpretRecords } from "./sources/interpret";
import {
  mediaRefsIn,
  parseMediaRef,
  previewKind,
  sniffMimeType,
} from "./sources/media";

const NOW = Date.UTC(2026, 8, 28, 12);
const SET = "ri.mio.main.media-set.0f0e6b1a-3c7a-4a52-9d49-0a1b2c3d4e5f";
const ITEM = "ri.mio.main.media-item.1a2b3c4d-3c7a-4a52-9d49-0a1b2c3d4e5f";
const VIEW = "ri.mio.main.view.2b3c4d5e-3c7a-4a52-9d49-0a1b2c3d4e5f";

function custom(entry: string, index = 0): CategoryDef {
  const parsed = parseCustomCategory(entry, index);
  if (!parsed.ok) {throw new Error(parsed.error);}
  return parsed.def;
}

describe("custom categories", () => {
  it("reads a label, a colour and keywords", () => {
    expect(custom("Border incidents|#ff8800|crossing, incursion*")).toEqual({
      id: "custom:border-incidents",
      label: "Border incidents",
      colour: "#ff8800",
      keywords: ["border incidents", "crossing", "incursion*"],
      custom: true,
    });
  });

  it("picks a colour when none is given, and trims", () => {
    const def = custom("  Frontline  ");
    expect(def.label).toBe("Frontline");
    expect(def.colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(custom("A", 0).colour).not.toBe(custom("B", 1).colour);
  });

  it("explains a bad entry", () => {
    expect(parseCustomCategory("|#fff")).toMatchObject({ ok: false });
    expect(parseCustomCategory("Frontline|orange")).toMatchObject({ ok: false });
    expect(parseCustomCategory("!!!")).toMatchObject({ ok: false });
  });

  it("go between the built-ins and Other, and never replace a built-in", () => {
    const registry = buildRegistry([custom("Frontline"), custom("Aid")]);
    expect(registry.order.slice(-3)).toEqual(["custom:frontline", "custom:aid", "other"]);
    expect(registry.order.slice(0, BUILTIN_REGISTRY.order.length - 1)).toEqual(
      BUILTIN_REGISTRY.order.slice(0, -1),
    );
  });
});

describe("keyword matching", () => {
  it("splits text into lower-case words", () => {
    expect(words("Explosions/Remote violence")).toEqual(["explosions", "remote", "violence"]);
  });

  it("matches whole words and phrases, with * for a prefix", () => {
    const text = words("Drone strike near the port of Odesa");
    expect(matchesKeyword(text, "drone strike")).toBe(true);
    expect(matchesKeyword(text, "port")).toBe(true);
    expect(matchesKeyword(text, "od*")).toBe(true);
    expect(matchesKeyword(words("Annual report"), "port")).toBe(false);
    expect(matchesKeyword(text, "strike near port")).toBe(false);
  });

  it("lets a custom category's keywords win over the built-ins'", () => {
    const registry = buildRegistry([custom("Frontline|#f00|battle*, shelling")]);
    expect(matchCategory(registry, "Battles")).toBe("custom:frontline");
    expect(matchCategory(registry, "Frontline")).toBe("custom:frontline");
    expect(matchCategory(registry, "Protests")).toBe("protest");
    expect(matchCategory(BUILTIN_REGISTRY, "Battles")).toBe("conflict");
  });

  it("sorts records by custom keywords during interpretation", () => {
    const registry = buildRegistry([custom("Aid|#0f0|convoy*, water point*")]);
    const records = [
      { lat: 31.4, lng: 34.4, event_type: "Aid convoy delayed" },
      { lat: 31.3, lng: 34.3, event_type: "Battles" },
    ];
    const map = detectFields(Object.keys(records[0]), records);
    const { events } = interpretRecords(records, map, {
      sourceKey: "dataset:x",
      sourceLabel: "x",
      now: NOW,
      categories: registry,
    });
    expect(events.map((e) => [e.category, e.categoryValue])).toEqual([
      ["custom:aid", "Aid convoy delayed"],
      ["conflict", "Battles"],
    ]);
  });
});

describe("putting data into categories by hand", () => {
  const registry = buildRegistry([custom("Frontline")]);
  const battle = { id: "dataset:a:1", category: "conflict", sourceKey: "dataset:a", categoryValue: "Battles" };
  const protest = { id: "dataset:a:2", category: "protest", sourceKey: "dataset:a", categoryValue: "Protests" };

  it("applies the most specific assignment: event, then value, then source", () => {
    let overrides = withOverride(NO_OVERRIDES, { kind: "source", sourceKey: "dataset:a" }, "military");
    expect(overriddenCategory(protest, overrides, registry)).toBe("military");
    overrides = withOverride(overrides, { kind: "value", sourceKey: "dataset:a", value: "Battles" }, "custom:frontline");
    expect(overriddenCategory(battle, overrides, registry)).toBe("custom:frontline");
    expect(overriddenCategory(protest, overrides, registry)).toBe("military");
    overrides = withOverride(overrides, { kind: "event", id: protest.id }, "cyber");
    expect(applyOverrides([battle, protest], overrides, registry).map((e) => e.category)).toEqual([
      "custom:frontline",
      "cyber",
    ]);
  });

  it("ignores assignments to categories that no longer exist", () => {
    const overrides = withOverride(NO_OVERRIDES, { kind: "event", id: battle.id }, "custom:gone");
    expect(overriddenCategory(battle, overrides, registry)).toBeUndefined();
    const [same] = applyOverrides([battle], overrides, registry);
    expect(same).toBe(battle);
  });

  it("clears an assignment, and drops a source's empty value map", () => {
    const set = withOverride(NO_OVERRIDES, { kind: "value", sourceKey: "dataset:a", value: "Battles" }, "military");
    expect(set.values).toEqual({ "dataset:a": { Battles: "military" } });
    const cleared = withOverride(set, { kind: "value", sourceKey: "dataset:a", value: "Battles" }, undefined);
    expect(cleared.values).toEqual({});
  });
});

describe("media references", () => {
  const foundry = JSON.stringify({
    mimeType: "image/jpeg",
    reference: {
      type: "mediaSetViewItem",
      mediaSetViewItem: { mediaSetRid: SET, mediaSetViewRid: VIEW, mediaItemRid: ITEM },
    },
  });

  it("reads Foundry's media reference, a flat object and set::item text", () => {
    const expected = { field: "photo", mediaSetRid: SET, mediaItemRid: ITEM };
    expect(parseMediaRef(foundry, "photo")).toEqual({ ...expected, mimeType: "image/jpeg" });
    expect(parseMediaRef({ mediaSetRid: SET, mediaItemRid: ITEM }, "photo")).toEqual(expected);
    expect(parseMediaRef(`${SET}::${ITEM}`, "photo")).toEqual(expected);
  });

  it("reads a bare item RID only with a media set to read it from", () => {
    expect(parseMediaRef(ITEM, "photo")).toBeNull();
    expect(parseMediaRef(ITEM, "photo", SET)).toEqual({ field: "photo", mediaSetRid: SET, mediaItemRid: ITEM });
    expect(mediaRefsIn({ photo: ITEM, media_set: SET }, ["photo"])).toHaveLength(1);
  });

  it("rejects look-alikes", () => {
    for (const value of ["", "ri.mio.main.media-item.not-a-uuid", `${SET}::nope`, "{}", 42, null]) {
      expect(parseMediaRef(value, "x"), String(value)).toBeNull();
    }
  });

  it("reads a list of references in one column", () => {
    expect(mediaRefsIn({ photos: [`${SET}::${ITEM}`, foundry] }, ["photos"])).toHaveLength(2);
  });

  it("finds media columns, keeps them whole, and attaches them to events", () => {
    const flat = flattenRecord({ lat: "48.1", lng: "37.9", photo: foundry, name: "Crater" });
    expect(flat.photo).toBe(foundry);
    const map = detectFields(Object.keys(flat), [flat]);
    expect(map.media).toEqual(["photo"]);
    expect(map.title).toBe("name");
    const { events } = interpretRecords([flat], map, { sourceKey: "dataset:m", sourceLabel: "m", now: NOW });
    expect(events[0].media).toEqual([
      { field: "photo", mediaSetRid: SET, mediaItemRid: ITEM, mimeType: "image/jpeg" },
    ]);
    expect(events[0].metrics.map((m) => m.label)).not.toContain("Photo");
  });

  it("tells a file's type from its first bytes", () => {
    const bytes = (...values: number[]) => new Uint8Array(values);
    const text = (value: string) => new TextEncoder().encode(value);
    expect(sniffMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d))).toBe("image/png");
    expect(sniffMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMimeType(text("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMimeType(text("\0\0\0\u0018ftypmp42"))).toBe("video/mp4");
    expect(sniffMimeType(text("hello"))).toBeUndefined();
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("application/zip")).toBe("download");
    expect(previewKind(undefined)).toBe("download");
  });
});
