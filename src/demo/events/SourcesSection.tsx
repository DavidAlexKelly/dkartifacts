/**
 * The "Sources" part of the side panel: what is loaded, what each source was
 * understood to contain, what went wrong, and a form to add another.
 */

import React, { useState } from "react";
import { panelCheckbox, panelFigures, panelMuted, panelToggle, panelVar } from "@/components/mapPanel";
import { categoryMeta, type CategoryRegistry } from "./categories";
import type { CategoryOverrides } from "./categoryOverrides";
import type { EventCategory } from "./mockEvents";
import { describeFieldMap } from "./format";
import {
  SOURCE_KINDS,
  parseSourceInput,
  type SourceConfig,
  type SourceKind,
} from "./sources/config";
import { MAX_ROWS } from "./sources/foundry";
import type { SourceState, SourceStatus } from "./sources/useEventSources";
import {
  actionButton,
  dot,
  iconButton,
  input,
  kindBadge,
  liveBadge,
  disclosure,
  problemText,
  select,
  sourceHeader,
  sourceName,
  sourceRow,
  warningText,
} from "./styles";

const STATUS_COLOURS: Record<SourceStatus, string> = {
  loading: "#e0b64a",
  ready: "#5fd08a",
  live: "#5fd08a",
  error: "#e5484d",
};

const KIND_LABEL: Record<SourceKind, string> = {
  dataset: "Dataset",
  mediaset: "Media",
  stream: "Stream",
};

export interface SourcesSectionProps {
  states: SourceState[];
  mock: boolean;
  onMockChange: (value: boolean) => void;
  onAdd: (config: SourceConfig) => void;
  onRemove: (key: string) => void;
  onReload: (key: string) => void;
  /** A column to title the source's events with, or undefined for detected. */
  onTitleChange: (key: string, field: string | undefined) => void;
  registry: CategoryRegistry;
  overrides: CategoryOverrides;
  /** Put a whole source into a category, or undefined to detect again. */
  onSourceCategory: (key: string, category: string | undefined) => void;
  /** Put every record of a source whose category value is `value` into a category. */
  onValueCategory: (key: string, value: string, category: string | undefined) => void;
  /** Why edits here will not be remembered, when they will not. */
  sessionOnly: "url" | "workshop" | null;
  /** Sources set by Workshop variables: shown, not removable here. */
  pinnedKeys: ReadonlySet<string>;
  /** Workshop variable entries that are not valid for their variable. */
  workshopProblems: Array<{ variable: string; entry: string; error: string }>;
  /** Embedded, and Workshop has not sent its variables yet. */
  waitingForWorkshop: boolean;
  /** Off: the sources are the module's — no adding, removing or mock toggle. */
  allowSourceEditing?: boolean;
  /** Off: no putting sources or values into categories. */
  allowCategoryEditing?: boolean;
}

export function SourcesSection({
  states,
  mock,
  onMockChange,
  onAdd,
  onRemove,
  onReload,
  onTitleChange,
  sessionOnly,
  pinnedKeys,
  workshopProblems,
  waitingForWorkshop,
  registry,
  overrides,
  onSourceCategory,
  onValueCategory,
  allowSourceEditing = true,
  allowCategoryEditing = true,
}: SourcesSectionProps): React.ReactElement {
  const problems = states.filter((state) => state.problem).length + workshopProblems.length;
  const live = states.some((state) => state.status === "live");
  return (
    <details open style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <summary style={disclosure}>
        Sources · {states.length}
        {live && " · live"}
        {problems > 0 && <span style={{ color: panelVar.danger }}> · {problems} with problems</span>}
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
        {allowSourceEditing && (
          <label style={panelToggle}>
            <input
              type="checkbox"
              checked={mock}
              onChange={(event) => onMockChange(event.target.checked)}
              style={panelCheckbox}
            />
            Mock events
          </label>
        )}
        {!allowSourceEditing && mock && <div style={panelMuted}>Showing mock events.</div>}
        {states.map((state) => (
          <SourceRow
            key={state.key}
            state={state}
            onRemove={() => onRemove(state.key)}
            onReload={() => onReload(state.key)}
            onTitleChange={(field) => onTitleChange(state.key, field)}
            pinned={pinnedKeys.has(state.key)}
            removable={allowSourceEditing}
            categoryEditing={allowCategoryEditing}
            registry={registry}
            forced={overrides.sources[state.key]}
            valueOverrides={overrides.values[state.key] ?? {}}
            onSourceCategory={(category) => onSourceCategory(state.key, category)}
            onValueCategory={(value, category) => onValueCategory(state.key, value, category)}
          />
        ))}
        {waitingForWorkshop && <div style={panelMuted}>Waiting for Workshop's variables…</div>}
        {workshopProblems.map((problem) => (
          <div key={`${problem.variable}:${problem.entry}`} style={warningText}>
            <strong>Ignored in {problem.variable}:</strong>{" "}
            <span style={{ wordBreak: "break-all" }}>{problem.entry}</span> — {problem.error}
          </div>
        ))}
        {sessionOnly === "url" && (
          <div style={panelMuted}>Sources from the page URL — changes here are not saved.</div>
        )}
        {sessionOnly === "workshop" && allowSourceEditing && (
          <div style={panelMuted}>
            Embedded in Workshop: sources added here last for this session. Set them in the
            widget's event-monitor variables to keep them.
          </div>
        )}
        {allowSourceEditing && <AddSourceForm onAdd={onAdd} registry={registry} />}
      </div>
    </details>
  );
}

function SourceRow({
  state,
  onRemove,
  onReload,
  onTitleChange,
  pinned,
  removable,
  categoryEditing,
  registry,
  forced,
  valueOverrides,
  onSourceCategory,
  onValueCategory,
}: {
  state: SourceState;
  onRemove: () => void;
  onReload: () => void;
  onTitleChange: (field: string | undefined) => void;
  /** From a Workshop variable: removed there, not here. */
  pinned: boolean;
  /** Whether sources may be removed here at all. */
  removable: boolean;
  categoryEditing: boolean;
  registry: CategoryRegistry;
  /** The category everything in this source was put into, if any. */
  forced: string | undefined;
  valueOverrides: Record<string, string>;
  onSourceCategory: (category: string | undefined) => void;
  onValueCategory: (value: string, category: string | undefined) => void;
}): React.ReactElement {
  const { status, problem, fields } = state;
  const title = state.config.item ? `${state.name} · ${state.config.rid}` : state.config.rid;
  return (
    <div style={sourceRow}>
      <div style={sourceHeader}>
        <span style={dot(STATUS_COLOURS[status])} aria-label={status} />
        <span style={sourceName} title={title}>
          {state.name}
        </span>
        {status === "live" && <span style={liveBadge}>LIVE</span>}
        <span style={kindBadge}>{KIND_LABEL[state.config.kind]}</span>
        {state.config.kind !== "stream" && (
          <button type="button" style={iconButton} onClick={onReload} title="Reload" aria-label="Reload source">
            ↻
          </button>
        )}
        {pinned ? (
          <span style={kindBadge} title="Set by a Workshop variable — change it in the module">
            Workshop
          </span>
        ) : removable ? (
          <button type="button" style={iconButton} onClick={onRemove} title="Remove" aria-label="Remove source">
            ×
          </button>
        ) : null}
      </div>

      {status === "loading" && <div style={panelMuted}>Loading…</div>}

      {status !== "loading" && status !== "error" && (
        <div style={panelFigures}>
          {state.events.length.toLocaleString("en-GB")} events
          {state.areas.length > 0 && ` · ${state.areas.length.toLocaleString("en-GB")} areas`}
          {state.skipped > 0 && ` · ${state.skipped.toLocaleString("en-GB")} without location`}
        </div>
      )}
      {state.truncated && (
        <div style={warningText}>Only the first {MAX_ROWS.toLocaleString("en-GB")} rows were read.</div>
      )}
      {state.columns.length > 0 && status !== "error" && (
        <TitlePicker
          columns={state.columns}
          value={state.config.titleField}
          detected={state.detectedTitle}
          onChange={onTitleChange}
        />
      )}
      {fields?.geo && <div style={{ ...panelMuted, wordBreak: "break-word" }}>{describeFieldMap(fields)}</div>}
      {state.config.category && (
        <div style={panelMuted}>
          Default category: {categoryMeta(registry, state.config.category).label}
        </div>
      )}
      {categoryEditing && status !== "loading" && status !== "error" && state.events.length + state.areas.length > 0 && (
        <CategoryControls
          state={state}
          registry={registry}
          forced={forced}
          valueOverrides={valueOverrides}
          onSourceCategory={onSourceCategory}
          onValueCategory={onValueCategory}
        />
      )}

      {problem && (
        <div style={status === "error" ? problemText : warningText}>
          <strong>{problem.title}.</strong> {problem.detail}
          {problem.remediation && <div style={{ marginTop: 2 }}>{problem.remediation}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Which column titles this source's events. "Auto" is whatever detection
 * chose (named, so it is clear what choosing a column replaces); a column
 * chosen here is kept with the source and applied to what is already loaded.
 */
function TitlePicker({
  columns,
  value,
  detected,
  onChange,
}: {
  columns: string[];
  value: string | undefined;
  detected: string | undefined;
  onChange: (field: string | undefined) => void;
}): React.ReactElement {
  // A saved choice the source no longer has (a renamed column) is still shown
  // rather than silently reading as "Auto".
  const options = value && !columns.includes(value) ? [value, ...columns] : columns;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ ...panelMuted, flex: "none" }}>Title</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        style={{ ...select, flex: 1, minWidth: 0 }}
        aria-label="Title column"
      >
        <option value="">Auto{detected ? ` (${detected})` : " (none found)"}</option>
        {options.map((column) => (
          <option key={column} value={column}>
            {column}
            {value === column && !columns.includes(column) ? " (missing)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/** How many distinct values the mapping list shows before summarising the rest. */
const VALUE_LIMIT = 40;

/**
 * "Category: Detect / <category>" for the whole source, and — while it is not
 * forced into one — a category for each value of its category column.
 */
function CategoryControls({
  state,
  registry,
  forced,
  valueOverrides,
  onSourceCategory,
  onValueCategory,
}: {
  state: SourceState;
  registry: CategoryRegistry;
  forced: string | undefined;
  valueOverrides: Record<string, string>;
  onSourceCategory: (category: string | undefined) => void;
  onValueCategory: (value: string, category: string | undefined) => void;
}): React.ReactElement {
  // Distinct values as interpreted, before any override: how many records
  // say each, and the category detection gave them.
  const values = new Map<string, { count: number; detected: string }>();
  for (const item of [...state.events, ...state.areas]) {
    if (!item.categoryValue) {continue;}
    const entry = values.get(item.categoryValue);
    if (entry) {entry.count++;}
    else {values.set(item.categoryValue, { count: 1, detected: item.category });}
  }
  const sorted = [...values].sort((a, b) => b[1].count - a[1].count);
  const mapped = Object.keys(valueOverrides).filter((value) => registry.byId[valueOverrides[value]]).length;

  return (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ ...panelMuted, flex: "none" }}>Category</span>
        <select
          value={forced && registry.byId[forced] ? forced : ""}
          onChange={(event) => onSourceCategory(event.target.value || undefined)}
          style={{ ...select, flex: 1, minWidth: 0 }}
          aria-label="Source category"
        >
          <option value="">Detect from the data</option>
          {registry.order.map((id) => (
            <option key={id} value={id}>
              All as {registry.byId[id].label}
            </option>
          ))}
        </select>
      </label>
      {!forced && sorted.length > 0 && (
        <details>
          <summary style={{ ...panelMuted, cursor: "pointer" }}>
            Map values ({sorted.length}
            {mapped > 0 ? `, ${mapped} mapped` : ""})
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
            {sorted.slice(0, VALUE_LIMIT).map(([value, { count, detected }]) => (
              <label key={value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ ...panelMuted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={value}>
                  {value} <span style={panelFigures}>{count}</span>
                </span>
                <select
                  value={valueOverrides[value] && registry.byId[valueOverrides[value]] ? valueOverrides[value] : ""}
                  onChange={(event) => onValueCategory(value, event.target.value || undefined)}
                  style={{ ...select, width: 130, flex: "none" }}
                  aria-label={`Category for ${value}`}
                >
                  <option value="">{categoryMeta(registry, detected).label}</option>
                  {registry.order.map((id) => (
                    <option key={id} value={id}>
                      → {registry.byId[id].label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {sorted.length > VALUE_LIMIT && (
              <div style={panelMuted}>
                …and {sorted.length - VALUE_LIMIT} rarer values. Put the whole source into a
                category, or single events from their details panel.
              </div>
            )}
          </div>
        </details>
      )}
    </>
  );
}

function AddSourceForm({
  onAdd,
  registry,
}: {
  onAdd: (config: SourceConfig) => void;
  registry: CategoryRegistry;
}): React.ReactElement {
  const [kind, setKind] = useState<SourceKind>("dataset");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<EventCategory | "">("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseSourceInput(kind, text, category || undefined);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onAdd(parsed.config);
    setText("");
    setError(null);
    setOpen(false);
  };

  const placeholder = SOURCE_KINDS.find((entry) => entry.kind === kind)?.placeholder;

  if (!open) {
    return (
      <button type="button" style={actionButton} onClick={() => setOpen(true)}>
        + Add source
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
      <div style={{ display: "flex", gap: 4 }}>
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as SourceKind)}
          style={{ ...select, width: "auto", flex: 1 }}
          aria-label="Source kind"
        >
          {SOURCE_KINDS.map((entry) => (
            <option key={entry.kind} value={entry.kind}>
              {entry.label}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as EventCategory | "")}
          style={{ ...select, width: "auto", flex: 1 }}
          aria-label="Default category"
          title="Category for records that do not say"
        >
          <option value="">Category: detect</option>
          {registry.order.map((key) => (
            <option key={key} value={key}>
              {registry.byId[key].label}
            </option>
          ))}
        </select>
      </div>
      <input
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        placeholder={placeholder}
        style={input}
        aria-label="Source RID"
        spellCheck={false}
      />
      {error && <div style={problemText}>{error}</div>}
      <div style={{ display: "flex", gap: 4 }}>
        <button type="submit" style={{ ...actionButton, flex: 1 }} disabled={text.trim() === ""}>
          Add source
        </button>
        <button type="button" style={actionButton} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
