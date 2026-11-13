import { useMemo, useState, type Dispatch } from "react";
import { fieldsOf, type Action } from "../project/reducer";
import type { StudioFeature, VectorLayerNode } from "../project/types";
import { Icon } from "./Icon";

interface Props {
  layer: VectorLayerNode | null;
  selected: string[];
  onSelect(ids: string[]): void;
  onZoomTo(feature: StudioFeature): void;
  dispatch: Dispatch<Action>;
}

const ROW_LIMIT = 2000;

function parseCell(text: string, previous: unknown): unknown {
  if (text === "") {return null;}
  if (typeof previous === "number" || /^-?\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n)) {return n;}
  }
  if (typeof previous === "boolean" && /^(true|false)$/i.test(text)) {return text.toLowerCase() === "true";}
  return text;
}

function show(v: unknown): string {
  if (v === null || v === undefined) {return "";}
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** The active vector layer as a table: filter, select, edit cells, add and remove fields and rows. */
export function AttributeTable({ layer, selected, onSelect, onZoomTo, dispatch }: Props) {
  const [filter, setFilter] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [newField, setNewField] = useState("");
  const [sort, setSort] = useState<{ field: string; dir: 1 | -1 } | null>(null);
  const fields = useMemo(() => (layer ? fieldsOf(layer) : []), [layer]);

  const rows = useMemo(() => {
    if (!layer) {return [];}
    const q = filter.trim().toLowerCase();
    const sel = new Set(selected);
    let out = layer.data.features.filter((f) =>
      (!onlySelected || sel.has(f.id)) && (!q || fields.some((k) => show(f.properties[k]).toLowerCase().includes(q))),
    );
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = a.properties[sort.field];
        const y = b.properties[sort.field];
        if (typeof x === "number" && typeof y === "number") {return (x - y) * sort.dir;}
        return show(x).localeCompare(show(y), undefined, { numeric: true }) * sort.dir;
      });
    }
    return out;
  }, [layer, filter, onlySelected, selected, fields, sort]);

  if (!layer) {
    return <section className="table-dock"><p className="empty">Select a vector layer (one you imported or drew) to see its attributes.</p></section>;
  }
  const sel = new Set(selected);
  return (
    <section className="table-dock" aria-label="Attribute table">
      <div className="table-tools">
        <strong>{layer.title}</strong>
        <span className="muted">{rows.length} of {layer.data.features.length} features{selected.length ? ` · ${selected.length} selected` : ""}</span>
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter rows" />
        <label className="check"><input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> Selected only</label>
        <form onSubmit={(e) => { e.preventDefault(); const f = newField.trim(); if (f) {dispatch({ type: "addField", layerId: layer.id, field: f }); setNewField("");} }}>
          <input placeholder="New field" value={newField} onChange={(e) => setNewField(e.target.value)} aria-label="New field name" />
          <button type="submit" className="small">Add field</button>
        </form>
        <button type="button" className="small" disabled={!selected.length} onClick={() => dispatch({ type: "deleteFeatures", layerId: layer.id, ids: selected })}><Icon name="trash" size={14} /> Delete selected</button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th />
              <th>geometry</th>
              {fields.map((f) => (
                <th key={f}>
                  <button type="button" className="th" onClick={() => setSort(sort?.field === f ? (sort.dir === 1 ? { field: f, dir: -1 } : null) : { field: f, dir: 1 })}>
                    {f}{sort?.field === f ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </button>
                  <button type="button" className="th-x" title={`Remove field ${f}`} onClick={() => { if (confirm(`Remove the field “${f}” from every feature?`)) {dispatch({ type: "removeField", layerId: layer.id, field: f });} }}>×</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, ROW_LIMIT).map((f) => (
              <tr key={f.id} className={sel.has(f.id) ? "selected" : ""}>
                <td>
                  <button type="button" className="icon tiny" title="Select and zoom to" onClick={() => { onSelect([f.id]); onZoomTo(f); }}><Icon name="zoom" size={13} /></button>
                </td>
                <td className="muted" onClick={(e) => onSelect(e.shiftKey ? (sel.has(f.id) ? selected.filter((x) => x !== f.id) : [...selected, f.id]) : [f.id])}>{f.geometry.type}</td>
                {fields.map((k) => (
                  <td key={k}>
                    <input
                      className="cell"
                      defaultValue={show(f.properties[k])}
                      key={`${f.id}:${k}:${show(f.properties[k])}`}
                      onBlur={(e) => {
                        const v = parseCell(e.target.value, f.properties[k]);
                        if (show(v) !== show(f.properties[k])) {dispatch({ type: "setProperty", layerId: layer.id, featureId: f.id, field: k, value: v });}
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") {(e.target as HTMLInputElement).blur();} }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > ROW_LIMIT && <p className="muted">Showing the first {ROW_LIMIT} rows; filter to narrow down.</p>}
      </div>
    </section>
  );
}
