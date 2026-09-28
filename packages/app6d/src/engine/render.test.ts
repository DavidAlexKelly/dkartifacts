import { describe, it, expect } from "vitest";
import { SymbolCatalog } from "./catalog";
import { paramsFor, getParts, render, renderSVG, getHandles, applyHandle } from "./render";
import type { SymbolDefinition } from "./types";

const square: SymbolDefinition = {
  title: "Square",
  params: { center: { x: 100, y: 100 }, size: 40 },
  generate: (p) => [
    { kind: "stroke", d: `M${p.center.x},${p.center.y} h${p.size} v${p.size} h${-p.size} Z`, dashed: false },
    { kind: "text", text: "sq", pos: p.center, size: 12, rotate: 0 },
  ],
  handles: (p) => [
    { id: "center", kind: "point", pos: p.center, set: (pos) => ({ center: pos }) },
    { id: "size", kind: "scalar", pos: { x: p.center.x + p.size, y: p.center.y }, set: (pos) => ({ size: Math.max(1, pos.x - p.center.x) }) },
  ],
};

const catalog = new SymbolCatalog({ square });

describe("paramsFor / getParts", () => {
  it("returns the symbol's default params when no overrides given", () => {
    expect(paramsFor(catalog, "square")).toEqual({ center: { x: 100, y: 100 }, size: 40 });
  });

  it("deep-merges nested override objects instead of replacing them", () => {
    const merged = paramsFor(catalog, "square", { center: { x: 5 } as any });
    expect(merged).toEqual({ center: { x: 5, y: 100 }, size: 40 });
  });

  it("throws a descriptive error for an unknown symbol name", () => {
    expect(() => getParts(catalog, "does-not-exist")).toThrow(/Unknown symbol.*does-not-exist/);
  });
});

describe("render / renderSVG", () => {
  it("wraps generated parts in a <g> with the given style", () => {
    const markup = render(catalog, "square", undefined, { stroke: "#123456", strokeWidth: 3 });
    expect(markup).toContain("<g");
    expect(markup).toContain('stroke="#123456"');
    expect(markup).toContain('stroke-width="3"');
    expect(markup).toContain("<path");
    expect(markup).toContain("<text");
  });

  it("renderSVG wraps render() output in a standalone <svg> document", () => {
    const doc = renderSVG(catalog, "square");
    expect(doc.startsWith("<svg")).toBe(true);
    expect(doc).toContain("</svg>");
  });

  it("escapes a malicious stroke style value so it can't break out of the <g> tag", () => {
    const evil = '"><script>alert(1)</script>';
    const markup = render(catalog, "square", undefined, { stroke: evil });
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
  });

  it("escapes malicious text content so it can't inject markup", () => {
    const evil = '"><script>alert(1)</script>';
    const evilTextCatalog = new SymbolCatalog({
      square: {
        ...square,
        generate: () => [{ kind: "text", text: evil, pos: { x: 0, y: 0 }, size: 10, rotate: 0 }],
      },
    });
    const textMarkup = render(evilTextCatalog, "square");
    expect(textMarkup).not.toContain("<script>");
    expect(textMarkup).toContain("&lt;script&gt;");
  });
});

describe("getHandles / applyHandle", () => {
  it("returns handle descriptors positioned from the current params", () => {
    const handles = getHandles(catalog, "square");
    expect(handles.map((h) => h.id).sort()).toEqual(["center", "size"]);
    expect(handles.find((h) => h.id === "center")?.pos).toEqual({ x: 100, y: 100 });
  });

  it("applies a handle drag and returns the full merged params", () => {
    const next = applyHandle(catalog, "square", undefined, "center", { x: 200, y: 250 });
    expect(next).toEqual({ center: { x: 200, y: 250 }, size: 40 });
  });

  it("applying one handle does not affect unrelated params", () => {
    const next = applyHandle(catalog, "square", undefined, "size", { x: 160, y: 100 });
    expect(next.center).toEqual({ x: 100, y: 100 });
    expect(next.size).toBe(60);
  });

  it("throws for an unknown handle id", () => {
    expect(() => applyHandle(catalog, "square", undefined, "nope", { x: 0, y: 0 })).toThrow(/Unknown handle/);
  });
});
