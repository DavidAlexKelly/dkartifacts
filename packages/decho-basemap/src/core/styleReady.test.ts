import { describe, expect, it, vi } from "vitest";

import { whenStyleLoaded, type StyleReadyMap } from "./styleReady.js";

/** A map whose style loads when the test says so. */
function fakeMap(loaded = false) {
  const listeners = new Map<string, Set<() => void>>();
  let styleLoaded = loaded;

  const map: StyleReadyMap = {
    isStyleLoaded: () => styleLoaded,
    on: (type, listener) => {
      if (!listeners.has(type)) {listeners.set(type, new Set());}
      listeners.get(type)?.add(listener);
    },
    off: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
  };

  return {
    map,
    /** Fire an event without changing the flag. */
    emit: (type: string) => {
      for (const listener of [...(listeners.get(type) ?? [])]) {listener();}
    },
    /** The thing MapLibre does: flip the flag, then fire styledata. */
    finishLoading: () => {
      styleLoaded = true;
      for (const listener of [...(listeners.get("styledata") ?? [])]) {
        listener();
      }
    },
    setLoaded: (value: boolean) => {
      styleLoaded = value;
    },
    listenerCount: () =>
      [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

describe("whenStyleLoaded", () => {
  it("resolves immediately when the style is already loaded", async () => {
    const { map, listenerCount } = fakeMap(true);
    await expect(whenStyleLoaded(map)).resolves.toBe(true);
    // Not even a subscription: this is the common case and it should cost
    // nothing.
    expect(listenerCount()).toBe(0);
  });

  it("waits for styledata, and only when the flag has flipped", async () => {
    const { map, emit, finishLoading } = fakeMap();
    let settled = false;
    const pending = whenStyleLoaded(map).then((value) => {
      settled = true;
      return value;
    });

    // styledata fires repeatedly while a style comes up — on the JSON, on the
    // sprite, on each glyph range. The flag is what decides.
    emit("styledata");
    emit("styledata");
    await Promise.resolve();
    expect(settled).toBe(false);

    finishLoading();
    await expect(pending).resolves.toBe(true);
  });

  it("resolves on load even if styledata never reports loaded", async () => {
    const { map, emit, setLoaded } = fakeMap();
    const pending = whenStyleLoaded(map);
    setLoaded(true);
    emit("load");
    await expect(pending).resolves.toBe(true);
  });

  it("catches a style that finishes between the guard and the subscription", async () => {
    // The race a naive map.once("load") loses: the style completes in the
    // microtask gap, no further event is coming, and the promise hangs.
    let calls = 0;
    const map: StyleReadyMap = {
      isStyleLoaded: () => {
        calls += 1;
        return calls > 1; // false on the initial guard, true just after
      },
      on: () => undefined,
      off: () => undefined,
    };
    await expect(whenStyleLoaded(map)).resolves.toBe(true);
  });

  it("unsubscribes once it settles", async () => {
    const { map, finishLoading, listenerCount } = fakeMap();
    const pending = whenStyleLoaded(map);
    expect(listenerCount()).toBe(2);
    finishLoading();
    await pending;
    expect(listenerCount()).toBe(0);
  });

  it("gives up rather than hanging forever, and says so", async () => {
    vi.useFakeTimers();
    try {
      const { map, listenerCount } = fakeMap();
      const pending = whenStyleLoaded(map, { timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1001);
      // False, not a rejection: a caller should be able to carry on and fail
      // with its own specific error rather than this one.
      await expect(pending).resolves.toBe(false);
      expect(listenerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not settle twice when load follows styledata", async () => {
    const { map, finishLoading, emit } = fakeMap();
    const resolved: boolean[] = [];
    const pending = whenStyleLoaded(map).then((value) => resolved.push(value));

    finishLoading();
    emit("load");
    await pending;

    expect(resolved).toEqual([true]);
  });
});
