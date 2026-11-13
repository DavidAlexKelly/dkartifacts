import type { Dispatch } from "react";
import type { Action } from "../project/reducer";
import type { LayerNode } from "../project/types";
import { Icon } from "./Icon";

interface Props {
  layers: LayerNode[];
  activeId: string | null;
  errors: Map<string, string>;
  onActivate(id: string): void;
  onZoomTo(node: LayerNode): void;
  onNewLayer(): void;
  dispatch: Dispatch<Action>;
}

function kindLabel(node: LayerNode): string {
  if (node.kind === "vector") {return `${node.data.features.length} feature${node.data.features.length === 1 ? "" : "s"}`;}
  return "catalog";
}

/** The layer tree, top of the map first (the project stores bottom first). */
export function LayersPanel({ layers, activeId, errors, onActivate, onZoomTo, onNewLayer, dispatch }: Props) {
  const ordered = [...layers].reverse();
  return (
    <section className="panel" aria-label="Layers">
      <div className="panel-head">
        <h2>Layers</h2>
        <button type="button" className="small" onClick={onNewLayer} title="An empty layer to draw into"><Icon name="plus" size={14} /> New layer</button>
      </div>
      {ordered.length === 0 && <p className="empty">No layers yet. Add some from the catalog below, or import a file.</p>}
      <ul className="layer-list">
        {ordered.map((node, i) => {
          const error = node.kind === "catalog" ? errors.get(node.catalogId) : undefined;
          return (
            <li key={node.id} className={node.id === activeId ? "layer active" : "layer"} onClick={() => onActivate(node.id)}>
              <input
                type="checkbox"
                checked={node.visible}
                aria-label={`Show ${node.title}`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => dispatch({ type: "updateLayer", id: node.id, patch: { visible: e.target.checked } })}
              />
              <span className="swatch" style={{ background: node.kind === "vector" ? node.style.color : "linear-gradient(135deg,#9bb 0%,#dca 100%)" }} />
              <span className="layer-name" title={error ?? node.title}>
                {node.title}
                <small className={error ? "error" : ""}>{error ? "⚠ " + error : kindLabel(node)}</small>
              </span>
              <span className="layer-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="icon tiny" title="Zoom to layer" onClick={() => onZoomTo(node)}><Icon name="zoom" size={14} /></button>
                <button type="button" className="icon tiny" title="Move up" disabled={i === 0} onClick={() => dispatch({ type: "moveLayer", id: node.id, delta: 1 })}><Icon name="up" size={14} /></button>
                <button type="button" className="icon tiny" title="Move down" disabled={i === ordered.length - 1} onClick={() => dispatch({ type: "moveLayer", id: node.id, delta: -1 })}><Icon name="down" size={14} /></button>
                <button type="button" className="icon tiny" title="Remove layer" onClick={() => dispatch({ type: "removeLayer", id: node.id })}><Icon name="trash" size={14} /></button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
