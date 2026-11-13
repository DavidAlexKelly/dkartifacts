/**
 * The Library: one connection to a catalog, and everything read through it.
 *
 * A connection is either
 *   { kind: "http", baseUrl }        terrain-gen's out/ folder over HTTP:
 *                                    catalog/catalog.json, then one folder
 *                                    per layer, named by the entry's `folder`
 *   { kind: "foundry", catalogRid }  the catalog dataset in Foundry: its
 *                                    catalog.json, then one dataset per layer,
 *                                    named by the entry's `datasetRid`
 *
 * Everything above this — tiles, glyphs, elevation — asks the Library for a
 * layer's manifest and files, and never knows which backend it is on.
 */
import { PMTiles, type Source } from "pmtiles";
import type { FoundryConfig } from "../foundry/auth";
import { readFile, readJson } from "./cache";
import { parseManifest, pyramidResolver, type LayerManifest, type PyramidResolver } from "./manifest";
import { FoundryDatasetStore, HttpStore, type FileStore } from "./stores";

export type Connection = { kind: "http"; baseUrl: string } | { kind: "foundry"; catalogRid: string };

export interface CatalogEntry {
  id: string;
  kind: string;
  title: string;
  folder?: string;
  datasetRid?: string | null;
  manifestPath?: string;
  manifestSha256?: string;
  bounds?: [number, number, number, number] | null;
  encoding?: Record<string, unknown>;
  attribution?: string;
  dependsOn?: string[];
  files?: number;
  bytes?: number;
}

export interface Catalog {
  title: string;
  layers: CatalogEntry[];
}

export function describeConnection(c: Connection): string {
  return c.kind === "http" ? c.baseUrl : `Foundry ${c.catalogRid}`;
}

/** A pmtiles Source over a whole file, read once through the cache. */
class WholeFileSource implements Source {
  private body: Promise<ArrayBuffer>;

  constructor(
    private readonly key: string,
    load: () => Promise<ArrayBuffer | null>,
  ) {
    this.body = load().then((buf) => {
      if (!buf) {throw new Error(`archive ${key} is listed in its manifest but missing`);}
      return buf;
    });
  }

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number) {
    const buf = await this.body;
    return { data: buf.slice(offset, offset + length) };
  }
}

export class Library {
  readonly catalog: Catalog;
  private readonly root: FileStore;
  private manifests = new Map<string, Promise<LayerManifest>>();
  private resolvers = new Map<string, PyramidResolver>();
  private archives = new Map<string, PMTiles>();

  private constructor(
    readonly connection: Connection,
    private readonly foundry: FoundryConfig | null,
    root: FileStore,
    catalog: Catalog,
  ) {
    this.root = root;
    this.catalog = catalog;
  }

  static async open(connection: Connection, foundry: FoundryConfig | null): Promise<Library> {
    let root: FileStore;
    let catalogPath: string;
    if (connection.kind === "http") {
      root = new HttpStore(connection.baseUrl);
      catalogPath = "catalog/catalog.json";
    } else {
      if (!foundry) {throw new Error("This build is not configured for Foundry (no osdk-* meta tags).");}
      root = new FoundryDatasetStore(connection.catalogRid, foundry);
      catalogPath = "catalog.json";
    }
    const raw = await readJson<{ title?: string; layers?: CatalogEntry[] }>(root, catalogPath);
    if (!raw) {throw new Error(`No ${catalogPath} in ${describeConnection(connection)}. Run terrain-gen's catalog step.`);}
    if (!Array.isArray(raw.layers)) {throw new Error(`${catalogPath} has no layers list`);}
    return new Library(connection, foundry, root, { title: raw.title ?? "Catalog", layers: raw.layers });
  }

  entry(id: string): CatalogEntry | undefined {
    return this.catalog.layers.find((l) => l.id === id);
  }

  /** Why an entry cannot be read, or null if it can. */
  unavailable(entry: CatalogEntry): string | null {
    if (this.connection.kind === "foundry" && !entry.datasetRid) {
      return "No dataset RID in the catalog yet — upload it and rebuild the catalog with --rids.";
    }
    if (this.connection.kind === "http" && !entry.folder) {return "The catalog entry has no folder.";}
    return null;
  }

  storeFor(entry: CatalogEntry): FileStore {
    if (this.connection.kind === "http") {
      return new HttpStore(new URL(`${encodeURIComponent(entry.folder ?? entry.id)}/`, new URL(this.root.key, window.location.href)).href);
    }
    if (!entry.datasetRid || !this.foundry) {throw new Error(this.unavailable(entry) ?? "no Foundry config");}
    return new FoundryDatasetStore(entry.datasetRid, this.foundry);
  }

  manifest(id: string): Promise<LayerManifest> {
    let pending = this.manifests.get(id);
    if (!pending) {
      const entry = this.entry(id);
      pending = (async () => {
        if (!entry) {throw new Error(`no layer ${id} in the catalog`);}
        const why = this.unavailable(entry);
        if (why) {throw new Error(why);}
        const path = entry.manifestPath ?? "manifest.json";
        const raw = await readJson<unknown>(this.storeFor(entry), path, entry.manifestSha256);
        if (!raw) {throw new Error(`${id}: ${path} not found`);}
        const m = parseManifest(raw, id);
        if (m.layers) {this.resolvers.set(id, pyramidResolver(m));}
        return m;
      })();
      this.manifests.set(id, pending);
      pending.catch(() => this.manifests.delete(id));
    }
    return pending;
  }

  /** The resolver of a pyramid layer whose manifest has already loaded. */
  resolver(id: string): PyramidResolver | undefined {
    return this.resolvers.get(id);
  }

  readFile(id: string, path: string, sha256?: string): Promise<ArrayBuffer | null> {
    const entry = this.entry(id);
    if (!entry) {return Promise.reject(new Error(`no layer ${id}`));}
    return readFile(this.storeFor(entry), path, sha256);
  }

  /** One tile's bytes (decompressed), or null where the pyramid has none. */
  async tile(id: string, z: number, x: number, y: number): Promise<ArrayBuffer | null> {
    await this.manifest(id);
    const resolved = this.resolvers.get(id)?.pathForTile(z, x, y);
    if (!resolved) {return null;}
    const key = `${id}/${resolved.path}`;
    let archive = this.archives.get(key);
    if (!archive) {
      archive = new PMTiles(new WholeFileSource(key, () => this.readFile(id, resolved.path, resolved.sha256)));
      this.archives.set(key, archive);
    }
    const res = await archive.getZxy(z, x, y);
    return res?.data ?? null;
  }

  /** The PMTiles metadata of a pyramid (vector_layers and so on), from its first archive. */
  async pyramidMetadata(id: string): Promise<Record<string, unknown>> {
    const m = await this.manifest(id);
    const first = m.layers?.[0];
    if (!first) {return {};}
    const path = first.type === "single" ? first.path : null;
    if (!path) {return {};}
    const key = `${id}/${path}`;
    let archive = this.archives.get(key);
    if (!archive) {
      archive = new PMTiles(new WholeFileSource(key, () => this.readFile(id, path, first.type === "single" ? first.sha256 : undefined)));
      this.archives.set(key, archive);
    }
    return (await archive.getMetadata()) as Record<string, unknown>;
  }
}
