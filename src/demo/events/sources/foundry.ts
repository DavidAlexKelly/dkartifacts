/**
 * Reading sources out of Foundry: tables, media set items and streams.
 *
 * The same three reads the davebettermap widget makes, each returning plain
 * records for interpret.ts to make sense of:
 *
 *   dataset   Datasets.readTable as CSV, capped at MAX_ROWS. The schema names
 *             the columns when the (beta) endpoint answers; otherwise the CSV
 *             header does.
 *   mediaset  through @acc/decho-foundry-bytes — the same cached, rate-limited
 *             byte layer the basemap reads its tiles with. GeoJSON, a JSON
 *             array of records, or CSV.
 *   stream    Streams.getRecords per partition: a tail read on open, so the
 *             map is not empty until something new arrives, then polling from
 *             the offsets that read ended at.
 *
 * Scopes. src/client.ts requests `api:use-datasets-read` only, which covers
 * tables. Media sets and streams need their own read scopes, and asking for a
 * scope the application is not granted fails sign-in outright — so they are
 * not requested by default, and a 403 from either says what to add.
 */

import { Datasets } from "@osdk/foundry.datasets";
import { Streams } from "@osdk/foundry.streams";
import {
  FoundryBytesError,
  describeFoundryError,
  getMediaItem,
  getMediaItemByRid,
} from "@acc/decho-foundry-bytes";
import client from "@/client";
import { parseCsv } from "./csv";
import { isMediaItemRid, type SourceKind } from "./config";
import { flattenRecord, recordsFromJson } from "./interpret";

type Row = Record<string, unknown>;

/** More than a map can usefully show as individual events. */
export const MAX_ROWS = 10_000;

export interface ReadResult {
  name: string;
  records: Row[];
  /** Rows beyond MAX_ROWS were not read. */
  truncated: boolean;
}

// ── Datasets ────────────────────────────────────────────────────────────────

async function datasetName(rid: string): Promise<string> {
  try {
    const dataset = await Datasets.get(client, rid);
    return dataset.name ?? shortRid(rid);
  } catch {
    return shortRid(rid);
  }
}

export async function readDataset(rid: string): Promise<ReadResult> {
  const [name, columns] = await Promise.all([
    datasetName(rid),
    Datasets.getSchema(client, rid)
      .then((response) =>
        response.schema.fieldSchemaList
          .map((field) => field.name)
          .filter((field): field is string => field != null),
      )
      // Beta, and absent on some stacks. An empty column list reads them all,
      // and the CSV header names them.
      .catch(() => [] as string[]),
  ]);
  const response = await Datasets.readTable(client, rid, {
    format: "CSV",
    columns,
    rowLimit: MAX_ROWS + 1,
  });
  const rows = parseCsv(await response.text());
  return {
    name,
    records: rows.slice(0, MAX_ROWS).map(flattenRecord),
    truncated: rows.length > MAX_ROWS,
  };
}

// ── Media sets ──────────────────────────────────────────────────────────────

export async function readMediaSetItem(mediaSetRid: string, item: string): Promise<ReadResult> {
  const bytes = isMediaItemRid(item)
    ? await getMediaItemByRid(mediaSetRid, item)
    : await getMediaItem(mediaSetRid, item);
  if (!bytes) {
    throw new SourceError("Item not found", `No item at "${item}" in this media set.`, "Check the path — it is case-sensitive and includes any folders.");
  }
  const text = new TextDecoder().decode(bytes);
  const name = isMediaItemRid(item) ? shortRid(item) : item.split("/").pop() ?? item;
  const records = /\.csv$/i.test(item) ? parseCsv(text) : recordsFromJson(JSON.parse(text));
  return {
    name,
    records: records.slice(0, MAX_ROWS).map(flattenRecord),
    truncated: records.length > MAX_ROWS,
  };
}

// ── Streams ─────────────────────────────────────────────────────────────────

export interface StreamHandle {
  rid: string;
  branch: string;
  name: string;
}

export type Offsets = Record<string, string>;

/** Streams live on a branch; the widget found them on master or main. */
const STREAM_BRANCHES = ["master", "main"];

export async function openStream(rid: string): Promise<StreamHandle> {
  let lastError: unknown;
  for (const branch of STREAM_BRANCHES) {
    try {
      await Streams.get(client, rid, branch);
      return { rid, branch, name: await datasetName(rid) };
    } catch (err) {
      lastError = err;
      // Access denied is the same on every branch; only "not here" is worth
      // trying the next one for.
      if (statusOf(err) === 403 || statusOf(err) === 401) {break;}
    }
  }
  throw lastError ?? new SourceError("Stream not found", `No stream on ${STREAM_BRANCHES.join(" or ")}.`);
}

async function endOffsets(stream: StreamHandle): Promise<Offsets> {
  return (await Streams.getEndOffsets(client, stream.rid, stream.branch, {
    preview: true,
  })) as Offsets;
}

async function readPartition(
  stream: StreamHandle,
  partitionId: string,
  startOffset: bigint,
  limit: number,
): Promise<{ records: Row[]; next: bigint }> {
  const response = await Streams.getRecords(client, stream.rid, stream.branch, {
    partitionId,
    startOffset: startOffset.toString(),
    limit,
    preview: true,
  });
  let next = startOffset;
  const records: Row[] = [];
  for (const record of response) {
    records.push(flattenRecord(record.value));
    const after = BigInt(record.offset) + 1n;
    if (after > next) {next = after;}
  }
  return { records, next };
}

/**
 * The last `perPartition` records of every partition, oldest first, and the
 * offsets to poll from next.
 */
export async function readStreamTail(
  stream: StreamHandle,
  perPartition = 500,
): Promise<{ records: Row[]; offsets: Offsets }> {
  const ends = await endOffsets(stream);
  const offsets: Offsets = {};
  const batches = await Promise.all(
    Object.entries(ends).map(async ([partitionId, end]) => {
      const endOffset = BigInt(end);
      offsets[partitionId] = end;
      if (endOffset <= 0n) {return [];}
      const start = endOffset > BigInt(perPartition) ? endOffset - BigInt(perPartition) : 0n;
      const { records } = await readPartition(stream, partitionId, start, perPartition);
      return records;
    }),
  );
  return { records: batches.flat(), offsets };
}

/** Everything published since `offsets`, up to `limit` per partition. */
export async function readStreamSince(
  stream: StreamHandle,
  offsets: Offsets,
  limit = 500,
): Promise<{ records: Row[]; offsets: Offsets }> {
  const ends = await endOffsets(stream);
  const next: Offsets = { ...offsets };
  const batches = await Promise.all(
    Object.entries(ends).map(async ([partitionId, end]) => {
      const start = BigInt(offsets[partitionId] ?? "0");
      if (start >= BigInt(end)) {return [];}
      const result = await readPartition(stream, partitionId, start, limit);
      next[partitionId] = result.next.toString();
      return result.records;
    }),
  );
  return { records: batches.flat(), offsets: next };
}

// ── Errors ──────────────────────────────────────────────────────────────────

export interface SourceProblem {
  title: string;
  detail: string;
  remediation?: string;
}

export class SourceError extends Error {
  constructor(
    readonly title: string,
    readonly detail: string,
    readonly remediation?: string,
  ) {
    super(`${title}: ${detail}`);
    this.name = "SourceError";
  }
}

/** HTTP status from an OSDK error, a foundry-bytes error or a message. */
function statusOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null) {
    const status = (err as { statusCode?: unknown; status?: unknown }).statusCode ??
      (err as { status?: unknown }).status;
    if (typeof status === "number") {return status;}
  }
  const match = /\b(401|403|404)\b/.exec(err instanceof Error ? err.message : String(err));
  return match ? Number(match[1]) : undefined;
}

const SCOPE_FOR: Record<SourceKind, string> = {
  dataset: "api:use-datasets-read",
  mediaset: "api:use-mediasets-read",
  stream: "api:use-streams-read",
};

const WHAT: Record<SourceKind, string> = {
  dataset: "the dataset",
  mediaset: "the media set",
  stream: "the streaming dataset",
};

export function describeSourceError(err: unknown, kind: SourceKind): SourceProblem {
  if (err instanceof SourceError) {
    return { title: err.title, detail: err.detail, remediation: err.remediation };
  }
  const status = statusOf(err);
  if (status === 401 || status === 403) {
    return {
      title: "Access denied",
      detail: `This application may not read ${WHAT[kind]}.`,
      remediation:
        kind === "dataset"
          ? `In Developer Console, add ${WHAT[kind]} to this application's Resources.`
          : `Add "${SCOPE_FOR[kind]}" to the scopes in src/client.ts, grant it to the application in Developer Console, and add ${WHAT[kind]} to its Resources.`,
    };
  }
  if (status === 404) {
    return {
      title: "Not found",
      detail: `No ${kind === "stream" ? "stream" : kind === "mediaset" ? "media item" : "dataset"} at that RID.`,
      remediation:
        kind === "stream"
          ? "Check the RID is a streaming dataset, and that its stream is on master or main."
          : "Check the RID — and for a media set, the item path.",
    };
  }
  if (err instanceof FoundryBytesError) {
    const { title, detail, remediation } = describeFoundryError(err);
    return { title, detail, remediation };
  }
  if (err instanceof SyntaxError) {
    return {
      title: "Not readable",
      detail: "The item is not valid JSON.",
      remediation: "Media set items are read as GeoJSON, a JSON array of records, or CSV (by a .csv path).",
    };
  }
  return {
    title: "Could not load",
    detail: err instanceof Error ? err.message : String(err),
  };
}

export function shortRid(rid: string): string {
  const tail = rid.split(".").pop() ?? rid;
  return `${rid.split(".").slice(-2, -1)[0] ?? ""} ${tail.slice(0, 8)}`.trim();
}
