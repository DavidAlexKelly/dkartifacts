import { describe, expect, it } from "vitest";

import { createMinHeap } from "./heap";

describe("the open-set heap", () => {
  it("pops in key order", () => {
    const heap = createMinHeap(4);
    const keys = [5, 1, 9, 3, 3.5, -2, 100, 0];
    keys.forEach((key, value) => heap.push(key, value));

    const popped: number[] = [];
    while (heap.size > 0) {popped.push(heap.pop());}

    const expected = keys
      .map((key, value) => ({ key, value }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.value);
    expect(popped).toEqual(expected);
  });

  it("grows past its initial capacity", () => {
    const heap = createMinHeap(2);
    for (let i = 1000; i > 0; i--) {heap.push(i, i);}
    expect(heap.size).toBe(1000);
    expect(heap.pop()).toBe(1);
    expect(heap.peekKey()).toBe(2);
  });

  /**
   * A* pushes a duplicate entry rather than decreasing a key in place, and
   * skips any pop it has already closed. Both copies must come out, cheapest
   * first, or that scheme silently loses the improved path.
   */
  it("keeps duplicate entries for the same value", () => {
    const heap = createMinHeap();
    heap.push(10, 42);
    heap.push(4, 42);
    expect(heap.pop()).toBe(42);
    expect(heap.size).toBe(1);
    expect(heap.peekKey()).toBe(10);
  });

  it("reports empty rather than throwing", () => {
    const heap = createMinHeap();
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBe(-1);
    expect(heap.peekKey()).toBe(Infinity);
  });
});
