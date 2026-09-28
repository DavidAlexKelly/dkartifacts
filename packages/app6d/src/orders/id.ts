/**
 * Ids for units and orders.
 *
 * `crypto.randomUUID()` is the right answer and is what this returns almost
 * always. It is undefined on insecure origins, though — plain http that is not
 * localhost, which a dev server or an embedded preview can be — so there is a
 * fallback, and the fallback is `crypto.getRandomValues`, not `Math.random()`.
 *
 * These ids are not security material; the reason to avoid Math.random() here
 * is that a rule which blocks it everywhere is a rule nobody has to think
 * about, and thinking about it per call site is how the one that mattered gets
 * waved through.
 */
export function newId(): string {
  const source = globalThis.crypto;
  if (source && typeof source.randomUUID === "function") {
    return source.randomUUID();
  }
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
