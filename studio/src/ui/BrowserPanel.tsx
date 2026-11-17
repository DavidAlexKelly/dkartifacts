import { useEffect, useState } from "react";
import type { CatalogEntry, Connection, Library } from "../data/library";
import { Icon } from "./Icon";

interface Props {
  library: Library;
  onAddDataset(text: string): Promise<void>;
  labels: { title: string } | null;
  onRemoveLabels(): void;
  error: string | null;
  loading: boolean;
  connection: Connection | null;
  foundryAvailable: boolean;
  onConnect(c: Connection): void;
  onAdd(entry: CatalogEntry): void;
}

const KIND_LABEL: Record<string, string> = {
  "raster-dem": "terrain",
  raster: "raster",
  "vector-tiles": "vector tiles",
  "dem-cells": "DEM cells",
  assets: "glyphs/sprites",
};

const mb = (b?: number) => (b === undefined ? "" : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);

/**
 * Where data comes from. Normally: paste a dataset ID and it is added — the
 * dataset's own manifest says what it is. A catalog (one ID listing many
 * datasets) is an optional shortcut below that.
 */
export function BrowserPanel({ library, onAddDataset, labels, onRemoveLabels, error, loading, connection, foundryAvailable, onConnect, onAdd }: Props) {
  const [datasetText, setDatasetText] = useState("");
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Connection["kind"]>(connection?.kind ?? (foundryAvailable ? "foundry" : "http"));
  const [value, setValue] = useState(connection ? (connection.kind === "http" ? connection.baseUrl : connection.catalogRid) : "");
  useEffect(() => {
    if (connection) {
      setKind(connection.kind);
      setValue(connection.kind === "http" ? connection.baseUrl : connection.catalogRid);
    }
  }, [connection]);

  const submit = () => {
    const v = value.trim();
    if (!v) {return;}
    onConnect(kind === "http" ? { kind, baseUrl: v } : { kind, catalogRid: v });
  };

  const add = async () => {
    const text = datasetText.trim();
    if (!text) {return;}
    setAdding(true);
    try {
      await onAddDataset(text);
      setDatasetText("");
    } catch {
      /* the app reports it */
    } finally {
      setAdding(false);
    }
  };

  const hasCatalog = !!connection && library.catalog.layers.length > 0;
  return (
    <section className="panel" aria-label="Data">
      <div className="panel-head"><h2>Add data</h2></div>
      <form className="connect two" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <input
          value={datasetText}
          onChange={(e) => setDatasetText(e.target.value)}
          placeholder={foundryAvailable ? "ri.foundry.main.dataset.…" : "Folder URL, e.g. /data/terrain/"}
          aria-label="Dataset ID or folder URL"
        />
        <button type="submit" className="small" disabled={adding || !datasetText.trim()}><Icon name="plus" size={14} /> {adding ? "Adding…" : "Add"}</button>
      </form>
      <p className="hint">
        Any dataset terrain-gen made: terrain, hillshade, contours, DEM cells, basemap. Add the <em>assets</em> dataset to turn labels on.
        Files (GeoJSON, CSV, KML, GPX) go in through Data → Import, or drop them on the map.
      </p>
      <p className="labels-status">
        {labels ? <>Labels: <strong>{labels.title}</strong> <button type="button" className="link" onClick={onRemoveLabels}>remove</button></> : <span className="muted">Labels: off — no assets dataset added</span>}
      </p>

      <details className="catalog" open={hasCatalog}>
        <summary>Catalog <span className="muted">(optional)</span></summary>
        <p className="hint">One ID that lists many datasets at once — terrain-gen's <em>catalog</em> folder.</p>
      <form className="connect" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as Connection["kind"])} aria-label="Source type">
          <option value="foundry" disabled={!foundryAvailable}>Foundry dataset</option>
          <option value="http">Folder (URL)</option>
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "foundry" ? "ri.foundry.main.dataset.… (catalog)" : "/data/"} aria-label="Catalog location" />
        <button type="submit" className="small">Open</button>
      </form>
      {loading && <p className="empty">Loading catalog…</p>}
      {error && <p className="error-box">{error}</p>}
      {connection && !loading && !error && library.catalog.layers.length === 0 && <p className="empty">This catalog lists no datasets.</p>}
      {library.catalog.layers.length > 0 && (
        <ul className="catalog-list">
          {library.catalog.layers.filter((e) => e.kind !== "assets").map((entry) => {
            const why = library.unavailable(entry);
            return (
              <li key={entry.id} title={why ?? entry.attribution ?? ""}>
                <div>
                  <strong>{entry.title}</strong>
                  <small>
                    <span className="badge">{KIND_LABEL[entry.kind] ?? entry.kind}</span> {mb(entry.bytes)}
                    {entry.files ? ` · ${entry.files} files` : ""}
                  </small>
                  {why && <small className="error">{why}</small>}
                </div>
                <button type="button" className="small" disabled={!!why} onClick={() => onAdd(entry)} title="Add to the map"><Icon name="plus" size={14} /> Add</button>
              </li>
            );
          })}
          {library.catalog.layers.some((e) => e.kind === "assets") && <li className="note">Glyphs and sprites: available, used for labels.</li>}
        </ul>
      )}
      </details>
    </section>
  );
}
