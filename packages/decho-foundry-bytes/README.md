# @acc/decho-foundry-bytes

Reading large files out of Foundry datasets and media sets, from a browser,
well.

One access token with retry-on-401. A resident LRU with a byte budget. Cache
Storage keyed by dataset transaction RID, so a file is downloaded **once per
user, ever**. Request de-duplication with refcounted cancellation. Two
concurrency lanes, so a 25 MB archive cannot delay a 20 KB one.

Nothing here imports `maplibre-gl`, `pmtiles` or `react`, and nothing here knows
what a tile is.

## Quick start

```ts
import { configureFoundryBytes, getFile } from "@acc/decho-foundry-bytes";
import { auth, foundryUrl, platformClient } from "@/client";

configureFoundryBytes({ foundryUrl, getToken: auth, platformClient });   // once

const body = await getFile(datasetRid, "path/inside/dataset.bin");
```

That one call configures **every** package built on this one — basemap tiles,
pathfinding chunks, anything added later. They then share a token, both cache
tiers and the lanes, because they share this module.

| Function | For |
|---|---|
| `getFile(rid, path, signal?)` | A whole dataset file |
| `getFileOptional(rid, path, signal?)` | The same, but `null` on 404 — absence as a normal outcome |
| `getRange(rid, path, offset, length, signal?)` | A byte range, transparently faked when the platform ignores `Range` |
| `getJson(rid, path, signal?)` | A file, parsed as UTF-8 JSON |
| `getMediaItem(mediaSetRid, path)` | A media set item, path resolved and memoised |

## Why it exists as a package

All of this was written inside `@acc/decho-basemap`, and exported from it,
because a second package needed it: `@acc/decho-pathfinding` reads graph cells
the same way. Depending on the basemap to fetch bytes meant a headless consumer
— a routing worker, a Function, an app with no map at all — had to install a map
renderer and its `pmtiles` dependency to read a file.

So it is the bottom of the stack now, and depends on nothing above it.
`@acc/decho-basemap` re-exports this entire surface under its previous names
(`configureBasemap`, `BasemapError`, `describeBasemapError`, `isArchivePath`, …),
so nothing that imported it from there had to change.

## Why the transfer layer looks the way it does

Foundry's file-content endpoint **does not honour HTTP `Range`** — it answers
`200` with the whole body (measured on the Accenture enrollment, 2026-08-27).
Everything follows from that:

- large archives must be **pre-chunked**, because the transfer unit is a file;
- a single shared **probe** settles ranged-vs-whole-file before any read is
  issued, otherwise a screenful of concurrent readers each get their own full
  copy of the same archive;
- bodies are cached in an **LRU** (128 MB) over **Cache Storage** keyed by the
  dataset transaction RID, so a file is downloaded once per user, ever;
- concurrent readers of one file **share one request**, refcounted, so a
  caller's cancellation aborts the download only when every reader has gone;
- transfers run in **two lanes** — large files (4 at a time) and small ones (6)
  — so glyphs never queue behind a 25 MB basemap chunk or a 3 MB graph cell.

If the platform ever starts honouring `Range`, the probe detects it and the
whole-file path stops being used, with no code change.

### Lane classification

`.pmtiles` and `.bin` are treated as large; everything else as small. An
application whose big files are named otherwise supplies its own classifier:

```ts
configureFoundryBytes({ …, isLargeFile: (path) => path.endsWith(".parquet") });
```

A misclassification costs scheduling order, never correctness.

## Cache keys are storage identifiers

The Cache Storage name (`decho-basemap-v1`) and the index key
(`decho-basemap:cache-index/v1`) deliberately still say "basemap" even though
this code no longer lives there. They identify data already on users' disks —
potentially the whole cap's worth. Renaming them on extraction would orphan
every one of those entries: nothing would read them, nothing would prune them,
and every user would silently re-download what they already had.

## Errors

Typed, and carrying the RID and path so a consumer can name the resource that
needs granting:

```ts
import { describeFoundryError } from "@acc/decho-foundry-bytes";

const { title, detail, remediation, rid, path } = describeFoundryError(err);
```

The remediation copy lives in one place on purpose. The most common failure by
far is a 403 because the resource was not added to the application in Developer
Console under **Resources** — the OAuth scopes are necessary but not sufficient
— and every consumer was otherwise going to write its own guess at what a
failure means.

## Requirements on the consuming application

1. **Scopes:** `api:use-datasets-read`, plus `api:mediasets-read` for media sets.
2. **Resources:** every dataset read must be added as a Resource on the OAuth app
   in Developer Console. **The scopes alone return 403** — this is the single
   most common setup failure, and it is per dataset.
3. **Peers:** `@osdk/client`, `@osdk/foundry.datasets`, and
   `@osdk/foundry.mediasets` if you read media sets.

## Notes and limits

- Cache Storage is per-origin, so two apps on different Foundry subdomains do
  not share downloaded files.
- Only one copy of this package may be resolved in an application. Two would
  mean two token holders, two LRUs and two sets of lanes — which is why the
  harness aliases it explicitly in both `tsconfig.json` and `vite.config.ts`.

## Publishing

Same as the sibling packages, including the Code Workspace token dance that the
Artifacts UI's own instructions do not cover — see `@acc/decho-basemap`'s README.
Publish this one **first** when releasing a set: the others declare it as a peer.
