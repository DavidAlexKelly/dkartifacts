// @vitest-environment node
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeFoundry } from "../dev/fake-foundry";
import { commitEdits, listCollections, listProjects, loadBacked, openProject, publishLayer, saveProject, deleteProject } from "../src/foundry/layers";
import { OntologyClient } from "../src/foundry/ontology";
import { historyReducer, type History } from "../src/project/reducer";
import { defaultVectorStyle, newProject, type VectorLayerNode } from "../src/project/types";

// The studio's Ontology code against the dev fake, over real HTTP: the same
// requests a browser would send to Foundry.
let server: Server;
let client: OntologyClient;
const foundry = { foundryUrl: "", getToken: async () => "fake" };

beforeAll(async () => {
  const fake = createFakeFoundry({ enabled: true, persist: false });
  server = createServer((req, res) => {
    req.url = (req.url ?? "").replace(/^\/fake-foundry/, "");
    fake.handle(req, res);
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  foundry.foundryUrl = `http://127.0.0.1:${port}/fake-foundry`;
  client = new OntologyClient(foundry);
});
afterAll(() => server.close());

const layer = (): VectorLayerNode => ({
  kind: "vector", id: "v", title: "Patrol routes", visible: true, opacity: 1, style: defaultVectorStyle(0), fields: ["name"],
  data: { type: "FeatureCollection", features: [
    { type: "Feature", id: "f1", geometry: { type: "Point", coordinates: [8.3, 61.6] }, properties: { name: "Alpha", n: 1 } },
    { type: "Feature", id: "f2", geometry: { type: "LineString", coordinates: [[8, 61], [8.5, 61.5]] }, properties: { name: "Bravo" } },
  ] },
});

describe("Ontology", () => {
  it("lists object types with locations", async () => {
    const types = await client.geoObjectTypes();
    expect(types.map((t) => t.apiName)).toEqual(expect.arrayContaining(["Airfield", "TrainingArea", "MapFeature"]));
  });

  it("loads any geo object type as a read-only layer", async () => {
    const l: VectorLayerNode = { ...layer(), backing: { kind: "ontology", objectType: "Airfield", geometryProperty: "location", limit: 100 } };
    const loaded = await loadBacked(l, client, foundry);
    expect(loaded.features).toHaveLength(3);
    expect(loaded.features[0].geometry.type).toBe("Point");
    expect(loaded.fields).toEqual(expect.arrayContaining(["icao", "name", "elevationM"]));
    expect(loaded.features[0].properties.location).toBeUndefined();
  });

  it("publishes a layer, then commits edits made to it as actions", async () => {
    const published = await publishLayer(layer(), "patrols", client);
    expect(published).toEqual({ applied: 2, failed: [] });
    expect(await listCollections(client)).toContainEqual({ name: "patrols", count: 2 });

    // Reload as a backed layer and edit it through the reducer, as the UI does.
    let backed: VectorLayerNode = { ...layer(), backing: { kind: "ontology-features", collection: "patrols" } };
    const loaded = await loadBacked(backed, client, foundry);
    expect(loaded.features.map((f) => f.properties.name).sort()).toEqual(["Alpha", "Bravo"]);
    let h: History = { past: [], present: { ...newProject(), layers: [backed] }, future: [] };
    h = historyReducer(h, { type: "setLayerData", layerId: "v", features: loaded.features, fields: loaded.fields });
    h = historyReducer(h, { type: "setProperty", layerId: "v", featureId: "f1", field: "name", value: "Alpha 2" });
    h = historyReducer(h, { type: "deleteFeatures", layerId: "v", ids: ["f2"] });
    h = historyReducer(h, { type: "addFeature", layerId: "v", feature: { type: "Feature", id: "f3", geometry: { type: "Point", coordinates: [9, 62] }, properties: { name: "Charlie" } } });
    h = historyReducer(h, { type: "addFeature", layerId: "v", feature: { type: "Feature", id: "f4", geometry: { type: "Point", coordinates: [9, 62] }, properties: {} } });
    h = historyReducer(h, { type: "deleteFeatures", layerId: "v", ids: ["f4"] }); // created then deleted: never sent
    backed = h.present.layers[0] as VectorLayerNode;
    expect(backed.pending).toEqual({ created: ["f3"], modified: ["f1"], deleted: ["f2"] });

    const result = await commitEdits(backed, client);
    expect(result).toEqual({ applied: 3, failed: [] });
    const after = await loadBacked(backed, client, foundry);
    expect(after.features.map((f) => f.properties.name).sort()).toEqual(["Alpha 2", "Charlie"]);
  });

  it("reports refused actions per feature and keeps going", async () => {
    const dup = { ...layer(), backing: { kind: "ontology-features" as const, collection: "patrols" }, pending: { created: ["f1"], modified: [], deleted: [] } };
    const result = await commitEdits(dup, client); // f1 already exists
    expect(result.applied).toBe(0);
    expect(result.failed[0].error).toMatch(/refused/);
  });

  it("saves, lists, reopens and deletes projects", async () => {
    const p = { ...newProject(), title: "Exercise plan", layers: [
      layer(),
      { ...layer(), id: "b", backing: { kind: "ontology-features" as const, collection: "patrols" } },
    ] };
    expect(await saveProject(client, p)).toBe("created");
    expect(await saveProject(client, { ...p, title: "Exercise plan v2" })).toBe("modified");
    const list = await listProjects(client);
    expect(list.find((x) => x.id === p.id)?.title).toBe("Exercise plan v2");
    const opened = await openProject(client, p.id);
    expect(opened.layers).toHaveLength(2);
    // Local layers keep their features; backed layers reload theirs from the Ontology.
    expect((opened.layers[0] as VectorLayerNode).data.features).toHaveLength(2);
    expect((opened.layers[1] as VectorLayerNode).data.features).toHaveLength(0);
    await deleteProject(client, p.id);
    expect((await listProjects(client)).find((x) => x.id === p.id)).toBeUndefined();
  });

  it("rejects calls without a token like Foundry does", async () => {
    const anon = new OntologyClient({ foundryUrl: foundry.foundryUrl, getToken: async () => "nope" });
    await expect(anon.listOntologies()).rejects.toThrow(/401/);
  });
});
