import { useEffect, useState } from "react";
import type { CatalogEntry, Connection, Library } from "../data/library";
import { Icon } from "./Icon";

interface Props {
  library: Library | null;
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

/** The catalog: where the data comes from, and what is in it. */
export function BrowserPanel({ library, error, loading, connection, foundryAvailable, onConnect, onAdd }: Props) {
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

  return (
    <section className="panel" aria-label="Catalog">
      <div className="panel-head"><h2>Catalog</h2></div>
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
      {library && (
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
    </section>
  );
}
