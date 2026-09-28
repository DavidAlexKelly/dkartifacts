import { describe, it, expect } from "vitest";
import { SymbolCatalog } from "../engine/catalog";
import { resolveSymbol, resolveCatalogNameForSidc } from "./index";
import { seizeSymbol, SEIZE_NAME } from "../symbols/catalog/individual/seize";
import { occupySymbol, OCCUPY_NAME } from "../symbols/catalog/individual/occupy";

const catalog = new SymbolCatalog({ [SEIZE_NAME]: seizeSymbol, [OCCUPY_NAME]: occupySymbol });

describe("resolveCatalogNameForSidc", () => {
  it("resolves this library's own synthetic renderer key", () => {
    expect(resolveCatalogNameForSidc(catalog, "SVGSEIZE")).toBe("svg-seize");
  });

  it("resolves a real doctrinal SIDC via meta.sidcTaskId", () => {
    expect(resolveCatalogNameForSidc(catalog, "GFTPO---------G")).toBe("svg-occupy"); // Occupy
  });

  it("returns undefined for a SIDC that matches nothing in the catalog", () => {
    expect(resolveCatalogNameForSidc(catalog, "GARBAGE")).toBeUndefined();
  });
});

describe("resolveSymbol", () => {
  it("resolves a tactical graphic via its real doctrinal SIDC", () => {
    const sym = resolveSymbol(catalog, "GFTPZ---------G"); // Seize
    expect(sym.kind).toBe("tactical-graphic");
    expect(sym.asSVG()).toContain("<svg");
    expect(sym.getSize()).toEqual({ width: 230, height: 210 });
  });

  it("resolves a tactical graphic via the synthetic renderer key and applies style", () => {
    const sym = resolveSymbol(catalog, "SVGSEIZE", { style: { stroke: "#4a90d9" } });
    expect(sym.kind).toBe("tactical-graphic");
    expect(sym.asSVG()).toContain("#4a90d9");
  });

  it("falls through to milsymbol for a real unit SIDC not in the catalog", () => {
    const sym = resolveSymbol(catalog, "SFGPUCI-----D---");
    expect(sym.kind).toBe("milsymbol");
    expect(sym.asSVG()).toContain("<svg");
    const size = sym.getSize();
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  it("getAnchor() reflects per-call params for a tactical graphic", () => {
    const at2000 = resolveSymbol(catalog, "SVGSEIZE", { params: { center: { x: 2000, y: 2000 } } });
    const atDefault = resolveSymbol(catalog, "SVGSEIZE");
    expect(at2000.getAnchor()).not.toEqual(atDefault.getAnchor());
  });

  it("respects a custom size box for a tactical graphic's getSize()/getAnchor()", () => {
    const sym = resolveSymbol(catalog, "SVGSEIZE", { size: { viewBox: "-100 -100 2300 2100", width: 460, height: 420 } });
    expect(sym.getSize()).toEqual({ width: 460, height: 420 });
    // Doubling the pixel box while keeping the same viewBox should double
    // the anchor's pixel coordinates too.
    const base = resolveSymbol(catalog, "SVGSEIZE").getAnchor();
    const doubled = sym.getAnchor();
    expect(doubled.x).toBeCloseTo(base.x * 2, 5);
    expect(doubled.y).toBeCloseTo(base.y * 2, 5);
  });
});
