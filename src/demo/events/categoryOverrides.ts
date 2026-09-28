/**
 * Putting loaded data into a category by hand, at three levels:
 *
 *   events   one event or area, by id          (the details panel)
 *   values   every record of a source whose category column says X
 *            ("Battles" → Frontline)           (the source row's value list)
 *   sources  everything a source loads          (the source row's dropdown)
 *
 * The most specific wins, then what the data said. Applied after
 * interpretation, so changing an assignment never reloads or re-reads
 * anything, and to mock events as well as loaded ones.
 *
 * An assignment to a category that no longer exists — a custom one since
 * removed from the Workshop variable — is ignored rather than inventing a
 * category nobody defined. Kept in browser storage, keyed by source and
 * event ids, so an assignment made in one session is there in the next.
 */

import type { CategoryRegistry } from "./categories";

export interface CategoryOverrides {
  sources: Record<string, string>;
  values: Record<string, Record<string, string>>;
  events: Record<string, string>;
}

export const NO_OVERRIDES: CategoryOverrides = { sources: {}, values: {}, events: {} };

interface Categorised {
  id: string;
  category: string;
  sourceKey?: string;
  categoryValue?: string;
}

/** The category an override puts this item in, if any applies. */
export function overriddenCategory(
  item: Categorised,
  overrides: CategoryOverrides,
  registry: CategoryRegistry,
): string | undefined {
  const known = (id: string | undefined) => (id && registry.byId[id] ? id : undefined);
  return (
    known(overrides.events[item.id]) ??
    (item.sourceKey && item.categoryValue != null
      ? known(overrides.values[item.sourceKey]?.[item.categoryValue])
      : undefined) ??
    (item.sourceKey ? known(overrides.sources[item.sourceKey]) : undefined)
  );
}

/** Items with overrides applied. Unchanged items are returned as they were. */
export function applyOverrides<T extends Categorised>(
  items: readonly T[],
  overrides: CategoryOverrides,
  registry: CategoryRegistry,
): T[] {
  return items.map((item) => {
    const category = overriddenCategory(item, overrides, registry);
    return category && category !== item.category ? { ...item, category } : item;
  });
}

// ── Editing ─────────────────────────────────────────────────────────────────

/** Set or (with undefined) clear one assignment, returning a new object. */
export function withOverride(
  overrides: CategoryOverrides,
  target:
    | { kind: "event"; id: string }
    | { kind: "source"; sourceKey: string }
    | { kind: "value"; sourceKey: string; value: string },
  category: string | undefined,
): CategoryOverrides {
  const set = (map: Record<string, string>, key: string) => {
    const next = { ...map };
    if (category) {next[key] = category;}
    else {delete next[key];}
    return next;
  };
  switch (target.kind) {
    case "event":
      return { ...overrides, events: set(overrides.events, target.id) };
    case "source":
      return { ...overrides, sources: set(overrides.sources, target.sourceKey) };
    case "value": {
      const values = set(overrides.values[target.sourceKey] ?? {}, target.value);
      const next = { ...overrides.values };
      if (Object.keys(values).length > 0) {next[target.sourceKey] = values;}
      else {delete next[target.sourceKey];}
      return { ...overrides, values: next };
    }
  }
}

// ── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "decho-events:category-overrides";

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string" && entry !== "") {out[key] = entry;}
    }
  }
  return out;
}

export function loadOverrides(): CategoryOverrides {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {return NO_OVERRIDES;}
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const values: Record<string, Record<string, string>> = {};
    if (parsed.values && typeof parsed.values === "object") {
      for (const [key, map] of Object.entries(parsed.values as Record<string, unknown>)) {
        const entries = stringMap(map);
        if (Object.keys(entries).length > 0) {values[key] = entries;}
      }
    }
    return { sources: stringMap(parsed.sources), values, events: stringMap(parsed.events) };
  } catch {
    return NO_OVERRIDES;
  }
}

export function saveOverrides(overrides: CategoryOverrides): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Private windows: assignments last for the session.
  }
}
