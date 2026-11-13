/**
 * Where files come from. One interface, two backends:
 *
 *   HttpStore            a plain folder over HTTP — terrain-gen's out/ served
 *                        locally, or any static host.
 *   FoundryDatasetStore  a Foundry dataset, read through the platform's own
 *                        file-content API with the user's token.
 *
 * Foundry's file-content endpoint ignores HTTP Range, so a read is always a
 * whole file. That is why terrain-gen cuts archives to a size budget, and why
 * everything above this layer caches whole files.
 */
import type { FoundryConfig } from "../foundry/auth";

export interface FileStore {
  /** Stable identity, used in cache keys and error messages. */
  readonly key: string;
  /** The file's bytes, or null when it does not exist. Throws on anything else. */
  read(path: string, signal?: AbortSignal): Promise<ArrayBuffer | null>;
}

export class StoreAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "StoreAccessError";
  }
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export class HttpStore implements FileStore {
  readonly key: string;

  constructor(readonly baseUrl: string) {
    this.key = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }

  async read(path: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
    const url = new URL(encodePath(path), new URL(this.key, window.location.href));
    const res = await fetch(url, { signal });
    if (res.status === 404) {return null;}
    if (!res.ok) {throw new StoreAccessError(`${res.status} reading ${url}`, res.status);}
    return res.arrayBuffer();
  }
}

export class FoundryDatasetStore implements FileStore {
  readonly key: string;

  constructor(
    readonly datasetRid: string,
    private readonly config: FoundryConfig,
    readonly branch = "master",
  ) {
    this.key = `foundry:${datasetRid}@${branch}`;
  }

  async read(path: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
    const url =
      `${this.config.foundryUrl}/api/v2/datasets/${encodeURIComponent(this.datasetRid)}` +
      `/files/${encodeURIComponent(path)}/content?branchName=${encodeURIComponent(this.branch)}`;
    const token = await this.config.auth();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (res.status === 404) {return null;}
    if (res.status === 401 || res.status === 403) {
      throw new StoreAccessError(
        `No access to ${this.datasetRid} (${res.status}). The dataset must be added as a Resource on ` +
          "this application in Developer Console, and the app needs the api:use-datasets-read scope.",
        res.status,
      );
    }
    if (!res.ok) {throw new StoreAccessError(`${res.status} reading ${path} from ${this.datasetRid}`, res.status);}
    return res.arrayBuffer();
  }
}
