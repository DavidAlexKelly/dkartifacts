/**
 * The four keyboard failures every hand-rolled dropdown in the estate has,
 * asserted so that the shared version cannot have them.
 */

import { describe, expect, it } from "vitest";
import {
  extendTypeahead,
  isTypeaheadKey,
  nextIndex,
  typeaheadIndex,
} from "./listNavigation.js";

const items = [
  { label: "All" },
  { label: "Assigned", disabled: true },
  { label: "Blocked" },
  { label: "Complete" },
];

describe("nextIndex", () => {
  it("lands on the first item from nothing highlighted", () => {
    expect(nextIndex(items, -1, "ArrowDown")).toBe(0);
  });

  it("goes to the last item when opened with Up", () => {
    expect(nextIndex(items, -1, "ArrowUp")).toBe(3);
  });

  it("skips disabled items instead of highlighting them", () => {
    // Highlighting one and having Enter do nothing reads as the menu being
    // broken rather than the item being unavailable.
    expect(nextIndex(items, 0, "ArrowDown")).toBe(2);
    expect(nextIndex(items, 2, "ArrowUp")).toBe(0);
  });

  it("wraps at both ends", () => {
    expect(nextIndex(items, 3, "ArrowDown")).toBe(0);
    expect(nextIndex(items, 0, "ArrowUp")).toBe(3);
  });

  it("clamps instead of wrapping when asked", () => {
    expect(nextIndex(items, 3, "ArrowDown", { wrap: false })).toBe(3);
    expect(nextIndex(items, 0, "ArrowUp", { wrap: false })).toBe(0);
  });

  it("handles Home and End, and lands on something usable", () => {
    const leadingDisabled = [{ label: "x", disabled: true }, ...items];
    expect(nextIndex(leadingDisabled, 3, "Home")).toBe(1);
    expect(nextIndex(items, 0, "End")).toBe(3);
  });

  it("pages by ten, then finds the nearest enabled item", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      label: `item ${index}`,
      disabled: index === 10,
    }));
    // 0 + 10 is disabled, so it settles on 9 rather than refusing to move.
    expect(nextIndex(many, 0, "PageDown")).toBe(9);
    expect(nextIndex(many, 20, "PageUp")).toBe(11);
  });

  it("returns null when every item is disabled", () => {
    const allOff = [{ label: "a", disabled: true }, { label: "b", disabled: true }];
    expect(nextIndex(allOff, -1, "ArrowDown")).toBeNull();
  });

  it("returns null for an empty list rather than -1 or 0", () => {
    // -1 would highlight nothing while claiming to; 0 would index past the end.
    expect(nextIndex([], -1, "ArrowDown")).toBeNull();
  });
});

describe("typeaheadIndex", () => {
  it("jumps to the first match", () => {
    expect(typeaheadIndex(items, -1, "b")).toBe(2);
  });

  it("cycles through items sharing a first letter", () => {
    const tables = [{ label: "KNA1" }, { label: "KNB1" }, { label: "MARA" }];
    expect(typeaheadIndex(tables, -1, "k")).toBe(0);
    expect(typeaheadIndex(tables, 0, "k")).toBe(1);
    expect(typeaheadIndex(tables, 1, "k")).toBe(0);
  });

  it("matches more than one character, because KNA1 and KNB1 are different", () => {
    const tables = [{ label: "KNA1" }, { label: "KNB1" }];
    expect(typeaheadIndex(tables, -1, "knb")).toBe(1);
  });

  it("never lands on a disabled item", () => {
    expect(typeaheadIndex(items, -1, "a")).toBe(0);
    expect(typeaheadIndex(items, 0, "as")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(typeaheadIndex(items, -1, "COMP")).toBe(3);
  });
});

describe("extendTypeahead", () => {
  it("accumulates while the user is still typing", () => {
    const first = extendTypeahead(null, "k", 1000);
    const second = extendTypeahead(first, "n", 1200);
    expect(second.query).toBe("kn");
  });

  it("starts again after the pause", () => {
    const first = extendTypeahead(null, "k", 1000);
    const later = extendTypeahead(first, "m", 3000);
    expect(later.query).toBe("m");
  });
});

describe("isTypeaheadKey", () => {
  it("accepts characters and rejects commands", () => {
    expect(isTypeaheadKey("a")).toBe(true);
    expect(isTypeaheadKey("7")).toBe(true);
    expect(isTypeaheadKey("ArrowDown")).toBe(false);
    expect(isTypeaheadKey("Enter")).toBe(false);
  });

  it("rejects space, which has a job already", () => {
    // Space toggles in a multi-select and activates in a menu; it cannot also
    // be the start of a search.
    expect(isTypeaheadKey(" ")).toBe(false);
  });
});
