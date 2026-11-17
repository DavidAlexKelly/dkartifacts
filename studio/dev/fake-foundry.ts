/**
 * A fake Foundry for development and tests — NEVER part of a build.
 *
 * Implements just the v2 platform endpoints the studio calls, with the
 * Ontology contract from ONTOLOGY.md, so saving projects, publishing layers
 * and committing edits can be exercised end to end without an enrollment:
 *
 *   GET  /api/v2/ontologies
 *   GET  /api/v2/ontologies/:o/objectTypes[/:type]
 *   POST /api/v2/ontologies/:o/objects/:type/search
 *   GET  /api/v2/ontologies/:o/objects/:type/:pk
 *   POST /api/v2/ontologies/:o/actions/:action/apply
 *   GET  /api/v2/datasets/:rid/files/:path/content   (terrain-gen folders)
 *   GET  /api/v2/datasets/:rid/readTable             (a folder's table.csv)
 *   GET  /fake/rids                                  (folder → fake RID map)
 *
 * Enable with STUDIO_FAKE_FOUNDRY=1 and, in .env.local,
 *   VITE_FOUNDRY_API_URL=http://localhost:8080/fake-foundry
 *   VITE_FOUNDRY_TOKEN=fake
 * State is kept in memory and in STUDIO_FAKE_STATE (default .fake-foundry.json).
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve, sep } from "node:path";
import type { Plugin } from "vite";

type Obj = Record<string, unknown>;
interface PropDef { dataType: { type: string }; displayName?: string }
interface TypeDef { apiName: string; displayName: string; pluralDisplayName: string; primaryKey: string; titleProperty: string; properties: Record<string, PropDef> }

const ONTOLOGY = { apiName: "studio-dev", displayName: "Studio (fake)", rid: "ri.ontology.main.ontology.00000000-0000-0000-0000-000000000001" };
const p = (type: string): PropDef => ({ dataType: { type } });

const TYPES: Record<string, TypeDef> = {
  MapProject: {
    apiName: "MapProject", displayName: "Map Project", pluralDisplayName: "Map Projects", primaryKey: "projectId", titleProperty: "title",
    properties: { projectId: p("string"), title: p("string"), document: p("string"), updatedAt: p("timestamp"), updatedBy: p("string") },
  },
  MapFeature: {
    apiName: "MapFeature", displayName: "Map Feature", pluralDisplayName: "Map Features", primaryKey: "featureId", titleProperty: "title",
    properties: { featureId: p("string"), collection: p("string"), title: p("string"), geometry: p("geoshape"), properties: p("string"), updatedAt: p("timestamp"), updatedBy: p("string") },
  },
  // Demo types with locations, standing in for an enrollment's own data.
  Airfield: {
    apiName: "Airfield", displayName: "Airfield", pluralDisplayName: "Airfields", primaryKey: "icao", titleProperty: "name",
    properties: { icao: p("string"), name: p("string"), elevationM: p("integer"), runwayM: p("integer"), location: p("geopoint") },
  },
  TrainingArea: {
    apiName: "TrainingArea", displayName: "Training Area", pluralDisplayName: "Training Areas", primaryKey: "areaId", titleProperty: "name",
    properties: { areaId: p("string"), name: p("string"), status: p("string"), boundary: p("geoshape") },
  },
};

// Fictional demo objects (made up for testing; not real facilities).
function seed(): Record<string, Obj[]> {
  return {
    MapProject: [],
    MapFeature: [],
    Airfield: [
      { icao: "DEMO1", name: "Demo Field North", elevationM: 412, runwayM: 1800, location: { type: "Point", coordinates: [8.55, 61.83] } },
      { icao: "DEMO2", name: "Demo Field South", elevationM: 230, runwayM: 1200, location: { type: "Point", coordinates: [8.9, 61.25] } },
      { icao: "DEMO3", name: "Demo Strip West", elevationM: 905, runwayM: 800, location: { type: "Point", coordinates: [7.4, 61.6] } },
    ],
    TrainingArea: [
      { areaId: "TA-1", name: "Demo Area Alpha", status: "open", boundary: { type: "Polygon", coordinates: [[[8.2, 61.55], [8.6, 61.55], [8.6, 61.7], [8.2, 61.7], [8.2, 61.55]]] } },
      { areaId: "TA-2", name: "Demo Area Bravo", status: "closed", boundary: { type: "Polygon", coordinates: [[[7.6, 61.3], [7.9, 61.3], [7.9, 61.45], [7.6, 61.45], [7.6, 61.3]]] } },
    ],
  };
}

const ACTIONS: Record<string, { params: Record<string, { required: boolean }> }> = {
  "create-map-project": { params: { projectId: { required: true }, title: { required: true }, document: { required: true } } },
  "modify-map-project": { params: { project: { required: true }, title: { required: true }, document: { required: true } } },
  "delete-map-project": { params: { project: { required: true } } },
  "create-map-feature": { params: { featureId: { required: true }, collection: { required: true }, geometry: { required: true }, properties: { required: false }, title: { required: false } } },
  "modify-map-feature": { params: { feature: { required: true }, geometry: { required: true }, properties: { required: false }, title: { required: false } } },
  "delete-map-feature": { params: { feature: { required: true } } },
};

export function fakeRid(name: string): string {
  const h = createHash("sha1").update(name).digest("hex");
  return `ri.foundry.main.dataset.${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function matches(o: Obj, w: Obj | undefined): boolean {
  if (!w) {return true;}
  const field = w.field as string;
  switch (w.type) {
    case "and": return (w.value as Obj[]).every((x) => matches(o, x));
    case "or": return (w.value as Obj[]).some((x) => matches(o, x));
    case "not": return !matches(o, w.value as Obj);
    case "eq": return o[field] === w.value;
    case "gt": return (o[field] as number) > (w.value as number);
    case "gte": return (o[field] as number) >= (w.value as number);
    case "lt": return (o[field] as number) < (w.value as number);
    case "lte": return (o[field] as number) <= (w.value as number);
    case "contains": return String(o[field] ?? "").includes(String(w.value));
    case "isNull": return (o[field] === undefined || o[field] === null) === w.value;
    default: return true; // spatial filters: return everything, the client filters
  }
}

async function body(req: IncomingMessage): Promise<Obj> {
  const chunks: Buffer[] = [];
  for await (const c of req) {chunks.push(c as Buffer);}
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Obj) : {};
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export interface FakeFoundryOptions { enabled: boolean; dataDir?: string; statePath?: string; user?: string; persist?: boolean }

/** The request handler and its state, for the Vite plugin and for tests. */
export function createFakeFoundry(opts: FakeFoundryOptions) {
  const statePath = resolve(opts.statePath ?? ".fake-foundry.json");
  let objects: Record<string, Obj[]> = seed();
  if (opts.enabled && opts.persist !== false && existsSync(statePath)) {
    try {
      objects = { ...seed(), ...(JSON.parse(readFileSync(statePath, "utf8")) as Record<string, Obj[]>) };
    } catch {
      /* start fresh */
    }
  }
  const persist = () => {
    if (opts.persist !== false) {writeFileSync(statePath, JSON.stringify({ MapProject: objects.MapProject, MapFeature: objects.MapFeature }));}
  };
  const dataRoot = opts.dataDir ? resolve(opts.dataDir) : null;
  const rids = new Map<string, string>(); // rid -> folder
  if (dataRoot && existsSync(dataRoot)) {
    for (const name of readdirSync(dataRoot)) {
      if (statSync(join(dataRoot, name)).isDirectory()) {rids.set(fakeRid(name), name);}
    }
  }

  const apply = (action: string, params: Obj): { ok: true } | { ok: false; invalid: string[] } => {
    const spec = ACTIONS[action];
    if (!spec) {return { ok: false, invalid: ["(unknown action)"] };}
    const invalid = Object.entries(spec.params).filter(([k, v]) => v.required && (params[k] === undefined || params[k] === null || params[k] === "")).map(([k]) => k);
    if (invalid.length) {return { ok: false, invalid };}
    const now = new Date().toISOString();
    const who = opts.user ?? "dev.user";
    const find = (type: string, pk: unknown) => objects[type].findIndex((o) => o[TYPES[type].primaryKey] === pk);
    switch (action) {
      case "create-map-project":
        if (find("MapProject", params.projectId) >= 0) {return { ok: false, invalid: ["projectId (exists)"] };}
        objects.MapProject.push({ projectId: params.projectId, title: params.title, document: params.document, updatedAt: now, updatedBy: who });
        break;
      case "modify-map-project": {
        const i = find("MapProject", params.project);
        if (i < 0) {return { ok: false, invalid: ["project (not found)"] };}
        Object.assign(objects.MapProject[i], { title: params.title, document: params.document, updatedAt: now, updatedBy: who });
        break;
      }
      case "delete-map-project":
        objects.MapProject = objects.MapProject.filter((o) => o.projectId !== params.project);
        break;
      case "create-map-feature":
        if (find("MapFeature", params.featureId) >= 0) {return { ok: false, invalid: ["featureId (exists)"] };}
        objects.MapFeature.push({ featureId: params.featureId, collection: params.collection, geometry: params.geometry, properties: params.properties ?? "{}", title: params.title ?? "", updatedAt: now, updatedBy: who });
        break;
      case "modify-map-feature": {
        const i = find("MapFeature", params.feature);
        if (i < 0) {return { ok: false, invalid: ["feature (not found)"] };}
        Object.assign(objects.MapFeature[i], { geometry: params.geometry, properties: params.properties ?? "{}", title: params.title ?? "", updatedAt: now, updatedBy: who });
        break;
      }
      case "delete-map-feature":
        objects.MapFeature = objects.MapFeature.filter((o) => o.featureId !== params.feature);
        break;
    }
    persist();
    return { ok: true };
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const path = url.pathname;
    if (path === "/fake/rids") {return send(res, 200, Object.fromEntries([...rids].map(([rid, name]) => [name, rid])));}
    if (path === "/fake/reset") {
      objects = seed();
      persist();
      return send(res, 200, { ok: true });
    }
    if (req.headers.authorization !== "Bearer fake") {return send(res, 401, { errorCode: "UNAUTHORIZED", errorName: "MissingCredentials" });}
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent); // api v2 ...
    if (parts[0] !== "api" || parts[1] !== "v2") {return send(res, 404, { errorName: "NotFound" });}
    const [, , area, a, b, c, d, e] = parts;

    if (area === "datasets") {
      const folder = rids.get(a);
      if (!folder || !dataRoot) {return send(res, 404, { errorName: "DatasetNotFound", parameters: { datasetRid: a } });}
      if (b === "readTable") {
        const csv = join(dataRoot, folder, "table.csv");
        if (!existsSync(csv)) {return send(res, 400, { errorName: "NotATable" });}
        res.setHeader("Content-Type", "text/csv");
        const limit = Number(url.searchParams.get("rowLimit") ?? 1e9);
        const lines = readFileSync(csv, "utf8").split(/\r?\n/).filter(Boolean);
        return res.end(lines.slice(0, limit + 1).join("\n"));
      }
      if (b === "files" && parts[parts.length - 1] === "content") {
        const rel = parts.slice(5, -1).join("/");
        const root = resolve(dataRoot, folder);
        const file = resolve(root, rel);
        if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {return send(res, 404, { errorName: "FileNotFound" });}
        res.setHeader("Content-Type", "application/octet-stream");
        return void createReadStream(file).pipe(res);
      }
      return send(res, 404, { errorName: "NotFound" });
    }

    if (area !== "ontologies") {return send(res, 404, { errorName: "NotFound" });}
    if (!a) {return send(res, 200, { data: [ONTOLOGY] });}
    if (a !== ONTOLOGY.apiName && a !== ONTOLOGY.rid) {return send(res, 404, { errorName: "OntologyNotFound" });}
    if (b === "objectTypes") {
      if (!c) {return send(res, 200, { data: Object.values(TYPES) });}
      return TYPES[c] ? send(res, 200, TYPES[c]) : send(res, 404, { errorName: "ObjectTypeNotFound" });
    }
    if (b === "objects") {
      const type = TYPES[c];
      if (!type) {return send(res, 404, { errorName: "ObjectTypeNotFound" });}
      const list = objects[c] ?? [];
      const decorate = (o: Obj) => ({ ...o, __primaryKey: o[type.primaryKey], __apiName: type.apiName, __rid: `ri.phonograph2-objects.main.object.${String(o[type.primaryKey])}` });
      if (d === "search" && req.method === "POST") {
        const q = await body(req);
        const all = list.filter((o) => matches(o, q.where as Obj | undefined));
        const start = Number(q.pageToken ?? 0);
        const size = Math.min(1000, Number(q.pageSize ?? 100));
        const page = all.slice(start, start + size).map(decorate);
        return send(res, 200, { data: page, ...(start + size < all.length ? { nextPageToken: String(start + size) } : {}), totalCount: String(all.length) });
      }
      if (d && !e && req.method === "GET") {
        const o = list.find((x) => String(x[type.primaryKey]) === d);
        return o ? send(res, 200, decorate(o)) : send(res, 404, { errorName: "ObjectNotFound" });
      }
    }
    if (b === "actions" && d === "apply" && req.method === "POST") {
      const q = await body(req);
      const r = apply(c, (q.parameters ?? {}) as Obj);
      if (r.ok) {return send(res, 200, { validation: { result: "VALID", submissionCriteria: [], parameters: {} } });}
      return send(res, 200, {
        validation: {
          result: "INVALID",
          submissionCriteria: [],
          parameters: Object.fromEntries(r.invalid.map((k) => [k, { result: "INVALID", evaluatedConstraints: [], required: true }])),
        },
      });
    }
    return send(res, 404, { errorName: "NotFound" });
  };

  const safeHandle = (req: IncomingMessage, res: ServerResponse) => {
    handle(req, res).catch((err: unknown) => send(res, 500, { errorName: "Internal", parameters: { message: String(err) } }));
  };
  return { handle: safeHandle, rids, objects: () => objects };
}

export function fakeFoundry(opts: FakeFoundryOptions): Plugin {
  return {
    name: "studio-fake-foundry",
    apply: "serve",
    configureServer(server) {
      if (!opts.enabled) {return;}
      const { handle, rids } = createFakeFoundry(opts);
      const dataRoot = opts.dataDir ? resolve(opts.dataDir) : null;
      server.middlewares.use("/fake-foundry", handle);
      server.config.logger.info(`  fake Foundry at /fake-foundry (${rids.size} datasets from ${dataRoot ?? "no folder"}; token "fake")`);
      for (const [rid, name] of rids) {server.config.logger.info(`    ${name}: ${rid}`);}
    },
  };
}
