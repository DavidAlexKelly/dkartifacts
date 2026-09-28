/**
 * Which Foundry sources the event monitor reads, and how they are written
 * down.
 *
 * The input formats are the ones the davebettermap widget takes as Workshop
 * variables, so a RID list copied from one works in the other:
 *
 *   dataset   ri.foundry.main.dataset.<uuid>
 *   stream    ri.foundry.main.dataset.<uuid>          (a streaming dataset)
 *   mediaset  ri.mio.main.media-set.<uuid>::<path>    e.g. ::incidents.geojson
 *             ri.mio.main.media-set.<uuid>::ri.mio.main.media-item.<uuid>
 *
 * Sources come from three places, combined:
 *
 *   Workshop   the event-monitor-* string-list variables (src/workshopConfig.ts)
 *              when embedded — pinned: changed in the module, not here.
 *   URL        `?dataset=…&mediaset=…&stream=…`, for a shareable link.
 *   the panel  added by hand. Remembered in this browser when the page is
 *              standalone and not driven by the URL; inside a Workshop iframe
 *              they last for the session, because browser storage is shared
 *              by every module embedding the app.
 */

import type { EventCategory } from "../mockEvents";

export type SourceKind = "dataset" | "mediaset" | "stream";

export interface SourceConfig {
  kind: SourceKind;
  rid: string;
  /** Media sets only: the item's path, or its media item RID. */
  item?: string;
  /** Category for records whose own fields do not say. */
  category?: EventCategory;
  /**
   * The column to title events with, chosen from the source's columns once
   * it has loaded. Absent means detected. Not part of the source's identity:
   * changing it re-titles what is loaded rather than reading it again.
   */
  titleField?: string;
}

export const SOURCE_KINDS: Array<{ kind: SourceKind; label: string; placeholder: string }> = [
  { kind: "dataset", label: "Dataset", placeholder: "ri.foundry.main.dataset.…" },
  { kind: "mediaset", label: "Media set", placeholder: "ri.mio.main.media-set.…::incidents.geojson" },
  { kind: "stream", label: "Stream", placeholder: "ri.foundry.main.dataset.… (streaming)" },
];

const DATASET_RID = /^ri\.foundry\.main\.dataset\.[0-9a-f-]{36}$/;
const MEDIA_SET_RID = /^ri\.mio\.main\.media-set\.[0-9a-f-]{36}$/;
const MEDIA_ITEM_RID = /^ri\.mio\.main\.media-item\.[0-9a-f-]{36}$/;

export function isMediaItemRid(value: string): boolean {
  return MEDIA_ITEM_RID.test(value);
}

/** A stable identity for a source: one per RID (and item). */
export function sourceKey(config: SourceConfig): string {
  return `${config.kind}:${config.rid}${config.item ? `::${config.item}` : ""}`;
}

export type ParsedSource = { ok: true; config: SourceConfig } | { ok: false; error: string };

export function parseSourceInput(
  kind: SourceKind,
  input: string,
  category?: EventCategory,
): ParsedSource {
  const text = input.trim();
  if (kind === "mediaset") {
    const [rid, ...rest] = text.split("::");
    const item = rest.join("::").trim();
    if (!MEDIA_SET_RID.test(rid.trim())) {
      return { ok: false, error: "Expected a media set RID: ri.mio.main.media-set.…" };
    }
    if (!item) {
      return {
        ok: false,
        error:
          "Media sets have no list endpoint, so name the item: add ::path (e.g. ::incidents.geojson) or ::its media item RID.",
      };
    }
    return { ok: true, config: { kind, rid: rid.trim(), item, category } };
  }
  if (!DATASET_RID.test(text)) {
    return {
      ok: false,
      error:
        kind === "stream"
          ? "Expected the streaming dataset's RID: ri.foundry.main.dataset.…"
          : "Expected a dataset RID: ri.foundry.main.dataset.…",
    };
  }
  return { ok: true, config: { kind, rid: text, category } };
}

/** `?dataset=…&mediaset=…&stream=…`, each repeatable. Invalid entries are dropped. */
export function sourcesFromSearch(search: string): SourceConfig[] {
  const params = new URLSearchParams(search);
  const configs: SourceConfig[] = [];
  for (const kind of ["dataset", "mediaset", "stream"] as const) {
    for (const value of params.getAll(kind)) {
      const parsed = parseSourceInput(kind, value);
      if (parsed.ok) {configs.push(parsed.config);}
    }
  }
  return dedupe(configs);
}

export function dedupe(configs: SourceConfig[]): SourceConfig[] {
  const seen = new Set<string>();
  return configs.filter((config) => {
    const key = sourceKey(config);
    if (seen.has(key)) {return false;}
    seen.add(key);
    return true;
  });
}

const STORAGE_KEY = "decho-events:sources";

/** Saved sources, or [] — storage can be missing, blocked or hold garbage. */
export function loadSavedSources(): SourceConfig[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {return [];}
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {return [];}
    return dedupe(
      parsed.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) {return [];}
        const { kind, rid, item, category, titleField } = entry as Record<string, unknown>;
        if (kind !== "dataset" && kind !== "mediaset" && kind !== "stream") {return [];}
        const result = parseSourceInput(
          kind,
          kind === "mediaset" ? `${String(rid)}::${String(item ?? "")}` : String(rid),
          typeof category === "string" ? (category as EventCategory) : undefined,
        );
        if (!result.ok) {return [];}
        return [
          typeof titleField === "string" && titleField !== ""
            ? { ...result.config, titleField }
            : result.config,
        ];
      }),
    );
  } catch {
    return [];
  }
}

export function saveSources(configs: SourceConfig[]): void {
  try {
    // Titles are kept separately (below), for sources from anywhere.
    const plain = configs.map(({ titleField: _title, ...config }) => config);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plain));
  } catch {
    // Private windows and locked-down browsers: the list just is not remembered.
  }
}

const TITLES_KEY = "decho-events:titles";

/**
 * Chosen title columns, by source key. Separate from the source list because
 * a title can be chosen for a source this browser did not add — one from
 * Workshop variables or the URL — and should still be remembered. Seeded
 * from `titleField`s the saved list carried before titles moved here.
 */
export function loadSavedTitles(saved: SourceConfig[] = []): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const config of saved) {
    if (config.titleField) {titles[sourceKey(config)] = config.titleField;}
  }
  try {
    const raw = window.localStorage.getItem(TITLES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value !== "") {titles[key] = value;}
      }
    }
  } catch {
    // As above.
  }
  return titles;
}

export function saveTitles(titles: Record<string, string>): void {
  try {
    window.localStorage.setItem(TITLES_KEY, JSON.stringify(titles));
  } catch {
    // As above.
  }
}
