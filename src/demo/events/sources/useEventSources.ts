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
  fields: FieldMap | null;
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
  };
}

export interface UseEventSources {
  states: SourceState[];
  reload: (key: string) => void;
}

export function useEventSources(configs: SourceConfig[], now: number): UseEventSources {
  const [states, setStates] = useState<Record<string, SourceState>>({});
  // Bumped to restart one source's load without touching the others.
  const [generation, setGeneration] = useState<Record<string, number>>({});
  const running = useRef(new Map<string, { generation: number; stop: () => void }>());

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

    // Start what is configured and not running.
    for (const [key, config] of wanted) {
      if (running.current.has(key)) {continue;}
      setStates((previous) => ({ ...previous, [key]: initialState(config) }));
      const stop =
        config.kind === "stream"
          ? runStream(config, key, now, update)
          : runOnce(config, key, now, update);
      running.current.set(key, { generation: generation[key] ?? 0, stop });
    }
  }, [configs, generation, now, update]);

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
  const list = useMemo(
    () => configs.map((config) => states[sourceKey(config)] ?? initialState(config)),
    [configs, states],
  );

  return { states: list, reload };
}

type Update = (key: string, patch: (state: SourceState) => SourceState) => void;

function interpret(
  config: SourceConfig,
  key: string,
  name: string,
  records: Row[],
  now: number,
  fields: FieldMap,
  options: { live?: boolean; firstIndex?: number } = {},
) {
  return interpretRecords(records, fields, {
    sourceKey: key,
    sourceLabel: name,
    defaultCategory: config.category,
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

/** Datasets and media set items: one read. */
function runOnce(config: SourceConfig, key: string, now: number, update: Update): () => void {
  let cancelled = false;
  void (async () => {
    try {
      const result =
        config.kind === "dataset"
          ? await readDataset(config.rid)
          : await readMediaSetItem(config.rid, config.item ?? "");
      if (cancelled) {return;}
      const fields = detectFields(fieldNames(result.records), result.records);
      const { events, areas, skipped } = interpret(config, key, result.name, result.records, now, fields);
      update(key, (state) => ({
        ...state,
        status: "ready",
        name: result.name,
        events,
        areas,
        records: result.records.length,
        skipped,
        truncated: result.truncated,
        fields,
        problem: fields.geo
          ? undefined
          : {
              title: "No location found",
              detail: `None of ${fieldNames(result.records).length} columns held coordinates, a geopoint, GeoJSON or WKT.`,
              remediation: "Add latitude/longitude columns, or a geopoint or geometry column.",
            },
        updatedAt: Date.now(),
      }));
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
  return () => {
    cancelled = true;
  };
}

/** Streams: tail on open, then poll. */
function runStream(config: SourceConfig, key: string, now: number, update: Update): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stream: StreamHandle | undefined;
  let offsets: Offsets = {};
  let fields: FieldMap | null = null;
  // Every record seen, newest last, for re-detecting the columns while none
  // located anything: a stream opened before its first record has nothing
  // to detect from.
  const seen: Row[] = [];
  let ingested = 0;

  const ingest = (records: Row[], live: boolean) => {
    if (records.length === 0) {return;}
    seen.push(...records);
    if (seen.length > STREAM_EVENT_CAP) {seen.splice(0, seen.length - STREAM_EVENT_CAP);}
    if (!fields?.geo) {
      fields = detectFields(fieldNames(seen), seen);
    }
    const found = interpret(config, key, stream!.name, records, now, fields, {
      live,
      firstIndex: ingested,
    });
    ingested += records.length;
    update(key, (state) => {
      // Records carrying an id replace the earlier version of themselves: a
      // stream of updates to one incident is one event that moves or changes.
      const byId = new Map(state.events.map((event) => [event.id, event]));
      for (const event of found.events) {byId.set(event.id, event);}
      const areasById = new Map(state.areas.map((area) => [area.id, area]));
      for (const area of found.areas) {areasById.set(area.id, area);}
      const events = [...byId.values()]
        .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
        .slice(0, STREAM_EVENT_CAP);
      return {
        ...state,
        status: "live",
        name: stream!.name,
        events,
        areas: [...areasById.values()],
        records: state.records + records.length,
        skipped: state.skipped + found.skipped,
        fields,
        problem: fields?.geo
          ? undefined
          : {
              title: "No location found yet",
              detail: "No record so far has held coordinates, a geopoint, GeoJSON or WKT.",
            },
        updatedAt: Date.now(),
      };
    });
  };

  const poll = async () => {
    if (cancelled || !stream) {return;}
    try {
      const result = await readStreamSince(stream, offsets);
      if (cancelled) {return;}
      offsets = result.offsets;
      ingest(result.records, true);
    } catch (err) {
      // One failed poll is not a dead stream; say so and keep trying.
      console.warn(`[events] ${key} poll failed:`, err);
    }
    if (!cancelled) {timer = setTimeout(poll, POLL_INTERVAL_MS);}
  };

  void (async () => {
    try {
      stream = await openStream(config.rid);
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

  return () => {
    cancelled = true;
    if (timer) {clearTimeout(timer);}
  };
}
