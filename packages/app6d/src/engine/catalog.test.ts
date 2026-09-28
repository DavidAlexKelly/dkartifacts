import { describe, it, expect, vi } from "vitest";
import { SymbolCatalog, catalogFromList } from "./catalog";
import type { SymbolDefinition } from "./types";

const dummy = (title: string): SymbolDefinition => ({
  title,
  params: {},
  generate: () => [],
  handles: () => [],
});

describe("SymbolCatalog", () => {
  it("builds from a name->def record", () => {
    const catalog = new SymbolCatalog({ a: dummy("A"), b: dummy("B") });
    expect(catalog.list().sort()).toEqual(["a", "b"]);
    expect(catalog.get("a")?.title).toBe("A");
    expect(catalog.has("b")).toBe(true);
    expect(catalog.has("missing")).toBe(false);
    expect(catalog.get("missing")).toBeUndefined();
  });

  it("builds from an array of [name, def] pairs", () => {
    const catalog = new SymbolCatalog([["a", dummy("A")]]);
    expect(catalog.list()).toEqual(["a"]);
  });

  it("keeps the last definition and warns on duplicate names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const catalog = new SymbolCatalog([
      ["a", dummy("First")],
      ["a", dummy("Second")],
    ]);
    expect(catalog.get("a")?.title).toBe("Second");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("extend() returns a new catalog and does not mutate the original", () => {
    const base = new SymbolCatalog({ a: dummy("A") });
    const extended = base.extend({ b: dummy("B") });

    expect(base.list()).toEqual(["a"]);
    expect(extended.list().sort()).toEqual(["a", "b"]);
    expect(extended).not.toBe(base);
  });

  it("catalogFromList() builds from NamedSymbolDefinition entries", () => {
    const catalog = catalogFromList([
      { name: "x", ...dummy("X") },
      { name: "y", ...dummy("Y") },
    ]);
    expect(catalog.list().sort()).toEqual(["x", "y"]);
    expect(catalog.get("x")?.title).toBe("X");
  });
});
