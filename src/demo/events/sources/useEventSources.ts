/**
 * Loads every configured source and keeps it current.
 *
 *   dataset, mediaset   read once; `reload(key)` reads again.
 *   stream              the recent tail on open, then a poll every
 *                       POLL_INTERVAL_MS from where the last read ended.
 *
 * Each source is interpreted on its own (its columns are its own), and the
 * page gets per-source state: status, what was found, what was skipped, what
 * each column was taken to mean, and — when it failed — why, in words.
 *
 * Removing a source from the list cancels its load or its polling. A source
 * that fails does not affect the others.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUILTIN_REGISTRY, type CategoryRegistry } from "../categories";
import type { MonitorEvent } from "../mockEvents";
import { sourceKey, type SourceConfig } from "./config";
import {
  describeSourceError,
  openStream,
  readDataset,
  readMediaSetItem,
  readStreamSince,
  readStreamTail,
  shortRid,
  type Offsets,
  type SourceProblem,
  type StreamHandle,
} from "./foundry";
import {
  detectFields,
  interpretRecords,
  severityScaleOf,
  withTitle,
  type FieldMap,
  type MonitorArea,
} from "./interpret";

export const POLL_INTERVAL_MS = 5_000;
/** A stream keeps its newest events up to this many; older ones drop off. */
export const STREAM_EVENT_CAP = 2_000;

export type SourceStatus = "loading" | "ready" | "live" | "error";

export interface SourceState {
  key: string;
  config: SourceConfig;
  status: SourceStatus;
  name: string;
  events: MonitorEvent[];
  areas: MonitorArea[];
  /** Records read in total, and how many had no usable location. */
  records: number;
  skipped: number;
  truncated: boolean;
  /** The mapping in use: detected, with the chosen title column applied. */
  fields: FieldMap | null;
  /** Every column the source has shown so far, for choosing a title from. */
  columns: string[];
  /** The title column detection chose, whatever is in use now. */
  detectedTitle?: string;
  problem?: SourceProblem;
  updatedAt?: number;
}

type Row = Record<string, unknown>;

function initialState(config: SourceConfig): SourceState {
  return {
    key: sourceKey(config),
    config,
    status: "loading",
    name: shortRid(config.rid),
    events: [],
    areas: [],
    records: 0,
    skipped: 0,
    truncated: false,
    fields: null,
    columns: [],
  };
}

export interface UseEventSources {
  states: SourceState[];
  reload: (key: string) => void;
}

export function useEventSources(
  configs: SourceConfig[],
  now: number,
  categories: CategoryRegistry = BUILTIN_REGISTRY,
): UseEventSources {
  const [states, setStates] = useState<Record<string, SourceState>>({});
  // Bumped to restart one source's load without touching the others.
  const [generation, setGeneration] = useState<Record<string, number>>({});
  const running = useRef(new Map<string, Run & { generation: number; titleField?: string }>());
  // Runs read their config through this, so a change that is not a reload —
  // the title column — reaches a run that is already going.
  const latest = useRef(new Map<string, SourceConfig>());
  latest.current = new Map(configs.map((config) => [sourceKey(config), config]));
  // Likewise the categories: custom ones can arrive (from Workshop) after a
  // source has loaded, and their keywords change what records sort into.
  const registry = useRef(categories);
  registry.current = categories;
  const getRegistry = useCallback(() => registry.current, []);

  const update = useCallback((key: string, patch: (state: SourceState) => SourceState) => {
    setStates((previous) => (previous[key] ? { ...previous, [key]: patch(previous[key]) } : previous));
  }, []);

  useEffect(() => {
    const wanted = new Map(configs.map((config) => [sourceKey(config), config]));

    // Stop what is no longer configured, or is being reloaded.
    for (const [key, run] of running.current) {
      if (!wanted.has(key) || run.generation !== (generation[key] ?? 0)) {
        run.stop();
        running.current.delete(key);
        if (!wanted.has(key)) {
          setStates((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
          });
        }
      }
    }

    // Start what is configured and not running; re-title what is running
    // and has had its title column changed.
    for (const [key, config] of wanted) {
      const run = running.current.get(key);
      if (run) {
        if (run.titleField !== config.titleField) {
          run.titleField = config.titleField;
          run.reinterpret();
        }
        continue;
      }
      setStates((previous) => ({ ...previous, [key]: initialState(config) }));
      const getConfig = () => latest.current.get(key) ?? config;
      const started =
        config.kind === "stream"
          ? runStream(getConfig, getRegistry, key, now, update)
          : runOnce(getConfig, getRegistry, key, now, update);
      running.current.set(key, {
        ...started,
        generation: generation[key] ?? 0,
        titleField: config.titleField,
      });
    }
  }, [configs, generation, now, update]);

  // New categories: everything loaded is read again against them.
  useEffect(() => {
    for (const run of running.current.values()) {run.reinterpret();}
  }, [categories]);

  // Stop everything on unmount.
  useEffect(() => {
    const runs = running.current;
    return () => {
      for (const run of runs.values()) {run.stop();}
      runs.clear();
    };
  }, []);

  const reload = useCallback((key: string) => {
    setGeneration((previous) => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }));
  }, []);

  // Memoised so the page's derived event list — and the map data behind it —
  // only changes when a source does, not on every render.
  // Each carries the current config, not the one it was started with: the
  // title column can change without restarting the source.
  const list = useMemo(
    () =>
      configs.map((config) => {
        const state = states[sourceKey(config)];
        return state ? { ...state, config } : initialState(config);
      }),
    [configs, states],
  );

  return { states: list, reload };
}

type Update = (key: string, patch: (state: SourceState) => SourceState) => void;

/** A running source: stop it, or re-read what it holds with the current config. */
interface Run {
  stop: () => void;
  reinterpret: () => void;
}

function interpret(
  config: SourceConfig,
  categories: CategoryRegistry,
  key: string,
  name: string,
  records: Row[],
  now: number,
  fields: FieldMap,
  options: { live?: boolean; firstIndex?: number; severityMax?: number } = {},
) {
  return interpretRecords(records, fields, {
    sourceKey: key,
    sourceLabel: name,
    defaultCategory: config.category,
    categories,
    now,
    ...options,
  });
}

function fieldNames(records: Row[]): string[] {
  const names = new Set<string>();
  for (const record of records.slice(0, 200)) {
    for (const name of Object.keys(record)) {names.add(name);}
  }
  return [...names];
}

/** Columns worth offering as a title: not the GeoJSON plumbing, not media. */
function titleCandidates(records: Row[], fields: FieldMap | null): string[] {
  const media = new Set(fields?.media ?? []);
  return fieldNames(records).filter((name) => !name.startsWith("__") && !media.has(name));
}

/** Datasets and media set items: one read, re-interpretable. */
function runOnce(
  getConfig: () => SourceConfig,
  getRegistry: () => CategoryRegistry,
  key: string,
  now: number,
  update: Update,
): Run {
  let cancelled = false;
  let loaded: { name: string; records: Row[]; truncated: boolean; detected: FieldMap } | null = null;

  const publish = () => {
    if (!loaded || cancelled) {return;}
    const config = getConfig();
    const fields = withTitle(loaded.detected, config.titleField);
    const { events, areas, skipped } = interpret(
      config,
      getRegistry(),
      key,
      loaded.name,
      loaded.records,
      now,
      fields,
    );
    const columns = titleCandidates(loaded.records, loaded.detected);
    update(key, (state) => ({
      ...state,
      status: "ready",
      name: loaded!.name,
      events,
      areas,
      records: loaded!.records.length,
      skipped,
      truncated: loaded!.truncated,
      fields,
      columns,
      detectedTitle: loaded!.detected.title,
      problem: fields.geo
        ? undefined
        : {
            title: "No location found",
            detail: `None of ${columns.length} columns held coordinates, a geopoint, GeoJSON or WKT.`,
            remediation: "Add latitude/longitude columns, or a geopoint or geometry column.",
          },
      updatedAt: Date.now(),
    }));
  };

  void (async () => {
    const config = getConfig();
    try {
      const result =
        config.kind === "dataset"
          ? await readDataset(config.rid)
          : await readMediaSetItem(config.rid, config.item ?? "");
      if (cancelled) {return;}
      loaded = {
        ...result,
        detected: detectFields(fieldNames(result.records), result.records),
      };
      publish();
    } catch (err) {
      if (cancelled) {return;}
      console.warn(`[events] ${key} failed to load:`, err);
      update(key, (state) => ({
        ...state,
        status: "error",
        problem: describeSourceError(err, config.kind),
      }));
    }
  })();

  return {
    stop: () => {
      cancelled = true;
    },
    reinterpret: publish,
  };
}

/** Streams: tail on open, then poll. */
function runStream(
  getConfig: () => SourceConfig,
  getRegistry: () => CategoryRegistry,
  key: string,
  now: number,
  update: Update,
): Run {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stream: StreamHandle | undefined;
  let offsets: Offsets = {};
  let detected: FieldMap | null = null;
  // Every record kept, oldest first: for re-detecting the columns while none
  // has located anything (a stream opened before its first record has nothing
  // to detect from), and for re-reading them all when the title changes.
  const seen: Row[] = [];
  // How many of `seen`, from the front, came from the tail read on open
  // rather than arriving live.
  let backfilled = 0;
  // Records ever ingested; `seen` holds the last `seen.length` of them.
  let ingested = 0;

  const effective = () => withTitle(detected!, getConfig().titleField);

  const problemFor = (fields: FieldMap) =>
    fields.geo
      ? undefined
      : {
          title: "No location found yet",
          detail: "No record so far has held coordinates, a geopoint, GeoJSON or WKT.",
        };

  const ingest = (records: Row[], live: boolean) => {
    if (records.length === 0) {return;}
    seen.push(...records);
    if (!live) {backfilled += records.length;}
    if (seen.length > STREAM_EVENT_CAP) {
      const dropped = seen.length - STREAM_EVENT_CAP;
      seen.splice(0, dropped);
      backfilled = Math.max(0, backfilled - dropped);
    }
    if (!detected?.geo) {
      detected = detectFields(fieldNames(seen), seen);
    }
    const fields = effective();
    const found = interpret(getConfig(), getRegistry(), key, stream!.name, records, now, fields, {
      live,
      firstIndex: ingested,
      severityMax: severityScaleOf(seen, fields),
    });
    ingested += records.length;
    const columns = titleCandidates(seen, detected);
    update(key, (state) => {
      // Records carrying an id replace the earlier version of themselves: a
      // stream of updates to one incident is one event that moves or changes.
      const byId = new Map(state.events.map((event) => [event.id, event]));
      for (const event of found.events) {byId.set(event.id, event);}
      const areasById = new Map(state.areas.map((area) => [area.id, area]));
      for (const area of found.areas) {areasById.set(area.id, area);}
      return {
        ...state,
        status: "live",
        name: stream!.name,
        events: newestFirst([...byId.values()]),
        areas: [...areasById.values()],
        records: state.records + records.length,
        skipped: state.skipped + found.skipped,
        fields,
        columns,
        detectedTitle: detected?.title,
        problem: problemFor(fields),
        updatedAt: Date.now(),
      };
    });
  };

  /** Everything kept, read again from scratch with the current config. */
  const reinterpret = () => {
    if (cancelled || !stream || !detected) {return;}
    const config = getConfig();
    const fields = effective();
    const severityMax = severityScaleOf(seen, fields);
    const first = ingested - seen.length;
    const categories = getRegistry();
    const tail = interpret(config, categories, key, stream.name, seen.slice(0, backfilled), now, fields, {
      live: false,
      firstIndex: first,
      severityMax,
    });
    const live = interpret(config, categories, key, stream.name, seen.slice(backfilled), now, fields, {
      live: true,
      firstIndex: first + backfilled,
      severityMax,
    });
    const byId = new Map([...tail.events, ...live.events].map((event) => [event.id, event]));
    const areasById = new Map([...tail.areas, ...live.areas].map((area) => [area.id, area]));
    update(key, (state) => ({
      ...state,
      events: newestFirst([...byId.values()]),
      areas: [...areasById.values()],
      fields,
      problem: problemFor(fields),
    }));
  };

  const poll = async () => {
    if (cancelled || !stream) {return;}
    try {
      const result = await readStreamSince(stream, offsets);
      if (cancelled) {return;}
      offsets = result.offsets;
      ingest(result.records, true);
    } catch (err) {
      // One failed poll is not a dead stream; keep trying.
      console.warn(`[events] ${key} poll failed:`, err);
    }
    if (!cancelled) {timer = setTimeout(poll, POLL_INTERVAL_MS);}
  };

  void (async () => {
    try {
      stream = await openStream(getConfig().rid);
      if (cancelled) {return;}
      const tail = await readStreamTail(stream);
      if (cancelled) {return;}
      offsets = tail.offsets;
      update(key, (state) => ({ ...state, status: "live", name: stream!.name, updatedAt: Date.now() }));
      ingest(tail.records, false);
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    } catch (err) {
      if (cancelled) {return;}
      console.warn(`[events] ${key} failed to open:`, err);
      update(key, (state) => ({
        ...state,
        status: "error",
        problem: describeSourceError(err, "stream"),
      }));
    }
  })();

  return {
    stop: () => {
      cancelled = true;
      if (timer) {clearTimeout(timer);}
    },
    reinterpret,
  };
}

function newestFirst(events: MonitorEvent[]): MonitorEvent[] {
  return events.sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, STREAM_EVENT_CAP);
}
