/**
 * Foundry-backed vector layers and projects: loading, committing edits,
 * publishing, and saving projects as MapProject objects.
 *
 * The Ontology contract (object types, properties, action parameters) is
 * written down in ONTOLOGY.md; the parameter names here must match it.
 */
import { parseCsv } from "../formats/vector";
import { parseProject, serializeForFoundry } from "../project/io";
import type { Project, StudioFeature, VectorLayerNode } from "../project/types";
import type { FoundryConfig } from "./auth";
import { geoProperties, objectGeometry, OntologyClient, OntologyError, primaryKeyOf, type ObjectTypeDef, type OntologyObject } from "./ontology";

export interface Loaded {
  features: StudioFeature[];
  fields: string[];
  message?: string;
}

const RESERVED = new Set(["__rid", "__primaryKey", "__apiName", "__title"]);

function fieldsFrom(features: StudioFeature[]): string[] {
  const seen = new Set<string>();
  for (const f of features) {for (const k of Object.keys(f.properties)) {seen.add(k);}}
  return [...seen];
}

// ── MapFeature collections ─────────────────────────────────────────────────

/** A MapFeature object as a studio feature: its `properties` JSON becomes the attributes. */
export function featureFromObject(o: OntologyObject): StudioFeature | null {
  const geometry = objectGeometry(o, "geometry");
  if (!geometry) {return null;}
  let properties: Record<string, unknown> = {};
  if (typeof o.properties === "string" && o.properties) {
    try {
      const parsed = JSON.parse(o.properties) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {properties = parsed as Record<string, unknown>;}
    } catch {
      properties = { properties: o.properties };
    }
  }
  return { type: "Feature", id: String(o.featureId ?? o.__primaryKey), geometry, properties };
}

/** The action parameters for one feature, as ONTOLOGY.md defines them. */
export function featureParameters(f: StudioFeature, collection: string, titleField?: string | null) {
  const title = (titleField ? f.properties[titleField] : undefined) ?? f.properties.name ?? f.properties.title ?? "";
  return {
    geometry: f.geometry,
    properties: JSON.stringify(f.properties),
    title: String(title ?? ""),
    collection,
  };
}

export async function listCollections(client: OntologyClient): Promise<Array<{ name: string; count: number }>> {
  const type = client.studio.featureType;
  // Distinct collections. A grouped aggregation would be cheaper, but search
  // works on every stack; collections are small in number.
  const { objects } = await client.search(type, { limit: 50000 });
  const counts = new Map<string, number>();
  for (const o of objects) {
    const c = String(o.collection ?? "");
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Loading any backed layer ───────────────────────────────────────────────

export async function loadBacked(layer: VectorLayerNode, client: OntologyClient | null, foundry: FoundryConfig | null): Promise<Loaded> {
  const b = layer.backing;
  if (!b) {return { features: layer.data.features, fields: layer.fields };}
  if (b.kind === "dataset") {
    if (!foundry) {throw new Error("Foundry is not configured");}
    return readDatasetTable(foundry, b.datasetRid, b.limit);
  }
  if (!client) {throw new Error("Foundry is not configured");}
  if (b.kind === "ontology-features") {
    const { objects, truncated } = await client.search(client.studio.featureType, {
      where: { type: "eq", field: "collection", value: b.collection },
      limit: 100000,
    });
    const features = objects.map(featureFromObject).filter((f): f is StudioFeature => !!f);
    return {
      features,
      fields: mergeFields(layer.fields, fieldsFrom(features)),
      message: truncated ? `Showing the first ${features.length} features of ${b.collection}.` : undefined,
    };
  }
  const type = await client.objectType(b.objectType);
  const { objects, truncated } = await client.search(b.objectType, { limit: b.limit });
  const features = objects.flatMap((o) => objectToFeature(o, type, b.geometryProperty));
  const skipped = objects.length - features.length;
  return {
    features,
    fields: Object.keys(type.properties).filter((k) => k !== b.geometryProperty && !geoProperties(type).includes(k)),
    message: [
      truncated ? `Showing the first ${features.length} ${type.pluralDisplayName ?? type.displayName}.` : "",
      skipped ? `${skipped} without a location skipped.` : "",
    ].filter(Boolean).join(" ") || undefined,
  };
}

function mergeFields(declared: string[], found: string[]): string[] {
  return [...declared, ...found.filter((f) => !declared.includes(f))];
}

export function objectToFeature(o: OntologyObject, type: ObjectTypeDef, geometryProperty: string): StudioFeature[] {
  const geometry = objectGeometry(o, geometryProperty);
  if (!geometry) {return [];}
  const geo = new Set(geoProperties(type));
  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (RESERVED.has(k) || geo.has(k)) {continue;}
    properties[k] = typeof v === "object" && v !== null ? JSON.stringify(v) : v;
  }
  return [{ type: "Feature", id: primaryKeyOf(o, type), geometry, properties }];
}

// ── Tabular datasets ───────────────────────────────────────────────────────

export async function readDatasetTable(foundry: FoundryConfig, datasetRid: string, limit: number): Promise<Loaded> {
  const token = await foundry.getToken();
  const q = new URLSearchParams({ format: "CSV", rowLimit: String(limit + 1) });
  const res = await fetch(`${foundry.foundryUrl}/api/v2/datasets/${encodeURIComponent(datasetRid)}/readTable?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 403 || res.status === 401
        ? `No access to ${datasetRid}: add it as a Resource on the app in Developer Console.`
        : `Could not read ${datasetRid} as a table (${res.status}). Only tabular datasets with lat/lon or WKT columns can be layers.`,
    );
  }
  const text = await res.text();
  const parsed = parseCsv(text);
  const truncated = parsed.features.length + parsed.skipped > limit;
  const features = parsed.features.slice(0, limit);
  return {
    features,
    fields: parsed.fields,
    message: [
      truncated ? `Showing the first ${limit} rows; for more, tile the dataset with terrain-gen's vector step.` : "",
      parsed.skipped ? `${parsed.skipped} rows without a location skipped.` : "",
    ].filter(Boolean).join(" ") || undefined,
  };
}

// ── Committing edits ───────────────────────────────────────────────────────

export interface CommitResult {
  applied: number;
  failed: Array<{ id: string; error: string }>;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {await fn(items[next++]);}
    }),
  );
}

/** Apply a layer's pending edits as Actions. Failures are reported per feature; successes stay applied. */
export async function commitEdits(
  layer: VectorLayerNode,
  client: OntologyClient,
  onProgress?: (done: number, total: number) => void,
): Promise<CommitResult> {
  if (layer.backing?.kind !== "ontology-features" || !layer.pending) {return { applied: 0, failed: [] };}
  const { collection } = layer.backing;
  const a = client.studio.actions;
  const byId = new Map(layer.data.features.map((f) => [f.id, f]));
  type Op = { id: string; run: () => Promise<void> };
  const ops: Op[] = [
    ...layer.pending.deleted.map((id) => ({ id, run: () => client.apply(a.deleteFeature, { feature: id }) })),
    ...layer.pending.created.flatMap((id) => {
      const f = byId.get(id);
      return f ? [{ id, run: () => client.apply(a.createFeature, { featureId: id, ...featureParameters(f, collection) }) }] : [];
    }),
    ...layer.pending.modified.flatMap((id) => {
      const f = byId.get(id);
      if (!f) {return [];}
      const { collection: _c, ...params } = featureParameters(f, collection);
      return [{ id, run: () => client.apply(a.modifyFeature, { feature: id, ...params }) }];
    }),
  ];
  const result: CommitResult = { applied: 0, failed: [] };
  let done = 0;
  await pool(ops, 4, async (op) => {
    try {
      await op.run();
      result.applied++;
    } catch (e) {
      result.failed.push({ id: op.id, error: e instanceof Error ? e.message : String(e) });
    }
    onProgress?.(++done, ops.length);
  });
  return result;
}

/** Create every feature of a local layer as MapFeature objects in a new collection. */
export async function publishLayer(
  layer: VectorLayerNode,
  collection: string,
  client: OntologyClient,
  onProgress?: (done: number, total: number) => void,
): Promise<CommitResult> {
  const result: CommitResult = { applied: 0, failed: [] };
  let done = 0;
  await pool(layer.data.features, 4, async (f) => {
    try {
      await client.apply(client.studio.actions.createFeature, { featureId: f.id, ...featureParameters(f, collection, layer.style.labelField) });
      result.applied++;
    } catch (e) {
      result.failed.push({ id: f.id, error: e instanceof Error ? e.message : String(e) });
    }
    onProgress?.(++done, layer.data.features.length);
  });
  return result;
}

// ── Projects ───────────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt?: string;
  updatedBy?: string;
}

export async function listProjects(client: OntologyClient): Promise<ProjectSummary[]> {
  const { objects } = await client.search(client.studio.projectType, { limit: 1000 });
  return objects
    .map((o) => ({
      id: String(o.projectId ?? o.__primaryKey),
      title: String(o.title ?? "Untitled"),
      updatedAt: o.updatedAt ? String(o.updatedAt) : undefined,
      updatedBy: o.updatedBy ? String(o.updatedBy) : undefined,
    }))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

/** Create the MapProject, or modify it if it already exists. */
export async function saveProject(client: OntologyClient, project: Project): Promise<"created" | "modified"> {
  const document = serializeForFoundry(project);
  const existing = await client.get(client.studio.projectType, project.id);
  const a = client.studio.actions;
  if (existing) {
    await client.apply(a.modifyProject, { project: project.id, title: project.title, document });
    return "modified";
  }
  await client.apply(a.createProject, { projectId: project.id, title: project.title, document });
  return "created";
}

export async function openProject(client: OntologyClient, id: string): Promise<Project> {
  const o = await client.get(client.studio.projectType, id);
  if (!o) {throw new OntologyError(`No project ${id}`, 404);}
  if (typeof o.document !== "string") {throw new Error("That project object has no document.");}
  return { ...parseProject(o.document), id };
}

export async function deleteProject(client: OntologyClient, id: string): Promise<void> {
  await client.apply(client.studio.actions.deleteProject, { project: id });
}

