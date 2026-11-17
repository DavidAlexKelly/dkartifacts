import { useMemo, useState } from "react";
import { compile, FUNCTION_NAMES, tryCompile, VARIABLE_NAMES } from "../analysis/expression";
import { TOOLS, type ToolDef, type ToolResult } from "../analysis/processing";
import { selectByExpression, selectByLocation, type LocationPredicate } from "../analysis/select";
import { summarize } from "../analysis/stats";
import { fieldsOf } from "../project/reducer";
import type { StudioFeature, VectorLayerNode } from "../project/types";
import { Dialog } from "./FoundryDialogs";

export type AnalysisTab = "processing" | "select" | "calculate" | "stats";

export interface ProcessingRun {
  tool: string;
  title: string;
  params: Record<string, unknown>;
  at: string;
  output?: string;
}

interface Props {
  tab: AnalysisTab;
  onTab(tab: AnalysisTab): void;
  layers: VectorLayerNode[];
  activeId: string | null;
  selection: { layerId: string; featureIds: string[] } | null;
  history: ProcessingRun[];
  onResult(tool: ToolDef, params: Record<string, unknown>, result: ToolResult, inputTitle: string): void;
  onSelect(layerId: string, ids: string[]): void;
  onCalculate(layerId: string, field: string, values: Map<string, unknown>): void;
  onClose(): void;
}

type SelMode = "new" | "add" | "within";

function geometryKinds(l: VectorLayerNode): Set<string> {
  return new Set(l.data.features.map((f) => f.geometry.type.replace("Multi", "").replace("LineString", "line").replace("Polygon", "polygon").replace("Point", "point")));
}

function LayerSelect({ layers, value, onChange, geometry, label }: { layers: VectorLayerNode[]; value: string; onChange(v: string): void; geometry?: string; label: string }) {
  const ok = (l: VectorLayerNode) => !geometry || geometry === "any" || l.data.features.length === 0 || geometryKinds(l).has(geometry);
  return (
    <label className="row">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— choose a layer —</option>
        {[...layers].reverse().map((l) => (
          <option key={l.id} value={l.id} disabled={!ok(l)}>{l.title} ({l.data.features.length}){ok(l) ? "" : ` — needs ${geometry}s`}</option>
        ))}
      </select>
    </label>
  );
}

function combine(prev: string[], next: string[], mode: SelMode): string[] {
  if (mode === "new") {return next;}
  if (mode === "add") {return [...new Set([...prev, ...next])];}
  const n = new Set(next);
  return prev.filter((id) => n.has(id));
}

// ── Processing ─────────────────────────────────────────────────────────────

function Processing({ layers, activeId, selection, history, onResult }: Pick<Props, "layers" | "activeId" | "selection" | "history" | "onResult">) {
  const [query, setQuery] = useState("");
  const [toolId, setToolId] = useState(TOOLS[0].id);
  const tool = TOOLS.find((t) => t.id === toolId)!;
  const initial = (t: ToolDef): Record<string, unknown> => {
    // Pre-fill the first layer input with the active layer.
    const first = t.inputs.find((i) => i.kind === "layer");
    return first && activeId && layers.some((l) => l.id === activeId) ? { [first.name]: activeId } : {};
  };
  const [params, setParams] = useState<Record<string, unknown>>(() => initial(TOOLS[0]));
  const [selectedOnly, setSelectedOnly] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const value = (name: string, fallback: unknown) => (name in params ? params[name] : fallback);
  const pick = (t: ToolDef) => {
    setToolId(t.id);
    setError(null);
    setParams(initial(t));
    setSelectedOnly({});
  };

  const run = () => {
    setError(null);
    setBusy(true);
    // Let the button repaint before a long synchronous run.
    setTimeout(() => {
      try {
        const full: Record<string, unknown> = {};
        for (const i of tool.inputs) {full[i.name] = value(i.name, i.default);}
        const ctx = {
          layer: (id: string) => {
            const l = layers.find((x) => x.id === id);
            if (!l) {return null;}
            const name = tool.inputs.find((i) => full[i.name] === id && i.kind === "layer")?.name;
            const onlySel = name && selectedOnly[name] && selection?.layerId === id;
            const ids = onlySel ? new Set(selection!.featureIds) : null;
            return { features: ids ? l.data.features.filter((f) => ids.has(f.id)) : l.data.features, fields: fieldsOf(l), title: l.title };
          },
        };
        const result = tool.run(full, ctx);
        const firstLayer = tool.inputs.find((i) => i.kind === "layer");
        const inputTitle = firstLayer ? layers.find((l) => l.id === full[firstLayer.name])?.title ?? "" : "";
        onResult(tool, full, result, inputTitle);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const shown = TOOLS.filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="analysis-grid">
      <div>
        <input className="dialog-filter" placeholder="Search tools…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tools" />
        <ul className="tool-list">
          {shown.map((t) => (
            <li key={t.id}><button type="button" className={t.id === toolId ? "on" : ""} onClick={() => pick(t)} title={t.description}>{t.title}</button></li>
          ))}
        </ul>
      </div>
      <div className="props">
        <h3>{tool.title}</h3>
        <p className="hint">{tool.description}</p>
        {tool.inputs.map((i) => {
          if (i.kind === "layer") {
            const v = String(value(i.name, "") ?? "");
            return (
              <div key={i.name}>
                <LayerSelect layers={layers} value={v} onChange={(x) => setParams({ ...params, [i.name]: x })} geometry={i.geometry} label={i.label} />
                {v && selection?.layerId === v && selection.featureIds.length > 0 && (
                  <label className="row"><span /><span className="check"><input type="checkbox" checked={!!selectedOnly[i.name]} onChange={(e) => setSelectedOnly({ ...selectedOnly, [i.name]: e.target.checked })} /> Selected features only ({selection.featureIds.length})</span></label>
                )}
              </div>
            );
          }
          if (i.kind === "field") {
            const layerId = String(value(i.layer ?? "input", "") ?? "");
            const l = layers.find((x) => x.id === layerId);
            return (
              <label className="row" key={i.name}>
                <span>{i.label}</span>
                <select value={String(value(i.name, i.default ?? "") ?? "")} onChange={(e) => setParams({ ...params, [i.name]: e.target.value })}>
                  <option value="">{i.optional ? "— none —" : "— choose —"}</option>
                  {(l ? fieldsOf(l) : []).map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
            );
          }
          if (i.kind === "choice") {
            return (
              <label className="row" key={i.name}>
                <span>{i.label}</span>
                <select value={String(value(i.name, i.default ?? i.options?.[0]))} onChange={(e) => setParams({ ...params, [i.name]: e.target.value })}>
                  {(i.options ?? []).map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
            );
          }
          return (
            <label className="row" key={i.name}>
              <span>{i.label}</span>
              <input type={i.kind === "number" ? "number" : "text"} value={String(value(i.name, i.default ?? "") ?? "")} onChange={(e) => setParams({ ...params, [i.name]: i.kind === "number" ? Number(e.target.value) : e.target.value })} />
            </label>
          );
        })}
        {error && <p className="error-box">{error}</p>}
        <div className="button-row"><button type="button" className="small primary" disabled={busy} onClick={run}>{busy ? "Running…" : "Run"}</button></div>
        {history.length > 0 && (
          <>
            <h3>History</h3>
            <ul className="history">
              {[...history].reverse().slice(0, 12).map((h, n) => (
                <li key={n}>
                  <span>{h.title}</span> <small className="muted">{h.at.slice(11, 16)}{h.output ? ` → ${h.output}` : ""}</small>
                  <button type="button" className="link" onClick={() => { const t = TOOLS.find((x) => x.id === h.tool); if (t) {setToolId(t.id); setParams(h.params); setSelectedOnly({});} }}>reuse</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ── Select ─────────────────────────────────────────────────────────────────

function ExpressionInput({ value, onChange, fields }: { value: string; onChange(v: string): void; fields: string[] }) {
  const check = value.trim() ? tryCompile(value) : null;
  return (
    <>
      <textarea className="expr" value={value} onChange={(e) => onChange(e.target.value)} rows={3} spellCheck={false} aria-label="Expression" placeholder={`"height" > 2000 AND "type" = 'peak'`} />
      {check && !check.ok && <p className="error-box small-text">{check.error.message}</p>}
      <div className="chips">
        {fields.map((f) => <button key={f} type="button" className="chip" onClick={() => onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}"${f}"`)}>{f}</button>)}
        {VARIABLE_NAMES.map((v) => <button key={v} type="button" className="chip var" onClick={() => onChange(`${value} ${v}`.trim())}>{v}</button>)}
      </div>
      <details className="small-text"><summary>Functions</summary><p className="muted">{FUNCTION_NAMES.join(", ")} · operators: = != &lt; &gt; AND OR NOT, IN (…), LIKE '%x%', ILIKE, BETWEEN a AND b, IS NULL, ||</p></details>
    </>
  );
}

function Select({ layers, activeId, selection, onSelect }: Pick<Props, "layers" | "activeId" | "selection" | "onSelect">) {
  const [layerId, setLayerId] = useState(activeId && layers.some((l) => l.id === activeId) ? activeId : "");
  const [expr, setExpr] = useState("");
  const [mode, setMode] = useState<SelMode>("new");
  const [refId, setRefId] = useState("");
  const [refSelected, setRefSelected] = useState(false);
  const [predicate, setPredicate] = useState<LocationPredicate>("intersects");
  const [distance, setDistance] = useState(1000);
  const [error, setError] = useState<string | null>(null);
  const layer = layers.find((l) => l.id === layerId);
  const prev = selection?.layerId === layerId ? selection.featureIds : [];
  const preview = useMemo(() => {
    if (!layer || !expr.trim()) {return null;}
    try {
      return selectByExpression(layer.data.features, expr).length;
    } catch {
      return null;
    }
  }, [layer, expr]);

  const apply = (ids: string[]) => {
    onSelect(layerId, combine(prev, ids, mode));
    setError(null);
  };
  return (
    <div className="props">
      <LayerSelect layers={layers} value={layerId} onChange={setLayerId} label="Select in" />
      <label className="row"><span>Selection</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as SelMode)}>
          <option value="new">replace the selection</option>
          <option value="add">add to the selection</option>
          <option value="within">select within the selection</option>
        </select>
      </label>
      <h3>By expression</h3>
      <ExpressionInput value={expr} onChange={setExpr} fields={layer ? fieldsOf(layer) : []} />
      <div className="button-row">
        <button type="button" className="small primary" disabled={!layer || !expr.trim()} onClick={() => { try { apply(selectByExpression(layer!.data.features, expr)); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } }}>
          Select{preview !== null ? ` ${preview}` : ""}
        </button>
      </div>
      <h3>By location</h3>
      <label className="row"><span>Where features</span>
        <select value={predicate} onChange={(e) => setPredicate(e.target.value as LocationPredicate)}>
          <option value="intersects">intersect</option>
          <option value="within">are within</option>
          <option value="contains">contain</option>
          <option value="disjoint">do not touch</option>
          <option value="withinDistance">are within a distance of</option>
        </select>
      </label>
      {predicate === "withinDistance" && <label className="row"><span>Distance (m)</span><input type="number" value={distance} onChange={(e) => setDistance(Number(e.target.value))} /></label>}
      <LayerSelect layers={layers} value={refId} onChange={setRefId} label="Features of" />
      {refId && selection?.layerId === refId && selection.featureIds.length > 0 && (
        <label className="row"><span /><span className="check"><input type="checkbox" checked={refSelected} onChange={(e) => setRefSelected(e.target.checked)} /> only its selected features</span></label>
      )}
      <div className="button-row">
        <button type="button" className="small primary" disabled={!layer || !refId} onClick={() => {
          const ref = layers.find((l) => l.id === refId)!;
          const refIds = refSelected && selection?.layerId === refId ? new Set(selection.featureIds) : null;
          const geoms = ref.data.features.filter((f) => !refIds || refIds.has(f.id)).map((f) => f.geometry);
          try { apply(selectByLocation(layer!.data.features, geoms, predicate, distance)); } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
        }}>Select</button>
        <button type="button" className="small" disabled={!layer} onClick={() => onSelect(layerId, layer!.data.features.filter((f) => !prev.includes(f.id)).map((f) => f.id))}>Invert selection</button>
        <button type="button" className="small" disabled={!layer} onClick={() => onSelect(layerId, [])}>Clear</button>
      </div>
      {error && <p className="error-box">{error}</p>}
    </div>
  );
}

// ── Field calculator ───────────────────────────────────────────────────────

function Calculate({ layers, activeId, selection, onCalculate }: Pick<Props, "layers" | "activeId" | "selection" | "onCalculate">) {
  const editable = layers.filter((l) => !l.backing || l.backing.kind === "ontology-features");
  const [layerId, setLayerId] = useState(activeId && editable.some((l) => l.id === activeId) ? activeId : "");
  const [field, setField] = useState("");
  const [newField, setNewField] = useState("");
  const [expr, setExpr] = useState("");
  const [onlySel, setOnlySel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layer = editable.find((l) => l.id === layerId);
  const target = field === "__new" ? newField.trim() : field;
  const sample = useMemo(() => {
    if (!layer || !expr.trim()) {return null;}
    const c = tryCompile(expr);
    if (!c.ok) {return null;}
    return layer.data.features.slice(0, 3).map((f) => {
      try { return JSON.stringify(c.expr.evaluate(f)); } catch { return "error"; }
    });
  }, [layer, expr]);
  return (
    <div className="props">
      <LayerSelect layers={editable} value={layerId} onChange={setLayerId} label="Layer" />
      <label className="row"><span>Field</span>
        <select value={field} onChange={(e) => setField(e.target.value)}>
          <option value="">— choose —</option>
          <option value="__new">+ new field…</option>
          {(layer ? fieldsOf(layer) : []).map((f) => <option key={f}>{f}</option>)}
        </select>
      </label>
      {field === "__new" && <label className="row"><span>New field</span><input value={newField} onChange={(e) => setNewField(e.target.value)} /></label>}
      {layer && selection?.layerId === layer.id && selection.featureIds.length > 0 && (
        <label className="row"><span /><span className="check"><input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} /> Selected features only ({selection.featureIds.length})</span></label>
      )}
      <ExpressionInput value={expr} onChange={setExpr} fields={layer ? fieldsOf(layer) : []} />
      {sample && <p className="hint">First values: {sample.join(", ")}</p>}
      {error && <p className="error-box">{error}</p>}
      <div className="button-row">
        <button type="button" className="small primary" disabled={!layer || !target || !expr.trim()} onClick={() => {
          try {
            const c = compile(expr);
            const ids = onlySel && selection ? new Set(selection.featureIds) : null;
            const values = new Map<string, unknown>();
            for (const f of layer!.data.features) {if (!ids || ids.has(f.id)) {values.set(f.id, c.evaluate(f));}}
            onCalculate(layer!.id, target, values);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}>Calculate</button>
      </div>
    </div>
  );
}

// ── Statistics ─────────────────────────────────────────────────────────────

function Stats({ layers, activeId, selection }: Pick<Props, "layers" | "activeId" | "selection">) {
  const [layerId, setLayerId] = useState(activeId && layers.some((l) => l.id === activeId) ? activeId : "");
  const [field, setField] = useState("");
  const [onlySel, setOnlySel] = useState(false);
  const layer = layers.find((l) => l.id === layerId);
  const result = useMemo(() => {
    if (!layer || !field) {return null;}
    const ids = onlySel && selection?.layerId === layer.id ? new Set(selection.featureIds) : null;
    const features: StudioFeature[] = layer.data.features.filter((f) => !ids || ids.has(f.id));
    return summarize(features, field);
  }, [layer, field, onlySel, selection]);
  const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : +n.toPrecision(6));
  return (
    <div className="props">
      <LayerSelect layers={layers} value={layerId} onChange={setLayerId} label="Layer" />
      <label className="row"><span>Field</span>
        <select value={field} onChange={(e) => setField(e.target.value)}>
          <option value="">— choose —</option>
          {(layer ? fieldsOf(layer) : []).map((f) => <option key={f}>{f}</option>)}
        </select>
      </label>
      {layer && selection?.layerId === layer.id && selection.featureIds.length > 0 && (
        <label className="row"><span /><span className="check"><input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} /> Selected features only</span></label>
      )}
      {result && (
        <dl className="meta">
          <dt>Values</dt><dd>{result.count} ({result.nulls} empty)</dd>
          {result.numeric && <>
            <dt>Sum</dt><dd>{fmt(result.numeric.sum)}</dd>
            <dt>Mean</dt><dd>{fmt(result.numeric.mean)}</dd>
            <dt>Median</dt><dd>{fmt(result.numeric.median)}</dd>
            <dt>Min – max</dt><dd>{fmt(result.numeric.min)} – {fmt(result.numeric.max)}</dd>
            <dt>Std dev</dt><dd>{fmt(result.numeric.stdev)}</dd>
          </>}
          <dt>Most common</dt><dd>{result.unique.slice(0, 8).map((u) => `${u.value || "(empty)"} ×${u.count}`).join(", ")}</dd>
        </dl>
      )}
    </div>
  );
}

export function AnalysisDialog(props: Props) {
  const tabs: Array<[AnalysisTab, string]> = [["processing", "Processing"], ["select", "Select"], ["calculate", "Field calculator"], ["stats", "Statistics"]];
  return (
    <Dialog title="Analysis" onClose={props.onClose} wide>
      <div className="tabs" role="tablist">
        {tabs.map(([t, label]) => <button key={t} type="button" role="tab" aria-selected={props.tab === t} className={props.tab === t ? "tab on" : "tab"} onClick={() => props.onTab(t)}>{label}</button>)}
      </div>
      {props.layers.length === 0 && <p className="empty">Analysis works on vector layers. Import, draw or add one first.</p>}
      {props.tab === "processing" && <Processing {...props} />}
      {props.tab === "select" && <Select {...props} />}
      {props.tab === "calculate" && <Calculate {...props} />}
      {props.tab === "stats" && <Stats {...props} />}
    </Dialog>
  );
}
