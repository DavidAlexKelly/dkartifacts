import type { Dispatch } from "react";
import type { CatalogEntry } from "../data/library";
import type { LayerManifest } from "../data/manifest";
import { catalogKind } from "../map/style";
import { fieldsOf, type Action } from "../project/reducer";
import { PALETTE, type BasemapFlavor, type CatalogLayerNode, type LayerNode, type VectorLayerNode, type VectorStyle } from "../project/types";

interface Props {
  node: LayerNode | null;
  entry?: CatalogEntry;
  manifest?: LayerManifest;
  glyphs: boolean;
  dispatch: Dispatch<Action>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="row">
      <span>{label}</span>
      {children}
    </label>
  );
}

function VectorStyleEditor({ node, glyphs, dispatch }: { node: VectorLayerNode; glyphs: boolean; dispatch: Dispatch<Action> }) {
  const s = node.style;
  const set = (patch: Partial<VectorStyle>) => dispatch({ type: "updateLayer", id: node.id, patch: { style: { ...s, ...patch } } });
  const fields = fieldsOf(node);
  const categorize = (field: string) => {
    if (!field) {return set({ categorize: null });}
    const values = [...new Set(node.data.features.map((f) => String(f.properties[field] ?? "")))].slice(0, 40);
    set({ categorize: { field, colors: Object.fromEntries(values.map((v, i) => [v, PALETTE[i % PALETTE.length]])) } });
  };
  return (
    <>
      <h3>Symbology</h3>
      <Row label="Colour"><input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} /></Row>
      <Row label="Outline"><input type="color" value={s.strokeColor} onChange={(e) => set({ strokeColor: e.target.value })} /></Row>
      <Row label={`Line width ${s.strokeWidth}`}><input type="range" min={0.5} max={10} step={0.5} value={s.strokeWidth} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} /></Row>
      <Row label={`Fill opacity ${s.fillOpacity.toFixed(2)}`}><input type="range" min={0} max={1} step={0.05} value={s.fillOpacity} onChange={(e) => set({ fillOpacity: Number(e.target.value) })} /></Row>
      <Row label={`Point size ${s.radius}`}><input type="range" min={2} max={20} step={1} value={s.radius} onChange={(e) => set({ radius: Number(e.target.value) })} /></Row>
      <Row label="Colour by">
        <select value={s.categorize?.field ?? ""} onChange={(e) => categorize(e.target.value)}>
          <option value="">— single colour —</option>
          {fields.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Row>
      {s.categorize && (
        <ul className="categories">
          {Object.entries(s.categorize.colors).map(([value, color]) => (
            <li key={value}>
              <input type="color" value={color} onChange={(e) => set({ categorize: { ...s.categorize!, colors: { ...s.categorize!.colors, [value]: e.target.value } } })} />
              <span>{value === "" ? "(empty)" : value}</span>
            </li>
          ))}
        </ul>
      )}
      <h3>Labels</h3>
      {!glyphs && <p className="hint">Labels need the glyphs from an assets layer in the catalog (terrain-gen assets).</p>}
      <Row label="Label field">
        <select value={s.labelField ?? ""} disabled={!glyphs} onChange={(e) => set({ labelField: e.target.value || null })}>
          <option value="">— none —</option>
          {fields.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Row>
      <Row label={`Label size ${s.labelSize}`}><input type="range" min={8} max={24} value={s.labelSize} disabled={!glyphs} onChange={(e) => set({ labelSize: Number(e.target.value) })} /></Row>
    </>
  );
}

function CatalogOptions({ node, entry, manifest, glyphs, dispatch }: { node: CatalogLayerNode; entry?: CatalogEntry; manifest?: LayerManifest; glyphs: boolean; dispatch: Dispatch<Action> }) {
  const o = node.options;
  const set = (patch: Partial<CatalogLayerNode["options"]>) => dispatch({ type: "updateLayer", id: node.id, patch: { options: { ...o, ...patch } } });
  const kind = catalogKind(entry, manifest);
  return (
    <>
      {kind === "basemap" && (
        <>
          <h3>Basemap</h3>
          <Row label="Style">
            <select value={o.flavor ?? "light"} onChange={(e) => set({ flavor: e.target.value as BasemapFlavor })}>
              {["light", "dark", "white", "grayscale", "black"].map((f) => <option key={f}>{f}</option>)}
            </select>
          </Row>
          <Row label="Labels"><input type="checkbox" checked={o.labels !== false} disabled={!glyphs} onChange={(e) => set({ labels: e.target.checked })} /></Row>
        </>
      )}
      {kind === "raster-dem" && (
        <>
          <h3>Terrain</h3>
          <Row label="Hillshade"><input type="checkbox" checked={o.hillshade !== false} onChange={(e) => set({ hillshade: e.target.checked })} /></Row>
          <Row label="3D terrain"><input type="checkbox" checked={!!o.terrain3d} onChange={(e) => set({ terrain3d: e.target.checked })} /></Row>
          <Row label={`Exaggeration ${(o.exaggeration ?? 1.5).toFixed(1)}×`}><input type="range" min={0.5} max={5} step={0.1} value={o.exaggeration ?? 1.5} disabled={!o.terrain3d} onChange={(e) => set({ exaggeration: Number(e.target.value) })} /></Row>
          <p className="hint">Tilt the map (right-drag, or ctrl-drag) to see 3D terrain.</p>
        </>
      )}
      {(kind === "contours" || kind === "vector-tiles") && (
        <>
          <h3>Lines</h3>
          <Row label="Colour"><input type="color" value={o.color ?? "#8a5a2b"} onChange={(e) => set({ color: e.target.value })} /></Row>
          <Row label={`Width ${(o.width ?? 1).toFixed(1)}`}><input type="range" min={0.3} max={4} step={0.1} value={o.width ?? 1} onChange={(e) => set({ width: Number(e.target.value) })} /></Row>
          {kind === "contours" && <Row label="Height labels"><input type="checkbox" checked={o.labels !== false} disabled={!glyphs} onChange={(e) => set({ labels: e.target.checked })} /></Row>}
        </>
      )}
      {manifest && (
        <>
          <h3>Source</h3>
          <dl className="meta">
            <dt>Kind</dt><dd>{manifest.kind}</dd>
            {manifest.layers && <><dt>Zooms</dt><dd>{Math.min(...manifest.layers.map((l) => l.minZoom))}–{Math.max(...manifest.layers.map((l) => l.maxZoom))}</dd></>}
            {manifest.cells && <><dt>Cells</dt><dd>{manifest.cells.length}</dd></>}
            {entry?.bytes !== undefined && <><dt>Size</dt><dd>{(entry.bytes / 1e6).toFixed(1)} MB in {entry.files} files</dd></>}
            {manifest.provenance?.generatedAt && <><dt>Built</dt><dd>{manifest.provenance.generatedAt.slice(0, 16).replace("T", " ")}</dd></>}
            {manifest.provenance?.source && <><dt>From</dt><dd>{manifest.provenance.source}</dd></>}
            {manifest.attribution && <><dt>Credit</dt><dd className="small-text">{manifest.attribution}</dd></>}
          </dl>
        </>
      )}
    </>
  );
}

export function PropertiesPanel({ node, entry, manifest, glyphs, dispatch }: Props) {
  if (!node) {
    return (
      <section className="panel" aria-label="Layer properties">
        <div className="panel-head"><h2>Properties</h2></div>
        <p className="empty">Select a layer to style it.</p>
      </section>
    );
  }
  return (
    <section className="panel" aria-label="Layer properties">
      <div className="panel-head"><h2>Properties</h2></div>
      <div className="props">
        <Row label="Name"><input value={node.title} onChange={(e) => dispatch({ type: "updateLayer", id: node.id, patch: { title: e.target.value } })} /></Row>
        <Row label={`Opacity ${Math.round(node.opacity * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={node.opacity} onChange={(e) => dispatch({ type: "updateLayer", id: node.id, patch: { opacity: Number(e.target.value) } })} /></Row>
        {node.kind === "vector" ? <VectorStyleEditor node={node} glyphs={glyphs} dispatch={dispatch} /> : <CatalogOptions node={node} entry={entry} manifest={manifest} glyphs={glyphs} dispatch={dispatch} />}
      </div>
    </section>
  );
}
