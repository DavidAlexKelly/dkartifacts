/**
 * The "Sources" part of the side panel: what is loaded, what each source was
 * understood to contain, what went wrong, and a form to add another.
 */

import React, { useState } from "react";
import { panelCheckbox, panelFigures, panelMuted, panelToggle } from "@/components/mapPanel";
import { CATEGORIES, CATEGORY_ORDER } from "./eventsLayer";
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
  /** Why edits here will not be remembered, when they will not. */
  sessionOnly: "url" | "workshop" | null;
  /** Sources set by Workshop variables: shown, not removable here. */
  pinnedKeys: ReadonlySet<string>;
  /** Workshop variable entries that are not valid for their variable. */
  workshopProblems: Array<{ variable: string; entry: string; error: string }>;
  /** Embedded, and Workshop has not sent its variables yet. */
  waitingForWorkshop: boolean;
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
}: SourcesSectionProps): React.ReactElement {
  const problems = states.filter((state) => state.problem).length + workshopProblems.length;
  const live = states.some((state) => state.status === "live");
  return (
    <details open style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <summary style={disclosure}>
        Sources · {states.length}
        {live && " · live"}
        {problems > 0 && <span style={{ color: "#ff9a92" }}> · {problems} with problems</span>}
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
        <label style={panelToggle}>
          <input
            type="checkbox"
            checked={mock}
            onChange={(event) => onMockChange(event.target.checked)}
            style={panelCheckbox}
          />
          Mock events
        </label>
        {states.map((state) => (
          <SourceRow
            key={state.key}
            state={state}
            onRemove={() => onRemove(state.key)}
            onReload={() => onReload(state.key)}
            onTitleChange={(field) => onTitleChange(state.key, field)}
            pinned={pinnedKeys.has(state.key)}
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
        {sessionOnly === "workshop" && (
          <div style={panelMuted}>
            Embedded in Workshop: sources added here last for this session. Set them in the
            widget's event-monitor variables to keep them.
          </div>
        )}
        <AddSourceForm onAdd={onAdd} />
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
}: {
  state: SourceState;
  onRemove: () => void;
  onReload: () => void;
  onTitleChange: (field: string | undefined) => void;
  /** From a Workshop variable: removed there, not here. */
  pinned: boolean;
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
        ) : (
          <button type="button" style={iconButton} onClick={onRemove} title="Remove" aria-label="Remove source">
            ×
          </button>
        )}
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
        <div style={panelMuted}>Default category: {CATEGORIES[state.config.category].label}</div>
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

function AddSourceForm({ onAdd }: { onAdd: (config: SourceConfig) => void }): React.ReactElement {
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
          {CATEGORY_ORDER.map((key) => (
            <option key={key} value={key}>
              {CATEGORIES[key].label}
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
