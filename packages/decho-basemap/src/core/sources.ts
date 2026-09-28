/**
 * FoundryRangeSource — a pmtiles `Source` backed by a Foundry dataset file.
 *
 * This is the whole point of the byte layer. PMTiles asks its Source for small
 * byte ranges (header, then a leaf directory, then a tile) and the Source is
 * free to satisfy those however it likes. The previous implementation
 * (`ArrayBufferSource` in TileLoader) satisfied them by downloading the entire
 * archive up front and slicing an in-memory buffer — correct, but it meant the
 * unit of transfer was a whole file, which is why the basemap had to be
 * pre-cut into 55 per-cell archives and why leaving the map open eventually
 * exhausted the tab.
 *
 * Here the unit of transfer is a byte range, so:
 *   - archive size stops being related to memory use;
 *   - one large archive works as well as many small ones;
 *   - there is nothing to schedule, evict or prefetch.
 *
 * If the Foundry endpoint turns out not to honour Range, foundryBytes detects
 * that on the first read and silently reverts to the old whole-file behaviour.
 * Nothing here changes.
 */

import type { RangeResponse, Source } from "pmtiles";

import { getMediaItem, getRange } from "@acc/decho-foundry-bytes";

export class FoundryRangeSource implements Source {
  constructor(
    private readonly datasetRid: string,
    private readonly filePath: string,
  ) {}

  /** Stable identity for PMTiles' internal directory cache. */
  getKey(): string {
    return `${this.datasetRid}/${this.filePath}`;
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
  ): Promise<RangeResponse> {
    const data = await getRange(
      this.datasetRid,
      this.filePath,
      offset,
      length,
      signal,
    );
    return { data };
  }
}

/**
 * PMTiles source over a media set item.
 *
 * The media content endpoint offers no Range support at all, so the whole item
 * is always the transfer unit — which is fine, because getMediaItem() owns the
 * caching (resident LRU + Cache Storage keyed by the immutable media item RID),
 * the path->RID memoisation and the concurrency lane. Every getBytes after the
 * first is a slice of an already-resident buffer.
 *
 * This replaced an earlier FoundryMediaRangeSource that duplicated the fetch
 * plumbing and had none of the above: it re-downloaded the entire item for
 * every header, directory and tile read.
 */
export class MediaItemSource implements Source {
  constructor(
    private readonly mediaSetRid: string,
    private readonly path: string,
  ) {}

  getKey(): string {
    return `${this.mediaSetRid}/${this.path}`;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const body = await getMediaItem(this.mediaSetRid, this.path);
    if (!body) {
      throw new Error(
        `Media item not found: ${this.path} in ${this.mediaSetRid}`,
      );
    }
    return { data: body.slice(offset, offset + length) };
  }
}
