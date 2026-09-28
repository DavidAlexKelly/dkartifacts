// engine/catalog.ts — build-time symbol catalog. No shared mutable state,
// no globalThis, no registry. A SymbolCatalog is a plain, immutable value
// constructed once (typically at your app's module-load time, or by the
// pre-built APP6D_CATALOG in @acc/app6d/symbols) from an
// explicit list of SymbolDefinitions, then passed around like any other
// value to whatever needs to render/edit symbols.
//
// Because a SymbolCatalog is immutable after construction, it doesn't
// matter if a bundler ends up with more than one copy of this class/module
// loaded — every copy just builds an identical, independent value from the
// same inputs. There's no "write into one copy, read from a different
// copy and get nothing" failure mode, because nothing is ever mutated
// after the constructor runs.
import type { SymbolDefinition } from "./types";

export interface NamedSymbolDefinition extends SymbolDefinition {
  /** The catalog key this symbol should be registered under (e.g. "svg-block"). */
  name: string;
}

export class SymbolCatalog {
  private readonly defs: ReadonlyMap<string, SymbolDefinition>;

  constructor(entries: Record<string, SymbolDefinition> | Array<[string, SymbolDefinition]>) {
    const map = new Map<string, SymbolDefinition>();
    const pairs = Array.isArray(entries) ? entries : Object.entries(entries);
    for (const [name, def] of pairs) {
      if (map.has(name)) {
        // Intentional diagnostic, not leftover: a duplicate name silently
        // shadowing a symbol is exactly the kind of thing a consumer needs
        // told. (No eslint-disable needed here — this repository scopes
        // no-console off for packages/*/src for this reason.)
        console.warn(`[tactical-graphics] Duplicate symbol name "${name}" in catalog — keeping the last one.`);
      }
      map.set(name, def);
    }
    this.defs = map;
  }

  get(name: string): SymbolDefinition | undefined {
    return this.defs.get(name);
  }

  has(name: string): boolean {
    return this.defs.has(name);
  }

  list(): string[] {
    return Array.from(this.defs.keys());
  }

  /**
   * Merge this catalog with additional symbols, returning a NEW catalog
   * (does not mutate this one — SymbolCatalog is always immutable).
   * Useful for composing the built-in APP6D_CATALOG with your own
   * app-specific custom symbols at startup:
   *
   *   const myCatalog = APP6D_CATALOG.extend({ "my-custom-icon": myDef });
   */
  extend(entries: Record<string, SymbolDefinition> | Array<[string, SymbolDefinition]>): SymbolCatalog {
    const merged: Array<[string, SymbolDefinition]> = [
      ...Array.from(this.defs.entries()),
      ...(Array.isArray(entries) ? entries : Object.entries(entries)),
    ];
    return new SymbolCatalog(merged);
  }
}

/** Convenience: build a catalog from an array of NamedSymbolDefinition
 * (each carrying its own `name` field), rather than a name->def record. */
export function catalogFromList(defs: NamedSymbolDefinition[]): SymbolCatalog {
  return new SymbolCatalog(defs.map((d) => [d.name, d] as [string, SymbolDefinition]));
}