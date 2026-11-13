/**
 * Map interaction: which tool is active decides what a click, drag or key does.
 *
 * Tools never touch the project themselves. They report intent through the
 * callbacks in ToolContext (add this feature, move this vertex, these are the
 * features under the cursor) and the app turns that into project actions, so
 * every edit goes through the reducer and is undoable.
 */
import type { Geometry, Position } from "geojson";
import type { Map as MlMap, MapGeoJSONFeature, MapMouseEvent, PointLike } from "maplibre-gl";
import type { VectorLayerNode } from "../project/types";
import { deleteVertex, insertVertex, moveVertex, vertices, type Path } from "./geometry";
import { OVERLAY, layerIdOf } from "./style";

export type Tool =
  | "pan"
  | "identify"
  | "point"
  | "line"
  | "polygon"
  | "edit"
  | "measure-line"
  | "measure-area"
  | "profile";

export const SKETCH_TOOLS = new Set<Tool>(["line", "polygon", "measure-line", "measure-area", "profile"]);

export interface Draft {
  layerId: string;
  featureId: string;
  geometry: Geometry;
}

export interface ToolContext {
  tool: Tool;
  activeVector: VectorLayerNode | null;
  selection: { layerId: string; featureIds: string[] } | null;
  sketch: Position[];
  snapping: boolean;
  setSketch(s: Position[]): void;
  setCursor(c: { lngLat: Position; snapped: boolean } | null): void;
  finishSketch(coords: Position[]): void;
  addPoint(at: Position): void;
  select(sel: { layerId: string; featureIds: string[] } | null): void;
  setDraft(d: Draft | null): void;
  commitGeometry(d: Draft): void;
  deleteSelected(): void;
  identify(features: MapGeoJSONFeature[], at: Position): void;
}

const SNAP_PX = 12;

function snapTarget(map: MlMap, ctx: ToolContext, e: MapMouseEvent, skip?: { featureId: string; path: Path }): { at: Position; snapped: boolean } {
  const raw: Position = [e.lngLat.lng, e.lngLat.lat];
  const layer = ctx.activeVector;
  if (!ctx.snapping || !layer || !layer.visible || layer.data.features.length > 5000) {return { at: raw, snapped: false };}
  let best: Position | null = null;
  let bestD = SNAP_PX;
  for (const f of layer.data.features) {
    for (const v of vertices(f.geometry)) {
      if (skip && f.id === skip.featureId && v.path.join() === skip.path.join()) {continue;}
      const p = map.project([v.coord[0], v.coord[1]]);
      const d = Math.hypot(p.x - e.point.x, p.y - e.point.y);
      if (d < bestD) {
        bestD = d;
        best = v.coord;
      }
    }
  }
  return best ? { at: [best[0], best[1]], snapped: true } : { at: raw, snapped: false };
}

function vectorHits(map: MlMap, point: PointLike | [PointLike, PointLike], onlyLayer?: string): MapGeoJSONFeature[] {
  return map
    .queryRenderedFeatures(point)
    .filter((f) => !f.layer.id.startsWith(OVERLAY) && f.properties?.__fid !== undefined)
    .filter((f) => !onlyLayer || layerIdOf(f.layer.id) === onlyLayer);
}

function box(e: MapMouseEvent, r = 4): [PointLike, PointLike] {
  return [
    [e.point.x - r, e.point.y - r],
    [e.point.x + r, e.point.y + r],
  ];
}

/** Drop consecutive duplicates — a double-click finishing a line lands two clicks on one spot. */
function dedupe(coords: Position[]): Position[] {
  return coords.filter((c, i) => i === 0 || Math.abs(c[0] - coords[i - 1][0]) > 1e-10 || Math.abs(c[1] - coords[i - 1][1]) > 1e-10);
}

export function attachTools(map: MlMap, get: () => ToolContext): () => void {
  let drag: { draft: Draft; path: Path } | null = null;

  const selectedFeature = (ctx: ToolContext) => {
    const sel = ctx.selection;
    if (!sel || !ctx.activeVector || sel.layerId !== ctx.activeVector.id || sel.featureIds.length !== 1) {return null;}
    return ctx.activeVector.data.features.find((f) => f.id === sel.featureIds[0]) ?? null;
  };

  const onClick = (e: MapMouseEvent) => {
    const ctx = get();
    const at: Position = [e.lngLat.lng, e.lngLat.lat];
    switch (ctx.tool) {
      case "pan":
      case "edit": {
        if (ctx.tool === "edit" && e.originalEvent.altKey) {return;} // handled on mousedown
        const hits = vectorHits(map, box(e), ctx.tool === "edit" ? ctx.activeVector?.id : undefined);
        if (hits.length === 0) {
          ctx.select(null);
          return;
        }
        const layerId = layerIdOf(hits[0].layer.id)!;
        const fid = String(hits[0].properties.__fid);
        const prev = ctx.selection;
        if (e.originalEvent.shiftKey && prev?.layerId === layerId) {
          const ids = prev.featureIds.includes(fid) ? prev.featureIds.filter((x) => x !== fid) : [...prev.featureIds, fid];
          ctx.select({ layerId, featureIds: ids });
        } else {
          ctx.select({ layerId, featureIds: [fid] });
        }
        return;
      }
      case "identify":
        ctx.identify(map.queryRenderedFeatures(box(e)).filter((f) => !f.layer.id.startsWith(OVERLAY)), at);
        return;
      case "point":
        ctx.addPoint(snapTarget(map, ctx, e).at);
        return;
      default:
        if (SKETCH_TOOLS.has(ctx.tool)) {ctx.setSketch([...ctx.sketch, snapTarget(map, ctx, e).at]);}
    }
  };

  const onDblClick = (e: MapMouseEvent) => {
    const ctx = get();
    if (!SKETCH_TOOLS.has(ctx.tool)) {return;}
    e.preventDefault();
    ctx.finishSketch(dedupe(ctx.sketch));
  };

  const onMove = (e: MapMouseEvent) => {
    const ctx = get();
    if (drag) {
      const { at, snapped } = snapTarget(map, ctx, e, { featureId: drag.draft.featureId, path: drag.path });
      drag.draft = { ...drag.draft, geometry: moveVertex(drag.draft.geometry, drag.path, at) };
      ctx.setDraft(drag.draft);
      ctx.setCursor({ lngLat: at, snapped });
      return;
    }
    if (ctx.tool === "point" || SKETCH_TOOLS.has(ctx.tool)) {
      const { at, snapped } = snapTarget(map, ctx, e);
      ctx.setCursor({ lngLat: at, snapped });
    } else {
      ctx.setCursor({ lngLat: [e.lngLat.lng, e.lngLat.lat], snapped: false });
    }
    if (ctx.tool === "edit") {
      const over = map.queryRenderedFeatures(box(e, 6), { layers: [`${OVERLAY}::handle`, `${OVERLAY}::mid`] });
      map.getCanvas().style.cursor = over.length ? "move" : "";
    }
  };

  const onDown = (e: MapMouseEvent) => {
    const ctx = get();
    if (ctx.tool !== "edit") {return;}
    const feature = selectedFeature(ctx);
    if (!feature) {return;}
    const hits = map.queryRenderedFeatures(box(e, 6), { layers: [`${OVERLAY}::handle`, `${OVERLAY}::mid`] });
    if (hits.length === 0) {return;}
    const props = hits[0].properties as { path: string; role: string };
    const path = JSON.parse(props.path) as Path;
    let geometry = feature.geometry;
    if (props.role === "handle" && e.originalEvent.altKey) {
      const next = deleteVertex(geometry, path);
      if (next) {ctx.commitGeometry({ layerId: ctx.activeVector!.id, featureId: feature.id, geometry: next });}
      return;
    }
    if (props.role === "mid") {geometry = insertVertex(geometry, path, [e.lngLat.lng, e.lngLat.lat]);}
    e.preventDefault();
    map.dragPan.disable();
    const draft: Draft = { layerId: ctx.activeVector!.id, featureId: feature.id, geometry };
    drag = { draft, path };
    ctx.setDraft(draft);
  };

  const onUp = () => {
    if (!drag) {return;}
    const ctx = get();
    ctx.commitGeometry(drag.draft);
    ctx.setDraft(null);
    drag = null;
    map.dragPan.enable();
  };

  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {return;}
    const ctx = get();
    if (e.key === "Escape") {
      ctx.setSketch([]);
      ctx.select(null);
    } else if (e.key === "Enter" && SKETCH_TOOLS.has(ctx.tool)) {
      ctx.finishSketch(dedupe(ctx.sketch));
    } else if (e.key === "Backspace" && SKETCH_TOOLS.has(ctx.tool) && ctx.sketch.length) {
      e.preventDefault();
      ctx.setSketch(ctx.sketch.slice(0, -1));
    } else if ((e.key === "Delete" || e.key === "Backspace") && ctx.selection?.featureIds.length) {
      e.preventDefault();
      ctx.deleteSelected();
    }
  };

  const onLeave = () => get().setCursor(null);

  map.on("click", onClick);
  map.on("dblclick", onDblClick);
  map.on("mousemove", onMove);
  map.on("mousedown", onDown);
  map.on("mouseup", onUp);
  map.getCanvas().addEventListener("mouseleave", onLeave);
  window.addEventListener("keydown", onKey);
  return () => {
    map.off("click", onClick);
    map.off("dblclick", onDblClick);
    map.off("mousemove", onMove);
    map.off("mousedown", onDown);
    map.off("mouseup", onUp);
    map.getCanvas().removeEventListener("mouseleave", onLeave);
    window.removeEventListener("keydown", onKey);
  };
}
