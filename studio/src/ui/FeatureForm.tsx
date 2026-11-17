import { useState, type Dispatch } from "react";
import { fieldsOf, type Action } from "../project/reducer";
import { isEditable, type FieldSpec, type FieldType, type StudioFeature, type VectorLayerNode } from "../project/types";

/** Problems with one feature's attributes against the layer's field rules. */
export function validateFeature(layer: VectorLayerNode, f: StudioFeature): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, spec] of Object.entries(layer.schema ?? {})) {
    const v = f.properties[field];
    const empty = v === null || v === undefined || v === "";
    if (empty) {
      if (spec.required) {errors[field] = "required";}
      continue;
    }
    if (spec.type === "number" && (typeof v !== "number" || !Number.isFinite(v))) {errors[field] = "must be a number";}
    else if (spec.type === "boolean" && typeof v !== "boolean") {errors[field] = "must be true or false";}
    else if (spec.type === "date" && Number.isNaN(Date.parse(String(v)))) {errors[field] = "must be a date";}
    else if (spec.options?.length && !spec.options.includes(String(v))) {errors[field] = `must be one of ${spec.options.join(", ")}`;}
  }
  return errors;
}

export function invalidFeatures(layer: VectorLayerNode, ids?: string[]): number {
  if (!layer.schema) {return 0;}
  const scope = ids ? new Set(ids) : null;
  return layer.data.features.filter((f) => (!scope || scope.has(f.id)) && Object.keys(validateFeature(layer, f)).length > 0).length;
}

function coerce(text: string, type: FieldType | undefined): unknown {
  if (text === "") {return null;}
  if (type === "number") {
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }
  if (type === "boolean") {return text === "true";}
  return text;
}

/** The selected feature's attributes as a form. */
export function FeatureForm({ layer, feature, dispatch }: { layer: VectorLayerNode; feature: StudioFeature; dispatch: Dispatch<Action> }) {
  const editable = isEditable(layer);
  const errors = validateFeature(layer, feature);
  const set = (field: string, value: unknown) => dispatch({ type: "setProperty", layerId: layer.id, featureId: feature.id, field, value });
  return (
    <>
      <h3>Feature <small className="muted">{feature.geometry.type} · {feature.id.length > 18 ? `${feature.id.slice(0, 16)}…` : feature.id}</small></h3>
      {fieldsOf(layer).map((field) => {
        const spec = layer.schema?.[field];
        const v = feature.properties[field];
        const text = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
        const label = `${field}${spec?.required ? " *" : ""}`;
        let input;
        if (spec?.options?.length) {
          input = (
            <select value={text} disabled={!editable} onChange={(e) => set(field, coerce(e.target.value, spec.type))}>
              <option value="">—</option>
              {spec.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          );
        } else if (spec?.type === "boolean") {
          input = <input type="checkbox" checked={v === true} disabled={!editable} onChange={(e) => set(field, e.target.checked)} />;
        } else {
          input = (
            <input
              key={`${feature.id}:${field}:${text}`}
              type={spec?.type === "number" ? "number" : spec?.type === "date" ? "date" : "text"}
              defaultValue={spec?.type === "date" ? text.slice(0, 10) : text}
              readOnly={!editable}
              className={errors[field] ? "bad" : ""}
              onBlur={(e) => {
                const next = coerce(e.target.value, spec?.type ?? (typeof v === "number" ? "number" : undefined));
                if (String(next ?? "") !== text) {set(field, next);}
              }}
              onKeyDown={(e) => { if (e.key === "Enter") {(e.target as HTMLInputElement).blur();} }}
            />
          );
        }
        return (
          <label className="row" key={field} title={errors[field] ?? ""}>
            <span className={errors[field] ? "error" : ""}>{label}</span>
            {input}
          </label>
        );
      })}
      {Object.keys(errors).length > 0 && <p className="error-box small-text">{Object.entries(errors).map(([k, e]) => `${k}: ${e}`).join(" · ")}</p>}
    </>
  );
}

/** Per-field rules: type, required, allowed values. */
export function FieldRules({ layer, dispatch }: { layer: VectorLayerNode; dispatch: Dispatch<Action> }) {
  const [open, setOpen] = useState(false);
  const schema = layer.schema ?? {};
  const set = (field: string, spec: FieldSpec | null) => {
    const next = { ...schema };
    if (spec) {next[field] = spec;} else {delete next[field];}
    dispatch({ type: "updateLayer", id: layer.id, patch: { schema: Object.keys(next).length ? next : undefined } });
  };
  const bad = invalidFeatures(layer);
  return (
    <details className="field-rules" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Field rules {Object.keys(schema).length ? `(${Object.keys(schema).length})` : ""}{bad ? <span className="error"> · {bad} features break them</span> : null}</summary>
      <table className="rules-table">
        <thead><tr><th>field</th><th>type</th><th>req.</th><th>allowed values</th></tr></thead>
        <tbody>
          {fieldsOf(layer).map((field) => {
            const spec = schema[field];
            return (
              <tr key={field}>
                <td>{field}</td>
                <td>
                  <select value={spec?.type ?? ""} onChange={(e) => set(field, e.target.value ? { ...(spec ?? {}), type: e.target.value as FieldType } : null)}>
                    <option value="">any</option>
                    <option value="string">text</option>
                    <option value="number">number</option>
                    <option value="boolean">yes/no</option>
                    <option value="date">date</option>
                  </select>
                </td>
                <td><input type="checkbox" checked={!!spec?.required} onChange={(e) => set(field, { ...spec, type: spec?.type ?? "string", required: e.target.checked })} /></td>
                <td>
                  <input
                    key={`${field}:${spec?.options?.join(",") ?? ""}`}
                    defaultValue={spec?.options?.join(", ") ?? ""}
                    placeholder="any"
                    onBlur={(e) => {
                      const options = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
                      set(field, { ...spec, type: spec?.type ?? "string", options: options.length ? options : undefined });
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
