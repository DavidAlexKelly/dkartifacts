/**
 * The Foundry Ontology, over the platform's v2 REST API.
 *
 * Two uses:
 *
 *   reading   any object type with a geopoint or geoshape property is a map
 *             layer: its objects are features, its other properties are the
 *             attribute table.
 *   writing   two object types the studio owns (see ONTOLOGY.md):
 *               MapProject   saved projects, shared and permissioned like any
 *                            other object
 *               MapFeature   features drawn or imported in the studio, grouped
 *                            into collections, edited through Actions so every
 *                            change is validated and appears in the action log
 *
 * Plain fetch rather than a generated OSDK: the studio does not know the
 * enrollment's ontology at build time, so it discovers object types at run time.
 */
import type { Geometry } from "geojson";
import type { FoundryConfig } from "./auth";

export interface PropertyDef {
  dataType: { type: string };
  displayName?: string;
  description?: string;
}

export interface ObjectTypeDef {
  apiName: string;
  displayName: string;
  pluralDisplayName?: string;
  primaryKey: string;
  titleProperty?: string;
  properties: Record<string, PropertyDef>;
  rid?: string;
}

export interface OntologyDef {
  apiName: string;
  displayName: string;
  rid: string;
}

export type OntologyObject = Record<string, unknown> & { __primaryKey?: unknown; __apiName?: string; __rid?: string };

/** The subset of SearchJsonQueryV2 the studio builds. */
export type Where =
  | { type: "eq" | "gt" | "gte" | "lt" | "lte" | "contains"; field: string; value: unknown }
  | { type: "isNull"; field: string; value: boolean }
  | { type: "and" | "or"; value: Where[] }
  | { type: "not"; value: Where }
  | { type: "withinBoundingBox" | "intersectsBoundingBox"; field: string; value: { topLeft: { type: "Point"; coordinates: [number, number] }; bottomRight: { type: "Point"; coordinates: [number, number] } } };

export class OntologyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorName?: string,
  ) {
    super(message);
    this.name = "OntologyError";
  }
}

/** What the studio expects to find in the Ontology. Override in .env; see ONTOLOGY.md. */
export interface StudioOntologyConfig {
  ontology: string | null;
  projectType: string;
  featureType: string;
  actions: {
    createProject: string;
    modifyProject: string;
    deleteProject: string;
    createFeature: string;
    modifyFeature: string;
    deleteFeature: string;
  };
}

const env = import.meta.env;
export const studioOntology: StudioOntologyConfig = {
  ontology: (env.VITE_ONTOLOGY as string | undefined) || null,
  projectType: (env.VITE_MAP_PROJECT_TYPE as string | undefined) || "MapProject",
  featureType: (env.VITE_MAP_FEATURE_TYPE as string | undefined) || "MapFeature",
  actions: {
    createProject: (env.VITE_ACTION_CREATE_PROJECT as string | undefined) || "create-map-project",
    modifyProject: (env.VITE_ACTION_MODIFY_PROJECT as string | undefined) || "modify-map-project",
    deleteProject: (env.VITE_ACTION_DELETE_PROJECT as string | undefined) || "delete-map-project",
    createFeature: (env.VITE_ACTION_CREATE_FEATURE as string | undefined) || "create-map-feature",
    modifyFeature: (env.VITE_ACTION_MODIFY_FEATURE as string | undefined) || "modify-map-feature",
    deleteFeature: (env.VITE_ACTION_DELETE_FEATURE as string | undefined) || "delete-map-feature",
  },
};

export const GEO_TYPES = new Set(["geopoint", "geoshape"]);

export function geoProperties(t: ObjectTypeDef): string[] {
  return Object.entries(t.properties).filter(([, p]) => GEO_TYPES.has(p.dataType.type)).map(([k]) => k);
}

export class OntologyClient {
  private ontologyName: Promise<string> | null = null;

  constructor(
    private readonly config: FoundryConfig,
    private readonly settings: StudioOntologyConfig = studioOntology,
  ) {}

  get studio(): StudioOntologyConfig {
    return this.settings;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const token = await this.config.getToken();
    const res = await fetch(`${this.config.foundryUrl}/api/v2${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let name: string | undefined;
      let detail = "";
      try {
        const err = (await res.json()) as { errorName?: string; parameters?: unknown; errorCode?: string };
        name = err.errorName;
        detail = `${err.errorName ?? err.errorCode ?? ""} ${err.parameters ? JSON.stringify(err.parameters) : ""}`.trim();
      } catch {
        /* not JSON */
      }
      const hint =
        res.status === 401 || res.status === 403
          ? " — the app needs the ontology scopes, and the object type must be a Resource on the app in Developer Console"
          : "";
      throw new OntologyError(`${method} ${path}: ${res.status}${detail ? ` ${detail}` : ""}${hint}`, res.status, name);
    }
    return (await res.json()) as T;
  }

  /** The ontology to use: the configured one, else the first the user can see. */
  ontology(): Promise<string> {
    if (!this.ontologyName) {
      this.ontologyName = (async () => {
        if (this.settings.ontology) {return this.settings.ontology;}
        const list = await this.listOntologies();
        if (list.length === 0) {throw new OntologyError("No ontology is visible to this app.", 404);}
        return list[0].apiName;
      })();
      this.ontologyName.catch(() => (this.ontologyName = null));
    }
    return this.ontologyName;
  }

  async listOntologies(): Promise<OntologyDef[]> {
    return (await this.request<{ data: OntologyDef[] }>("GET", "/ontologies")).data;
  }

  async listObjectTypes(): Promise<ObjectTypeDef[]> {
    const ont = encodeURIComponent(await this.ontology());
    const out: ObjectTypeDef[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ pageSize: "500", ...(pageToken ? { pageToken } : {}) });
      const page = await this.request<{ data: ObjectTypeDef[]; nextPageToken?: string }>("GET", `/ontologies/${ont}/objectTypes?${q}`);
      out.push(...page.data);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  /** Object types with a location, i.e. the ones that can be map layers. */
  async geoObjectTypes(): Promise<ObjectTypeDef[]> {
    return (await this.listObjectTypes()).filter((t) => geoProperties(t).length > 0);
  }

  async objectType(apiName: string): Promise<ObjectTypeDef> {
    const ont = encodeURIComponent(await this.ontology());
    return this.request<ObjectTypeDef>("GET", `/ontologies/${ont}/objectTypes/${encodeURIComponent(apiName)}`);
  }

  /** Every object matching `where`, up to `limit`, following pages. */
  async search(
    objectType: string,
    opts: { where?: Where; limit?: number; orderBy?: { field: string; direction: "asc" | "desc" }; signal?: AbortSignal } = {},
  ): Promise<{ objects: OntologyObject[]; truncated: boolean }> {
    const ont = encodeURIComponent(await this.ontology());
    const limit = opts.limit ?? 10000;
    const objects: OntologyObject[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.request<{ data: OntologyObject[]; nextPageToken?: string }>(
        "POST",
        `/ontologies/${ont}/objects/${encodeURIComponent(objectType)}/search`,
        {
          ...(opts.where ? { where: opts.where } : {}),
          ...(opts.orderBy ? { orderBy: { fields: [opts.orderBy] } } : {}),
          pageSize: Math.min(1000, limit - objects.length),
          ...(pageToken ? { pageToken } : {}),
        },
      );
      objects.push(...page.data);
      pageToken = page.nextPageToken;
      if (opts.signal?.aborted) {break;}
    } while (pageToken && objects.length < limit);
    return { objects, truncated: !!pageToken };
  }

  async get(objectType: string, primaryKey: string): Promise<OntologyObject | null> {
    const ont = encodeURIComponent(await this.ontology());
    try {
      return await this.request<OntologyObject>("GET", `/ontologies/${ont}/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(primaryKey)}`);
    } catch (e) {
      if (e instanceof OntologyError && e.status === 404) {return null;}
      throw e;
    }
  }

  /** Apply an action; throws with Foundry's validation result when it is refused. */
  async apply(action: string, parameters: Record<string, unknown>): Promise<void> {
    const ont = encodeURIComponent(await this.ontology());
    const res = await this.request<{ validation?: { result: string; submissionCriteria?: Array<{ result: string; configuredFailureMessage?: string }>; parameters?: Record<string, { result: string; evaluatedConstraints?: unknown[] }> } }>(
      "POST",
      `/ontologies/${ont}/actions/${encodeURIComponent(action)}/apply`,
      { parameters, options: { mode: "VALIDATE_AND_EXECUTE", returnEdits: "NONE" } },
    );
    const v = res.validation;
    if (v && v.result !== "VALID") {
      const reasons = [
        ...(v.submissionCriteria ?? []).filter((c) => c.result !== "VALID").map((c) => c.configuredFailureMessage ?? "a submission criterion failed"),
        ...Object.entries(v.parameters ?? {}).filter(([, p]) => p.result !== "VALID").map(([k]) => `parameter ${k} is invalid`),
      ];
      throw new OntologyError(`${action} was refused: ${reasons.join("; ") || "invalid"}`, 400, "ValidationFailed");
    }
  }
}

// ── Objects ↔ features ─────────────────────────────────────────────────────

export function objectGeometry(o: OntologyObject, geoProperty: string): Geometry | null {
  const v = o[geoProperty];
  if (!v) {return null;}
  if (typeof v === "string") {
    // Some stacks return geopoints as "lat,lon".
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(v);
    if (m) {return { type: "Point", coordinates: [Number(m[2]), Number(m[1])] };}
    try {
      return objectGeometry({ [geoProperty]: JSON.parse(v) as unknown }, geoProperty);
    } catch {
      return null;
    }
  }
  if (typeof v === "object" && "type" in (v as object)) {
    const g = v as Geometry & { coordinates?: unknown };
    return g.type === "GeometryCollection" || Array.isArray(g.coordinates) ? (g as Geometry) : null;
  }
  return null;
}

export function primaryKeyOf(o: OntologyObject, t: ObjectTypeDef): string {
  return String(o.__primaryKey ?? o[t.primaryKey]);
}
