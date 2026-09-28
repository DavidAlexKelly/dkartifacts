/**
 * Refcounted request de-duplication with shared cancellation.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * MapLibre aborts tiles that scroll out of view, and in whole-file mode ~20
 * tiles map onto ONE archive download. Two naive options, both wrong:
 *
 *   - hand the first caller's signal to the shared fetch, and one abandoned
 *     tile kills the download the other nineteen are waiting on;
 *   - ignore signals, and a 25 MB transfer for a cell nobody is looking at any
 *     more runs to completion, holding a concurrency slot the whole time.
 *
 * So joiners are counted. The underlying operation is aborted only when the
 * count reaches zero — when genuinely nobody wants the bytes. Each caller's
 * own promise rejects on its own signal regardless.
 *
 * Extracted from bytes.ts to be tested directly. The waiter arithmetic is the
 * least obvious code in this package and the easiest to break by accident.
 */

export function abortError(): Error {
  return new DOMException("Aborted", "AbortError");
}

export interface InFlightMap<T> {
  /**
   * Join the operation for `key`, starting it if not already running.
   *
   * `start` receives an AbortSignal that fires only once every joiner has
   * abandoned the operation.
   */
  join(
    key: string,
    start: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
  /** Number of operations currently running. For tests and diagnostics. */
  readonly size: number;
  /** Live waiter count for a key, or 0. For tests and diagnostics. */
  waiters(key: string): number;
  clear(): void;
}

interface Entry<T> {
  promise: Promise<T>;
  controller: AbortController;
  waiters: number;
}

export function createInFlightMap<T>(): InFlightMap<T> {
  const entries = new Map<string, Entry<T>>();

  return {
    join(key, start, signal) {
      if (signal?.aborted) {return Promise.reject(abortError());}

      let entry = entries.get(key);
      if (!entry) {
        const controller = new AbortController();
        const created: Entry<T> = {
          controller,
          waiters: 0,
          promise: start(controller.signal),
        };
        entries.set(key, created);
        // Don't leave a settled entry in the map — let the next caller retry.
        void created.promise
          .catch(() => {})
          .finally(() => {
            if (entries.get(key) === created) {entries.delete(key);}
          });
        entry = created;
      }

      const joined = entry;
      joined.waiters += 1;

      let released = false;
      const release = (abortIfLast: boolean) => {
        if (released) {return;}
        released = true;
        joined.waiters -= 1;
        if (abortIfLast && joined.waiters <= 0) {joined.controller.abort();}
      };

      if (!signal) {
        return joined.promise.then(
          (value) => {
            release(false);
            return value;
          },
          (err) => {
            release(false);
            throw err;
          },
        );
      }

      return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
          release(true);
          reject(abortError());
        };
        signal.addEventListener("abort", onAbort, { once: true });
        joined.promise.then(
          (value) => {
            signal.removeEventListener("abort", onAbort);
            release(false);
            resolve(value);
          },
          (err) => {
            signal.removeEventListener("abort", onAbort);
            release(false);
            reject(err);
          },
        );
      });
    },

    get size() {
      return entries.size;
    },

    waiters(key) {
      return entries.get(key)?.waiters ?? 0;
    },

    clear() {
      entries.clear();
    },
  };
}
