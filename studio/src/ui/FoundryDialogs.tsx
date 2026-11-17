import { useEffect, useState, type ReactNode } from "react";
import { listCollections, listProjects, type ProjectSummary } from "../foundry/layers";
import { geoProperties, type ObjectTypeDef, type OntologyClient } from "../foundry/ontology";

export function Dialog({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? "dialog wide" : "dialog"} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="small" onClick={onClose}>Close</button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload(): void } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => !cancelled && setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

/** Open or delete a project saved in Foundry. */
export function ProjectsDialog({ client, currentId, onOpen, onDelete, onClose }: {
  client: OntologyClient;
  currentId: string;
  onOpen(id: string): void;
  onDelete(id: string): Promise<void>;
  onClose(): void;
}) {
  const { data, error, loading, reload } = useAsync<ProjectSummary[]>(() => listProjects(client), [client]);
  const [filter, setFilter] = useState("");
  const rows = (data ?? []).filter((p) => p.title.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Dialog title="Projects in Foundry" onClose={onClose}>
      <input className="dialog-filter" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter projects" autoFocus />
      {loading && <p className="empty">Loading…</p>}
      {error && <p className="error-box">{error}</p>}
      {data && rows.length === 0 && <p className="empty">No saved projects{filter ? " match" : " yet — use Project → Save to Foundry"}.</p>}
      <ul className="pick-list">
        {rows.map((p) => (
          <li key={p.id}>
            <div>
              <strong>{p.title}</strong>
              <small className="muted">{[p.updatedAt?.slice(0, 16).replace("T", " "), p.updatedBy].filter(Boolean).join(" · ")}{p.id === currentId ? " · open now" : ""}</small>
            </div>
            <button type="button" className="small" onClick={() => onOpen(p.id)}>Open</button>
            <button type="button" className="small" onClick={() => { if (confirm(`Delete “${p.title}” from Foundry for everyone?`)) {void onDelete(p.id).then(reload);} }}>Delete</button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Pick an Ontology layer: a geo object type (read-only) or a MapFeature collection (editable). */
export function OntologyDialog({ client, onAddType, onAddCollection, onClose }: {
  client: OntologyClient;
  onAddType(type: ObjectTypeDef, geometryProperty: string): void;
  onAddCollection(name: string): void;
  onClose(): void;
}) {
  const types = useAsync(() => client.geoObjectTypes(), [client]);
  const collections = useAsync(() => listCollections(client), [client]);
  const [filter, setFilter] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const q = filter.toLowerCase();
  const own = new Set([client.studio.featureType, client.studio.projectType]);
  return (
    <Dialog title="Add from the Ontology" onClose={onClose} wide>
      <input className="dialog-filter" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter" autoFocus />
      <div className="dialog-cols">
        <section>
          <h3>Object types with a location <small className="muted">read-only</small></h3>
          {types.loading && <p className="empty">Loading…</p>}
          {types.error && <p className="error-box">{types.error}</p>}
          <ul className="pick-list">
            {(types.data ?? []).filter((t) => !own.has(t.apiName) && (t.displayName.toLowerCase().includes(q) || t.apiName.toLowerCase().includes(q))).map((t) =>
              geoProperties(t).map((g) => (
                <li key={`${t.apiName}:${g}`}>
                  <div>
                    <strong>{t.pluralDisplayName ?? t.displayName}</strong>
                    <small className="muted">{t.apiName} · located by <code>{g}</code> ({t.properties[g].dataType.type})</small>
                  </div>
                  <button type="button" className="small" onClick={() => onAddType(t, g)}>Add</button>
                </li>
              )),
            )}
          </ul>
        </section>
        <section>
          <h3>Feature collections <small className="muted">editable</small></h3>
          {collections.loading && <p className="empty">Loading…</p>}
          {collections.error && <p className="error-box">{collections.error}</p>}
          <ul className="pick-list">
            {(collections.data ?? []).filter((c) => c.name.toLowerCase().includes(q)).map((c) => (
              <li key={c.name}>
                <div><strong>{c.name || "(no collection)"}</strong><small className="muted">{c.count} features</small></div>
                <button type="button" className="small" onClick={() => onAddCollection(c.name)}>Add</button>
              </li>
            ))}
          </ul>
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (newCollection.trim()) {onAddCollection(newCollection.trim());} }}>
            <input placeholder="New collection name" value={newCollection} onChange={(e) => setNewCollection(e.target.value)} aria-label="New collection name" />
            <button type="submit" className="small" disabled={!newCollection.trim()}>Create</button>
          </form>
          <p className="hint">Drawing into a collection and pressing <em>Commit</em> writes MapFeature objects through Actions.</p>
        </section>
      </div>
    </Dialog>
  );
}
