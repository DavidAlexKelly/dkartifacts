import { describe, expect, it, vi } from "vitest";

import { createInFlightMap } from "./inflight";

/** A promise plus the levers to settle it, and the signal it was started with. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createInFlightMap", () => {
  it("runs the operation once for concurrent joiners and shares the result", async () => {
    const map = createInFlightMap<string>();
    const d = deferred<string>();
    const start = vi.fn(() => d.promise);

    const a = map.join("k", start);
    const b = map.join("k", start);

    expect(start).toHaveBeenCalledTimes(1);
    expect(map.waiters("k")).toBe(2);

    d.resolve("bytes");
    await expect(a).resolves.toBe("bytes");
    await expect(b).resolves.toBe("bytes");
  });

  it("forgets the entry once settled so the next caller retries", async () => {
    const map = createInFlightMap<string>();

    await map.join("k", () => Promise.resolve("first"));
    // Allow the .finally() cleanup microtask to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(map.size).toBe(0);

    const second = vi.fn(() => Promise.resolve("second"));
    await expect(map.join("k", second)).resolves.toBe("second");
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a rejected operation does not poison the key", async () => {
    const map = createInFlightMap<string>();

    await expect(
      map.join("k", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await Promise.resolve();
    await Promise.resolve();

    await expect(map.join("k", () => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("does NOT abort the shared operation while other joiners remain", async () => {
    // The whole point of the refcount: one abandoned tile must not cancel the
    // download that nineteen others are waiting on.
    const map = createInFlightMap<string>();
    const d = deferred<string>();
    let seen: AbortSignal | undefined;

    const controllerA = new AbortController();
    const a = map.join(
      "k",
      (signal) => {
        seen = signal;
        return d.promise;
      },
      controllerA.signal,
    );
    const b = map.join("k", () => d.promise);

    controllerA.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    expect(seen?.aborted).toBe(false);

    d.resolve("bytes");
    await expect(b).resolves.toBe("bytes");
  });

  it("aborts the shared operation once the last joiner abandons it", async () => {
    const map = createInFlightMap<string>();
    const d = deferred<string>();
    let seen: AbortSignal | undefined;

    const c1 = new AbortController();
    const c2 = new AbortController();
    const a = map.join(
      "k",
      (signal) => {
        seen = signal;
        return d.promise;
      },
      c1.signal,
    );
    const b = map.join("k", () => d.promise, c2.signal);

    c1.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    expect(seen?.aborted).toBe(false);

    c2.abort();
    await expect(b).rejects.toMatchObject({ name: "AbortError" });
    expect(seen?.aborted).toBe(true);
  });

  it("rejects immediately for a signal that is already aborted", async () => {
    const map = createInFlightMap<string>();
    const start = vi.fn(() => Promise.resolve("bytes"));
    const controller = new AbortController();
    controller.abort();

    await expect(map.join("k", start, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("counts unsignalled joiners, so they cannot be cancelled out from under", async () => {
    // An unsignalled joiner has no way to give up, so it must hold the refcount
    // open. Otherwise a signalled joiner aborting would kill a fetch that an
    // unsignalled caller is still awaiting.
    const map = createInFlightMap<string>();
    const d = deferred<string>();
    let seen: AbortSignal | undefined;

    const plain = map.join("k", (signal) => {
      seen = signal;
      return d.promise;
    });

    const controller = new AbortController();
    const signalled = map.join("k", () => d.promise, controller.signal);

    controller.abort();
    await expect(signalled).rejects.toMatchObject({ name: "AbortError" });
    expect(seen?.aborted).toBe(false);

    d.resolve("bytes");
    await expect(plain).resolves.toBe("bytes");
  });

  it("double-aborting one joiner does not decrement the count twice", async () => {
    // Guards the `released` latch. Without it, a joiner that aborts twice would
    // drive waiters negative and abort a live shared fetch.
    const map = createInFlightMap<string>();
    const d = deferred<string>();
    let seen: AbortSignal | undefined;

    const c1 = new AbortController();
    const a = map.join(
      "k",
      (signal) => {
        seen = signal;
        return d.promise;
      },
      c1.signal,
    );
    const b = map.join("k", () => d.promise);

    c1.abort();
    c1.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });

    expect(seen?.aborted).toBe(false);
    d.resolve("bytes");
    await expect(b).resolves.toBe("bytes");
  });

  it("keys are independent", async () => {
    const map = createInFlightMap<string>();
    const start = vi.fn((_: AbortSignal) => Promise.resolve("x"));

    await Promise.all([map.join("a", start), map.join("b", start)]);
    expect(start).toHaveBeenCalledTimes(2);
  });
});
