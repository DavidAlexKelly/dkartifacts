import type { Dispatch } from "react";
import type { CatalogEntry } from "../data/library";
import type { LayerManifest } from "../data/manifest";
import { catalogKind } from "../map/style";
import { buildCategories, buildGraduated, legendFor, modeOf, type StyleMode } from "../map/symbology";
import { RAMP_NAMES, type RampName } from "../analysis/classify";
import { tryCompile } from "../analysis/expression";
import { FeatureForm, FieldRules } from "./FeatureForm";
import { download } from "../formats/vector";
import { ASPECT_LEGEND, SLOPE_CLASSES } from "../analysis/derivedtiles";
import { fieldsOf, type Action } from "../project/reducer";
import { PALETTE, type BasemapFlavor, type CatalogLayerNode, type LayerNode, type VectorLayerNode, type VectorStyle, isEditable, type StudioFeature } from "../project/types";

export interface FoundryLayerActions {
  ready: boolean;
  status?: { text: string; error?: boolean; busy?: boolean };
  onCommit(layer: VectorLayerNode): void;
  onReload(layer: VectorLayerNode): void;
  onPublish(layer: VectorLayerNode): void;
}

interface Props {
  selectedFeature?: StudioFeature | null;
  foundry: FoundryLayerActions;
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
  const setLayer = (patch: Partial<VectorLayerNode>) => dispatch({ type: "updateLayer", id: node.id, patch });
  const fields = fieldsOf(node);
  const feats = node.data.features;
  const numeric = fields.filter((f) => feats.some((x) => typeof x.properties[f] === "number"));
  const mode = modeOf(s);
  const hasPoints = feats.some((f) => f.geometry.type.endsWith("Point"));
  const hasPolygons = feats.some((f) => f.geometry.type.endsWith("Polygon"));
  const g = s.graduated;
  const regraduate = (patch: Partial<NonNullable<VectorStyle["graduated"]>>) => {
    const next = { field: g?.field ?? numeric[0] ?? "", method: g?.method ?? "jenks", classes: g?.classes ?? 5, ramp: g?.ramp ?? "viridis", ...patch } as NonNullable<VectorStyle["graduated"]>;
    if (!next.field) {return set({ mode: "graduated", graduated: null });}
    set({ mode: "graduated", graduated: buildGraduated(feats, next.field, next.method, next.classes, next.ramp) });
  };
  const setMode = (m: StyleMode) => {
    if (m === "categorized") {
      const field = s.categorize?.field ?? fields[0];
      return set({ mode: m, categorize: field ? { field, colors: buildCategories(feats, field) } : null });
    }
    if (m === "graduated" && !g) {return regraduate({});}
    if (m === "rules" && !(s.rules ?? []).length) {return set({ mode: m, rules: [{ expr: fields[0] ? `"${fields[0]}" IS NOT NULL` : "true", color: s.color, label: "" }] });}
    if (m === "heatmap" && !s.heatmap) {return set({ mode: m, heatmap: { radius: 25, intensity: 1, weightField: null } });}
    set({ mode: m });
  };
  const rules = s.rules ?? [];
  const setRule = (i: number, patch: Partial<(typeof rules)[number]>) => set({ rules: rules.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const fieldSelect = (value: string | null | undefined, onChange: (v: string) => void, list = fields, none = "— none —") => (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{none}</option>
      {list.map((f) => <option key={f}>{f}</option>)}
    </select>
  );
  return (
    <>
      <h3>Symbology</h3>
      <Row label="Style">
        <select value={mode} onChange={(e) => setMode(e.target.value as StyleMode)}>
          <option value="single">Single symbol</option>
          <option value="categorized">Categorized (by value)</option>
          <option value="graduated" disabled={!numeric.length}>Graduated (numeric classes)</option>
          <option value="rules">Rule-based (expressions)</option>
          <option value="heatmap" disabled={!hasPoints}>Heatmap (points)</option>
        </select>
      </Row>
      {mode === "single" && <Row label="Colour"><input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} /></Row>}
      {mode === "categorized" && (
        <>
          <Row label="By field">{fieldSelect(s.categorize?.field, (f) => set({ categorize: f ? { field: f, colors: buildCategories(feats, f) } : null }), fields, "— choose —")}</Row>
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
        </>
      )}
      {mode === "graduated" && (
        <>
          <Row label="Field">{fieldSelect(g?.field, (f) => regraduate({ field: f }), numeric, "— choose —")}</Row>
          <Row label="Method">
            <select value={g?.method ?? "jenks"} onChange={(e) => regraduate({ method: e.target.value as NonNullable<VectorStyle["graduated"]>["method"] })}>
              <option value="jenks">Natural breaks (Jenks)</option>
              <option value="quantile">Quantiles (equal count)</option>
              <option value="equal">Equal interval</option>
              <option value="stddev">Standard deviation</option>
            </select>
          </Row>
          <Row label={`Classes ${g?.classes ?? 5}`}><input type="range" min={2} max={9} value={g?.classes ?? 5} onChange={(e) => regraduate({ classes: Number(e.target.value) })} /></Row>
          <Row label="Colour ramp">
            <select value={g?.ramp ?? "viridis"} onChange={(e) => regraduate({ ramp: e.target.value as RampName })}>
              {RAMP_NAMES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Row>
        </>
      )}
      {mode === "rules" && (
        <>
          <p className="hint">First matching rule wins. Expressions as in Select by expression, e.g. <code>"height" &gt; 2000</code>.</p>
          <ul className="rules">
            {rules.map((r, i) => {
              const check = r.expr.trim() ? tryCompile(r.expr) : null;
              return (
                <li key={i}>
                  <input type="color" value={r.color} onChange={(e) => setRule(i, { color: e.target.value })} />
                  <input className={check && !check.ok ? "bad" : ""} value={r.expr} onChange={(e) => setRule(i, { expr: e.target.value })} title={check && !check.ok ? check.error.message : r.expr} aria-label={`Rule ${i + 1} expression`} />
                  <input value={r.label} placeholder="legend label" onChange={(e) => setRule(i, { label: e.target.value })} aria-label={`Rule ${i + 1} label`} />
                  <button type="button" className="icon tiny" title="Remove rule" onClick={() => set({ rules: rules.filter((_, k) => k !== i) })}>×</button>
                </li>
              );
            })}
          </ul>
          <div className="button-row">
            <button type="button" className="small" onClick={() => set({ rules: [...rules, { expr: "", color: PALETTE[rules.length % PALETTE.length], label: "" }] })}>Add rule</button>
            <label className="check"><input type="checkbox" checked={s.rulesElse !== false} onChange={(e) => set({ rulesElse: e.target.checked })} /> show the rest in grey</label>
          </div>
        </>
      )}
      {mode === "heatmap" && (
        <>
          <Row label={`Radius ${s.heatmap?.radius ?? 25}px`}><input type="range" min={5} max={80} value={s.heatmap?.radius ?? 25} onChange={(e) => set({ heatmap: { ...(s.heatmap ?? { intensity: 1 }), radius: Number(e.target.value) } as VectorStyle["heatmap"] })} /></Row>
          <Row label={`Intensity ${(s.heatmap?.intensity ?? 1).toFixed(1)}`}><input type="range" min={0.2} max={5} step={0.1} value={s.heatmap?.intensity ?? 1} onChange={(e) => set({ heatmap: { ...(s.heatmap ?? { radius: 25 }), intensity: Number(e.target.value) } as VectorStyle["heatmap"] })} /></Row>
          <Row label="Weight by">{fieldSelect(s.heatmap?.weightField, (f) => set({ heatmap: { ...(s.heatmap ?? { radius: 25, intensity: 1 }), weightField: f || null } }), numeric, "— count —")}</Row>
        </>
      )}
      {mode !== "heatmap" && (
        <>
          <Row label="Outline"><input type="color" value={s.strokeColor} onChange={(e) => set({ strokeColor: e.target.value })} /></Row>
          <Row label={`Line width ${s.strokeWidth}`}><input type="range" min={0.5} max={10} step={0.5} value={s.strokeWidth} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} /></Row>
          {hasPolygons && <Row label={`Fill opacity ${s.fillOpacity.toFixed(2)}`}><input type="range" min={0} max={1} step={0.05} value={s.fillOpacity} onChange={(e) => set({ fillOpacity: Number(e.target.value) })} /></Row>}
        </>
      )}
      {hasPoints && mode !== "heatmap" && (
        <>
          <h3>Points</h3>
          <Row label="Marker">
            <select value={s.marker ?? "circle"} onChange={(e) => set({ marker: e.target.value as VectorStyle["marker"] })}>
              {["circle", "square", "triangle", "star", "cross"].map((m) => <option key={m}>{m}</option>)}
              <option value="milsymbol">military symbol (SIDC field)</option>
            </select>
          </Row>
          {s.marker === "milsymbol" && <Row label="SIDC field">{fieldSelect(s.sidcField, (f) => set({ sidcField: f || null }), fields, "— choose —")}</Row>}
          <Row label={`Size ${s.radius}`}><input type="range" min={2} max={24} step={1} value={s.radius} disabled={!!s.size} onChange={(e) => set({ radius: Number(e.target.value) })} /></Row>
        </>
      )}
      {mode !== "heatmap" && (numeric.length > 0) && (
        <>
          <Row label="Size by">{fieldSelect(s.size?.field, (f) => set({ size: f ? { field: f, min: s.size?.min ?? 3, max: s.size?.max ?? 20 } : null }), numeric, "— fixed size —")}</Row>
          {s.size && <Row label={`Size range ${s.size.min}–${s.size.max}`}><span className="pair"><input type="number" min={1} max={60} value={s.size.min} onChange={(e) => set({ size: { ...s.size!, min: Number(e.target.value) } })} /><input type="number" min={1} max={80} value={s.size.max} onChange={(e) => set({ size: { ...s.size!, max: Number(e.target.value) } })} /></span></Row>}
        </>
      )}
      {legendFor(node).length > 0 && (
        <ul className="legend block">{legendFor(node).map((e, i) => <li key={i}><span style={{ background: e.color }} />{e.label}</li>)}</ul>
      )}
      {hasPolygons && (
        <>
          <h3>3D</h3>
          <Row label="Extrude polygons"><input type="checkbox" checked={!!s.extrude} onChange={(e) => set({ extrude: e.target.checked ? { field: null, height: 100, scale: 1 } : null })} /></Row>
          {s.extrude && (
            <>
              <Row label="Height from">{fieldSelect(s.extrude.field, (f) => set({ extrude: { ...s.extrude!, field: f || null } }), numeric, "— fixed —")}</Row>
              {s.extrude.field
                ? <Row label="× scale"><input type="number" step={0.1} value={s.extrude.scale} onChange={(e) => set({ extrude: { ...s.extrude!, scale: Number(e.target.value) } })} /></Row>
                : <Row label="Height (m)"><input type="number" value={s.extrude.height} onChange={(e) => set({ extrude: { ...s.extrude!, height: Number(e.target.value) } })} /></Row>}
              <p className="hint">Tilt the map to see it (right-drag).</p>
            </>
          )}
        </>
      )}
      <h3>Labels</h3>
      {!glyphs && <p className="hint">Labels need the glyphs from an assets dataset (Add data).</p>}
      <Row label="Label field">{fieldSelect(s.labelField, (f) => set({ labelField: f || null }))}</Row>
      <Row label={`Label size ${s.labelSize}`}><input type="range" min={8} max={24} value={s.labelSize} disabled={!glyphs} onChange={(e) => set({ labelSize: Number(e.target.value) })} /></Row>
      <h3>Visibility</h3>
      <Row label="Show from zoom"><input type="number" min={0} max={24} value={node.minZoom ?? ""} placeholder="any" onChange={(e) => setLayer({ minZoom: e.target.value === "" ? undefined : Number(e.target.value) })} /></Row>
      <Row label="Hide past zoom"><input type="number" min={0} max={24} value={node.maxZoom ?? ""} placeholder="never" onChange={(e) => setLayer({ maxZoom: e.target.value === "" ? undefined : Number(e.target.value) })} /></Row>
      <Row label="Time field">{fieldSelect(node.timeField, (f) => setLayer({ timeField: f || null }), fields, "— none —")}</Row>
      <div className="button-row">
        <button type="button" className="small" onClick={() => download(`${node.title}.style.json`, JSON.stringify({ format: "decho-studio-style/1", style: s }, null, 1), "application/json")}>Save style…</button>
        <label className="small file-button">Load style…<input type="file" accept=".json" hidden onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) {return;}
          try {
            const raw = JSON.parse(await file.text()) as { format?: string; style?: VectorStyle };
            if (raw.format !== "decho-studio-style/1" || !raw.style) {throw new Error("not a Decho Studio style file");}
            set(raw.style);
          } catch (err) {
            alert(`Could not load the style: ${err instanceof Error ? err.message : String(err)}`);
          }
        }} /></label>
      </div>
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
          <Row label="Colour by height"><input type="checkbox" checked={o.relief !== false} onChange={(e) => set({ relief: e.target.checked })} /></Row>
          <Row label="Slope classes"><input type="checkbox" checked={!!o.slope} onChange={(e) => set({ slope: e.target.checked })} /></Row>
          {o.slope && <ul className="legend">{SLOPE_CLASSES.map((c) => <li key={c.label}><span style={{ background: c.css }} />{c.label}</li>)}</ul>}
          <Row label="Aspect"><input type="checkbox" checked={!!o.aspect} onChange={(e) => set({ aspect: e.target.checked })} /></Row>
          {o.aspect && <ul className="legend">{ASPECT_LEGEND.map((c) => <li key={c.label}><span style={{ background: c.css }} />{c.label}</li>)}</ul>}
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

function FoundrySource({ node, foundry }: { node: VectorLayerNode; foundry: FoundryLayerActions }) {
  const b = node.backing;
  const pending = node.pending ? node.pending.created.length + node.pending.modified.length + node.pending.deleted.length : 0;
  return (
    <>
      <h3>Source</h3>
      {!b && (
        <>
          <p className="hint">Held in this project only.</p>
          <button type="button" className="small" disabled={!foundry.ready || node.data.features.length === 0} title={foundry.ready ? "Write every feature as a MapFeature object, then edit it in Foundry" : "Foundry is not configured"} onClick={() => foundry.onPublish(node)}>Publish to Foundry…</button>
        </>
      )}
      {b?.kind === "ontology-features" && (
        <>
          <p className="hint">Foundry feature collection <strong>{b.collection}</strong>. Edits stay here until you commit them; each one becomes an Action.</p>
          <div className="button-row">
            <button type="button" className="small primary" disabled={!pending || foundry.status?.busy} onClick={() => foundry.onCommit(node)}>Commit {pending || ""} edit{pending === 1 ? "" : "s"}</button>
            <button type="button" className="small" disabled={foundry.status?.busy} onClick={() => foundry.onReload(node)}>{pending ? "Discard and reload" : "Reload"}</button>
          </div>
        </>
      )}
      {b?.kind === "ontology" && (
        <>
          <p className="hint">Ontology object type <code>{b.objectType}</code>, located by <code>{b.geometryProperty}</code>. Read-only.</p>
          <button type="button" className="small" disabled={foundry.status?.busy} onClick={() => foundry.onReload(node)}>Reload</button>
        </>
      )}
      {b?.kind === "dataset" && (
        <>
          <p className="hint">Dataset <code>{b.datasetRid}</code>, read as a table (first {b.limit.toLocaleString()} rows). Read-only.</p>
          <button type="button" className="small" disabled={foundry.status?.busy} onClick={() => foundry.onReload(node)}>Reload</button>
        </>
      )}
      {foundry.status && <p className={foundry.status.error ? "error-box" : "hint"}>{foundry.status.text}</p>}
    </>
  );
}

export function PropertiesPanel({ node, entry, manifest, glyphs, dispatch, foundry, selectedFeature }: Props) {
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
        {node.kind === "vector" && selectedFeature && <FeatureForm layer={node} feature={selectedFeature} dispatch={dispatch} />}
        {node.kind === "vector" && <FoundrySource node={node} foundry={foundry} />}
        {node.kind === "vector" && isEditable(node) && <FieldRules layer={node} dispatch={dispatch} />}
        {node.kind === "vector" ? <VectorStyleEditor node={node} glyphs={glyphs} dispatch={dispatch} /> : <CatalogOptions node={node} entry={entry} manifest={manifest} glyphs={glyphs} dispatch={dispatch} />}
      </div>
    </section>
  );
}
