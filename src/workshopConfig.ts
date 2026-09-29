/**
 * The Workshop iframe config for this app.
 *
 * This harness is hosted as a website, which means Workshop can embed it as an
 * iframe widget pointed at any of its routes. When it does, the module author
 * gets the variables declared here — the same mechanism Mapplications uses,
 * and the same shape (`inputOutput`, so Workshop can drive the value and the
 * app can write it back) as its `mockDemo`.
 *
 *  artifactSwitching — bidirectional boolean, surfaced in Workshop as
 *                      "artifact-switching".
 *
 *    true (default) — the header offers the example switcher, and the embedded
 *                     app is a browsable catalogue of everything in packages/.
 *    false          — no switcher. The widget is pinned to the route it was
 *                     embedded on, which is what a module wants when it is
 *                     showing one app as part of a workflow rather than
 *                     offering the whole set.
 *
 * ── Why there is no special case for "not embedded" ─────────────────────────
 *
 * Outside an iframe, `useWorkshopContext` does not stay pending: it returns
 * LOADED immediately, populated with the defaults declared below. So the
 * hosted site and the dev server both see `artifactSwitching === true` through
 * exactly the same path as an unconfigured Workshop widget, and the switcher —
 * which is the only navigation the harness has — is there by default
 * everywhere.
 *
 * Worth knowing if the default is ever flipped back to false: that would also
 * strip the standalone demo of its navigation, and telling "not embedded"
 * apart from "embedded and switched off" needs `isInsideIframe()` from this
 * package, which deliberately reports false inside a Foundry container so a
 * Code Workspace preview counts as standalone.
 *
 *  eventCategories   — string list, read by the event monitor only: extra
 *                      categories, each "Label", "Label|#colour" or
 *                      "Label|#colour|keyword, keyword*". Data can be put
 *                      into them by keyword or by hand. See
 *                      src/demo/events/categories.ts.
 *
 *  selectedEvent     — string, both ways, read by the event monitor only: the
 *                      primary key of the selected event (its source's id
 *                      column; for mock events, "evt-0001"). Selecting an
 *                      event writes it, closing the selection clears it, and
 *                      a module that sets it selects that event and flies to
 *                      it — as soon as it has loaded, if it has not yet.
 *
 *  eventSpriteSet, eventStart{Latitude,Longitude,Zoom}, eventGlobe,
 *  eventTerrain, eventFitToDataOnLoad, eventClustering, eventClusterRadius,
 *  eventShowSettings, eventAllowSourceEditing, eventAllowCategoryEditing,
 *  eventFeedLength
 *                    — read by the event monitor only: its default look and
 *                      what users may change. Unset, each is what the page
 *                      does outside Workshop. See src/demo/events/appearance.ts.
 *
 *  eventDatasetRids, eventMediaSetInputs, eventStreamRids
 *                    — string lists, read by the event monitor (/events) only.
 *                      The same shapes as the davebettermap widget's
 *                      datasetRids / mediaSetInputs / streamRids, so a module
 *                      can feed both from one set of variables:
 *
 *      dataset   ri.foundry.main.dataset.<uuid>
 *      mediaset  ri.mio.main.media-set.<uuid>::<path or media item RID>
 *      stream    ri.foundry.main.dataset.<uuid>   (a streaming dataset)
 *
 * ── One context for the whole app ────────────────────────────────────────────
 *
 * An iframe widget has ONE config, whatever route it shows, so every field
 * lives in the one definition below. And `useWorkshopContext` is called once,
 * by `WorkshopShellProvider` at the top of the shell: each call negotiates
 * with Workshop on its own and keeps its own copy of the values, so a second
 * call would be a second, drifting copy. Everything else reads the provider.
 */

import React, { createContext, useContext } from "react";
import {
  useWorkshopContext,
  type IAsyncValue,
  type IConfigDefinition,
  type IWorkshopContext,
} from "@osdk/workshop-iframe-custom-widget";
import {
  parseSourceInput,
  type SourceConfig,
  type SourceKind,
} from "@/demo/events/sources/config";
import { parseCustomCategory, type CategoryDef } from "@/demo/events/categories";
import {
  DEFAULT_APPEARANCE,
  NUMBER_LIMITS,
  checkNumber,
  spritePathFrom,
  type EventAppearance,
  type NumberLimit,
} from "@/demo/events/appearance";

export const ARTIFACT_SHELL_CONFIG = [
  {
    fieldId: "artifactSwitching",
    field: {
      type: "single" as const,
      label: "artifact-switching",
      helperText:
        "Shows the dropdown in the header for switching between the example " +
        "apps — one per package in this repo. Turn it off to pin the widget " +
        "to the app it was embedded on.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "boolean" as const, defaultValue: true },
      },
    },
  },
  {
    fieldId: "eventDatasetRids",
    field: {
      type: "single" as const,
      label: "event-monitor-dataset-rids",
      helperText:
        "Event monitor (/events): dataset RIDs to load events from, one per " +
        "entry — ri.foundry.main.dataset.…. Each needs to be a Resource on " +
        "the application in Developer Console.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "string-list" as const, defaultValue: [] as string[] },
      },
    },
  },
  {
    fieldId: "eventMediaSetInputs",
    field: {
      type: "single" as const,
      label: "event-monitor-media-set-inputs",
      helperText:
        "Event monitor (/events): media set items to load, one per entry, as " +
        "mediaSetRid::path (e.g. ::zones.geojson) or " +
        "mediaSetRid::mediaItemRid. GeoJSON, a JSON array of records, or CSV.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "string-list" as const, defaultValue: [] as string[] },
      },
    },
  },
  {
    fieldId: "eventStreamRids",
    field: {
      type: "single" as const,
      label: "event-monitor-stream-rids",
      helperText:
        "Event monitor (/events): streaming dataset RIDs to follow live, one " +
        "per entry — ri.foundry.main.dataset.…. Read on open, then polled " +
        "every few seconds.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "string-list" as const, defaultValue: [] as string[] },
      },
    },
  },
  {
    fieldId: "eventCategories",
    field: {
      type: "single" as const,
      label: "event-monitor-categories",
      helperText:
        "Event monitor (/events): extra categories, one per entry, as Label, " +
        "Label|#colour or Label|#colour|keyword, keyword*. Records whose " +
        "category, title or summary contain a keyword are sorted into it; " +
        "anything can also be put into it by hand on the page.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "string-list" as const, defaultValue: [] as string[] },
      },
    },
  },
  {
    fieldId: "selectedEvent",
    field: {
      type: "single" as const,
      label: "selected-event",
      helperText:
        "Event monitor (/events): the primary key of the selected event — its " +
        "source's id column. Written when someone selects an event, cleared " +
        "when they close it; set it from the module to select that event.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "string" as const },
      },
    },
  },
  {
    fieldId: "eventSpriteSet",
    field: {
      type: "single" as const,
      label: "event-monitor-sprite-set",
      helperText:
        "Event monitor (/events): the basemap's sprite set — a path in " +
        "the assets dataset such as sprites/light, or just its name " +
        "(light, dark).",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "string" as const, defaultValue: "sprites/light" },
      },
    },
  },
  {
    fieldId: "eventStartLatitude",
    field: {
      type: "single" as const,
      label: "event-monitor-start-latitude",
      helperText:
        "Event monitor (/events): latitude the map opens on, and " +
        "returns to on Reset view.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "number" as const, defaultValue: 38 },
      },
    },
  },
  {
    fieldId: "eventStartLongitude",
    field: {
      type: "single" as const,
      label: "event-monitor-start-longitude",
      helperText:
        "Event monitor (/events): longitude the map opens on, and " +
        "returns to on Reset view.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "number" as const, defaultValue: 25 },
      },
    },
  },
  {
    fieldId: "eventStartZoom",
    field: {
      type: "single" as const,
      label: "event-monitor-start-zoom",
      helperText:
        "Event monitor (/events): zoom the map opens at, 0 (whole " +
        "world) to 22.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "number" as const, defaultValue: 2.3 },
      },
    },
  },
  {
    fieldId: "eventGlobe",
    field: {
      type: "single" as const,
      label: "event-monitor-globe",
      helperText:
        "Event monitor (/events): start on the globe projection rather " +
        "than a flat map. Users can still switch it in settings.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "boolean" as const, defaultValue: true },
      },
    },
  },
  {
    fieldId: "eventTerrain",
    field: {
      type: "single" as const,
      label: "event-monitor-terrain",
      helperText:
        "Event monitor (/events): start with 3D terrain on. Users can " +
        "still switch it in settings.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "boolean" as const, defaultValue: true },
      },
    },
  },
  {
    fieldId: "eventFitToDataOnLoad",
    field: {
      type: "single" as const,
      label: "event-monitor-fit-to-data-on-load",
      helperText:
        "Event monitor (/events): once the data has loaded, frame it " +
        "all instead of staying at the start view.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "boolean" as const, defaultValue: false },
      },
    },
  },
  {
    fieldId: "eventClustering",
    field: {
      type: "single" as const,
      label: "event-monitor-clustering",
      helperText:
        "Event monitor (/events): group nearby events into clusters " +
        "when zoomed out. Off draws every event on its own.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "boolean" as const, defaultValue: true },
      },
    },
  },
  {
    fieldId: "eventClusterRadius",
    field: {
      type: "single" as const,
      label: "event-monitor-cluster-radius",
      helperText:
        "Event monitor (/events): how close events must be, in screen " +
        "pixels, to merge into a cluster (1–200).",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "number" as const, defaultValue: 50 },
      },
    },
  },
  {
    fieldId: "eventShowSettings",
    field: {
      type: "single" as const,
      label: "event-monitor-show-settings",
      helperText:
        "Event monitor (/events): show the Settings button — sources, " +
        "filters, categories and the feed. Off leaves just the map.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "boolean" as const, defaultValue: true },
      },
    },
  },
  {
    fieldId: "eventAllowSourceEditing",
    field: {
      type: "single" as const,
      label: "event-monitor-allow-source-editing",
      helperText:
        "Event monitor (/events): let users add and remove sources and " +
        "switch mock events. Off uses only the sources set by the " +
        "module.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "boolean" as const, defaultValue: true },
      },
    },
  },
  {
    fieldId: "eventAllowCategoryEditing",
    field: {
      type: "single" as const,
      label: "event-monitor-allow-category-editing",
      helperText:
        "Event monitor (/events): let users put events, sources and " +
        "values into categories. Off shows categories as detected.",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "boolean" as const, defaultValue: true },
      },
    },
  },
  {
    fieldId: "eventFeedLength",
    field: {
      type: "single" as const,
      label: "event-monitor-feed-length",
      helperText:
        "Event monitor (/events): how many events the Latest list shows " +
        "(0 hides it, up to 500).",
      fieldValue: {
        type: "inputOutput" as const,
        variableType: { type: "number" as const, defaultValue: 40 },
      },
    },
  },
] as const satisfies IConfigDefinition;

export type ArtifactShellContext = IAsyncValue<
  IWorkshopContext<typeof ARTIFACT_SHELL_CONFIG>
>;

/**
 * The decision, as a plain function of the context.
 *
 * Separated from the hook so it can be tested without standing up a DOM, and
 * so the one non-obvious case — what to do before Workshop has answered — is
 * written down somewhere a test can reach.
 */
export function resolveArtifactSwitching(context: ArtifactShellContext): boolean {
  if (context.status !== "LOADED" && context.status !== "RELOADING") {
    // Still negotiating with Workshop, which only happens when embedded.
    // Hide it: a module that turned the switcher off should not see it appear
    // for a frame and then vanish, and a late control is less alarming than a
    // disappearing one.
    return false;
  }

  const field = context.value.artifactSwitching.fieldValue;
  return field.status === "LOADED" ? field.value ?? true : true;
}

// ── The one context ─────────────────────────────────────────────────────────

/**
 * What a page outside the provider sees — a render test, say: exactly what an
 * unembedded app gets from the hook, the declared defaults, already loaded.
 */
const STANDALONE: ArtifactShellContext = {
  status: "LOADED",
  value: {
    artifactSwitching: { fieldValue: { status: "LOADED", value: true } },
    eventDatasetRids: { fieldValue: { status: "LOADED", value: [] } },
    eventMediaSetInputs: { fieldValue: { status: "LOADED", value: [] } },
    eventStreamRids: { fieldValue: { status: "LOADED", value: [] } },
    eventCategories: { fieldValue: { status: "LOADED", value: [] } },
    selectedEvent: {
      fieldValue: { status: "LOADED", value: undefined },
      // Nobody to tell: writes go nowhere outside the provider.
      setLoadedValue: () => undefined,
    },
    eventSpriteSet: { fieldValue: { status: "LOADED", value: "sprites/light" } },
    eventStartLatitude: { fieldValue: { status: "LOADED", value: 38 } },
    eventStartLongitude: { fieldValue: { status: "LOADED", value: 25 } },
    eventStartZoom: { fieldValue: { status: "LOADED", value: 2.3 } },
    eventGlobe: { fieldValue: { status: "LOADED", value: true } },
    eventTerrain: { fieldValue: { status: "LOADED", value: true } },
    eventFitToDataOnLoad: { fieldValue: { status: "LOADED", value: false } },
    eventClustering: { fieldValue: { status: "LOADED", value: true } },
    eventClusterRadius: { fieldValue: { status: "LOADED", value: 50 } },
    eventShowSettings: { fieldValue: { status: "LOADED", value: true } },
    eventAllowSourceEditing: { fieldValue: { status: "LOADED", value: true } },
    eventAllowCategoryEditing: { fieldValue: { status: "LOADED", value: true } },
    eventFeedLength: { fieldValue: { status: "LOADED", value: 40 } },
  },
} as unknown as ArtifactShellContext;

const ShellWorkshopContext = createContext<ArtifactShellContext>(STANDALONE);

/** Negotiates with Workshop once, for everything under it. */
export function WorkshopShellProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const context = useWorkshopContext<typeof ARTIFACT_SHELL_CONFIG>(ARTIFACT_SHELL_CONFIG);
  return React.createElement(ShellWorkshopContext.Provider, { value: context }, children);
}

/** Whether the header should offer the example switcher. */
export function useArtifactSwitching(): boolean {
  return resolveArtifactSwitching(useContext(ShellWorkshopContext));
}

// ── Event monitor sources ───────────────────────────────────────────────────

export interface WorkshopEventSources {
  /**
   * "pending" while an embedding Workshop has not answered yet — the page
   * should neither show its mock data nor load anything until it has.
   */
  status: "pending" | "ready";
  sources: SourceConfig[];
  /** Entries that are not a valid RID for their variable, and why. */
  invalid: Array<{ variable: string; entry: string; error: string }>;
}

const EVENT_SOURCE_FIELDS: Array<{
  fieldId: "eventDatasetRids" | "eventMediaSetInputs" | "eventStreamRids";
  kind: SourceKind;
  label: string;
}> = [
  { fieldId: "eventDatasetRids", kind: "dataset", label: "event-monitor-dataset-rids" },
  { fieldId: "eventMediaSetInputs", kind: "mediaset", label: "event-monitor-media-set-inputs" },
  { fieldId: "eventStreamRids", kind: "stream", label: "event-monitor-stream-rids" },
];

/** The event monitor's sources, as a plain function of the context. */
export function resolveEventSources(context: ArtifactShellContext): WorkshopEventSources {
  if (context.status !== "LOADED" && context.status !== "RELOADING") {
    return {
      // A rejected config will not get better by waiting: carry on without.
      status: context.status === "FAILED" ? "ready" : "pending",
      sources: [],
      invalid: [],
    };
  }
  const sources: SourceConfig[] = [];
  const invalid: WorkshopEventSources["invalid"] = [];
  for (const { fieldId, kind, label } of EVENT_SOURCE_FIELDS) {
    const field = context.value[fieldId].fieldValue;
    const entries =
      field.status === "LOADED" || field.status === "RELOADING" ? field.value ?? [] : [];
    for (const entry of entries) {
      if (typeof entry !== "string" || entry.trim() === "") {continue;}
      const parsed = parseSourceInput(kind, entry);
      if (parsed.ok) {sources.push(parsed.config);}
      else {invalid.push({ variable: label, entry, error: parsed.error });}
    }
  }
  return { status: "ready", sources, invalid };
}

export function useWorkshopEventSources(): WorkshopEventSources {
  return resolveEventSources(useContext(ShellWorkshopContext));
}

// ── Event monitor categories ────────────────────────────────────────────────

export interface WorkshopEventCategories {
  categories: CategoryDef[];
  /** Entries that could not be read, and why. */
  invalid: Array<{ variable: string; entry: string; error: string }>;
}

/** The custom categories, as a plain function of the context. */
export function resolveEventCategories(context: ArtifactShellContext): WorkshopEventCategories {
  if (context.status !== "LOADED" && context.status !== "RELOADING") {
    return { categories: [], invalid: [] };
  }
  const field = context.value.eventCategories.fieldValue;
  const entries =
    field.status === "LOADED" || field.status === "RELOADING" ? field.value ?? [] : [];
  const categories: CategoryDef[] = [];
  const invalid: WorkshopEventCategories["invalid"] = [];
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {return;}
    const parsed = parseCustomCategory(entry, index);
    if (!parsed.ok) {
      invalid.push({ variable: "event-monitor-categories", entry, error: parsed.error });
    } else if (seen.has(parsed.def.id)) {
      invalid.push({
        variable: "event-monitor-categories",
        entry,
        error: `"${parsed.def.label}" is already defined above.`,
      });
    } else {
      seen.add(parsed.def.id);
      categories.push(parsed.def);
    }
  });
  return { categories, invalid };
}

export function useWorkshopEventCategories(): WorkshopEventCategories {
  return resolveEventCategories(useContext(ShellWorkshopContext));
}

// ── Selected event ──────────────────────────────────────────────────────────

export interface WorkshopSelectedEvent {
  /** "pending" until an embedding Workshop has answered. */
  status: "pending" | "ready";
  /** The primary key the variable holds, or undefined when nothing is selected. */
  value: string | undefined;
}

export function resolveSelectedEvent(context: ArtifactShellContext): WorkshopSelectedEvent {
  if (context.status !== "LOADED" && context.status !== "RELOADING") {
    return { status: context.status === "FAILED" ? "ready" : "pending", value: undefined };
  }
  const field = context.value.selectedEvent.fieldValue;
  const value =
    field.status === "LOADED" || field.status === "RELOADING" ? field.value : undefined;
  return { status: "ready", value: typeof value === "string" && value !== "" ? value : undefined };
}

/** The variable, and a setter that writes it back to Workshop (undefined clears it). */
export function useWorkshopSelectedEvent(): WorkshopSelectedEvent & {
  set: (value: string | undefined) => void;
} {
  const context = useContext(ShellWorkshopContext);
  const loaded = context.status === "LOADED" || context.status === "RELOADING";
  const setter = loaded ? context.value.selectedEvent.setLoadedValue : undefined;
  return {
    ...resolveSelectedEvent(context),
    set: (value) => setter?.(value === "" ? undefined : value),
  };
}

// ── Event monitor look and feel ─────────────────────────────────────────────

export interface WorkshopEventAppearance {
  /** "pending" until an embedding Workshop has answered. */
  status: "pending" | "ready";
  appearance: EventAppearance;
  /** Values that could not be used (the default stands in), and why. */
  invalid: Array<{ variable: string; entry: string; error: string }>;
}

type AppearanceField =
  | "eventSpriteSet"
  | "eventStartLatitude"
  | "eventStartLongitude"
  | "eventStartZoom"
  | "eventGlobe"
  | "eventTerrain"
  | "eventFitToDataOnLoad"
  | "eventClustering"
  | "eventClusterRadius"
  | "eventShowSettings"
  | "eventAllowSourceEditing"
  | "eventAllowCategoryEditing"
  | "eventFeedLength";

/** The event monitor's look and feel, as a plain function of the context. */
export function resolveEventAppearance(context: ArtifactShellContext): WorkshopEventAppearance {
  if (context.status !== "LOADED" && context.status !== "RELOADING") {
    return {
      status: context.status === "FAILED" ? "ready" : "pending",
      appearance: DEFAULT_APPEARANCE,
      invalid: [],
    };
  }
  const invalid: WorkshopEventAppearance["invalid"] = [];
  const read = (fieldId: AppearanceField): unknown => {
    // Optional: a Workshop that has not caught up with a newly added field
    // may leave it out of what it sends, and that must read as unset.
    const field = (context.value as Partial<typeof context.value>)[fieldId]?.fieldValue;
    return field?.status === "LOADED" || field?.status === "RELOADING" ? field.value : undefined;
  };
  const label = (fieldId: AppearanceField) =>
    ARTIFACT_SHELL_CONFIG.find((entry) => entry.fieldId === fieldId)?.field.label ?? fieldId;
  const flag = (fieldId: AppearanceField, fallback: boolean): boolean => {
    const value = read(fieldId);
    return typeof value === "boolean" ? value : fallback;
  };
  const number = (fieldId: AppearanceField, limit: NumberLimit, fallback: number): number => {
    const value = read(fieldId);
    // Cleared in Workshop: the default, without complaint.
    if (value == null) {return fallback;}
    const checked = checkNumber(Number(value), limit);
    if (checked.ok) {return checked.value;}
    invalid.push({ variable: label(fieldId), entry: String(value), error: checked.error });
    return fallback;
  };
  const sprite = read("eventSpriteSet");
  const defaults = DEFAULT_APPEARANCE;
  return {
    status: "ready",
    appearance: {
      spritePath: (typeof sprite === "string" && spritePathFrom(sprite)) || defaults.spritePath,
      startView: {
        lat: number("eventStartLatitude", NUMBER_LIMITS.lat, defaults.startView.lat),
        lon: number("eventStartLongitude", NUMBER_LIMITS.lon, defaults.startView.lon),
        zoom: number("eventStartZoom", NUMBER_LIMITS.zoom, defaults.startView.zoom),
      },
      globe: flag("eventGlobe", defaults.globe),
      terrain: flag("eventTerrain", defaults.terrain),
      fitToDataOnLoad: flag("eventFitToDataOnLoad", defaults.fitToDataOnLoad),
      clustering: flag("eventClustering", defaults.clustering),
      clusterRadius: number("eventClusterRadius", NUMBER_LIMITS.clusterRadius, defaults.clusterRadius),
      showSettings: flag("eventShowSettings", defaults.showSettings),
      allowSourceEditing: flag("eventAllowSourceEditing", defaults.allowSourceEditing),
      allowCategoryEditing: flag("eventAllowCategoryEditing", defaults.allowCategoryEditing),
      feedLength: number("eventFeedLength", NUMBER_LIMITS.feedLength, defaults.feedLength),
    },
    invalid,
  };
}

export function useWorkshopEventAppearance(): WorkshopEventAppearance {
  return resolveEventAppearance(useContext(ShellWorkshopContext));
}
