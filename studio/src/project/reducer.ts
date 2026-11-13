/**
 * Every change to a project is one of these actions, applied by one pure
 * function, with history kept as whole snapshots. Projects are small (the
 * heavy data is tiles in Foundry), so snapshots are cheap and undo is exact.
 */
import type { Geometry } from "geojson";
import type { Connection } from "../data/library";
import type { LayerNode, MapView, Project, StudioFeature, VectorLayerNode } from "./types";

export type Action =
  | { type: "replace"; project: Project }
  | { type: "setTitle"; title: string }
  | { type: "setConnection"; connection: Connection | null }
  | { type: "setView"; view: MapView }
  | { type: "setGlobe"; globe: boolean }
  | { type: "addLayer"; layer: LayerNode; at?: number }
  | { type: "removeLayer"; id: string }
  | { type: "moveLayer"; id: string; delta: number }
  | { type: "updateLayer"; id: string; patch: Partial<LayerNode> }
  | { type: "addFeature"; layerId: string; feature: StudioFeature }
  | { type: "setGeometry"; layerId: string; featureId: string; geometry: Geometry }
  | { type: "setProperty"; layerId: string; featureId: string; field: string; value: unknown }
  | { type: "deleteFeatures"; layerId: string; ids: string[] }
  | { type: "addField"; layerId: string; field: string }
  | { type: "removeField"; layerId: string; field: string }
  | { type: "undo" }
  | { type: "redo" };

/** Actions that do not go into the undo history. */
const TRANSIENT = new Set<Action["type"]>(["setView"]);
const HISTORY_LIMIT = 100;

export interface History {
  past: Project[];
  present: Project;
  future: Project[];
}

function mapVector(p: Project, id: string, fn: (l: VectorLayerNode) => VectorLayerNode): Project {
  return {
    ...p,
    layers: p.layers.map((l) => (l.id === id && l.kind === "vector" ? fn(l) : l)),
  };
}

function withFeatures(l: VectorLayerNode, features: StudioFeature[]): VectorLayerNode {
  return { ...l, data: { ...l.data, features } };
}

export function apply(p: Project, a: Action): Project {
  switch (a.type) {
    case "replace":
      return a.project;
    case "setTitle":
      return { ...p, title: a.title };
    case "setConnection":
      return { ...p, connection: a.connection };
    case "setView":
      return { ...p, view: a.view };
    case "setGlobe":
      return { ...p, globe: a.globe };
    case "addLayer": {
      const layers = [...p.layers];
      layers.splice(a.at ?? layers.length, 0, a.layer);
      return { ...p, layers };
    }
    case "removeLayer":
      return { ...p, layers: p.layers.filter((l) => l.id !== a.id) };
    case "moveLayer": {
      const i = p.layers.findIndex((l) => l.id === a.id);
      const j = i + a.delta;
      if (i < 0 || j < 0 || j >= p.layers.length) {return p;}
      const layers = [...p.layers];
      const [moved] = layers.splice(i, 1);
      layers.splice(j, 0, moved);
      return { ...p, layers };
    }
    case "updateLayer":
      return {
        ...p,
        layers: p.layers.map((l) => (l.id === a.id ? ({ ...l, ...a.patch } as LayerNode) : l)),
      };
    case "addFeature":
      return mapVector(p, a.layerId, (l) => withFeatures(l, [...l.data.features, a.feature]));
    case "setGeometry":
      return mapVector(p, a.layerId, (l) =>
        withFeatures(l, l.data.features.map((f) => (f.id === a.featureId ? { ...f, geometry: a.geometry } : f))),
      );
    case "setProperty":
      return mapVector(p, a.layerId, (l) =>
        withFeatures(
          l,
          l.data.features.map((f) =>
            f.id === a.featureId ? { ...f, properties: { ...f.properties, [a.field]: a.value } } : f,
          ),
        ),
      );
    case "deleteFeatures": {
      const ids = new Set(a.ids);
      return mapVector(p, a.layerId, (l) => withFeatures(l, l.data.features.filter((f) => !ids.has(f.id))));
    }
    case "addField":
      return mapVector(p, a.layerId, (l) => (l.fields.includes(a.field) ? l : { ...l, fields: [...l.fields, a.field] }));
    case "removeField":
      return mapVector(p, a.layerId, (l) => ({
        ...withFeatures(
          l,
          l.data.features.map((f) => {
            const { [a.field]: _removed, ...rest } = f.properties ?? {};
            return { ...f, properties: rest };
          }),
        ),
        fields: l.fields.filter((f) => f !== a.field),
      }));
    default:
      return p;
  }
}

export function historyReducer(h: History, a: Action): History {
  if (a.type === "undo") {
    if (h.past.length === 0) {return h;}
    // Undo restores content, not the camera: keep looking where you are.
    const previous = { ...h.past[h.past.length - 1], view: h.present.view };
    return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
  }
  if (a.type === "redo") {
    if (h.future.length === 0) {return h;}
    const next = { ...h.future[0], view: h.present.view };
    return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
  }
  const present = apply(h.present, a);
  if (present === h.present) {return h;}
  if (a.type === "replace") {return { past: [], present, future: [] };}
  if (TRANSIENT.has(a.type)) {return { ...h, present };}
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present, future: [] };
}

/** Every field a vector layer's features carry, declared ones first. */
export function fieldsOf(layer: VectorLayerNode): string[] {
  const seen = new Set(layer.fields);
  const out = [...layer.fields];
  for (const f of layer.data.features) {
    for (const k of Object.keys(f.properties ?? {})) {
      if (!seen.has(k) && !k.startsWith("__")) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  return out;
}
