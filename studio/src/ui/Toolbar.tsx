import { useRef } from "react";
import type { Tool } from "../map/tools";
import { Icon } from "./Icon";

const TOOLS: Array<{ tool: Tool; label: string; hint: string }> = [
  { tool: "pan", label: "Select", hint: "Pan the map; click a feature to select it (shift-click adds)" },
  { tool: "identify", label: "Identify", hint: "Click anywhere to see what is there, including the height" },
  { tool: "point", label: "Point", hint: "Click to add a point to the active layer" },
  { tool: "line", label: "Line", hint: "Click to add vertices; double-click or Enter to finish, Backspace to undo a vertex" },
  { tool: "polygon", label: "Polygon", hint: "Click to add vertices; double-click or Enter to finish" },
  { tool: "edit", label: "Edit", hint: "Select a feature, then drag its vertices; drag a midpoint to add one; alt-click to remove one" },
  { tool: "measure-line", label: "Distance", hint: "Measure a distance along a path" },
  { tool: "measure-area", label: "Area", hint: "Measure an area" },
  { tool: "profile", label: "Profile", hint: "Draw a line to see the terrain along it" },
];

interface Props {
  title: string;
  onTitle(title: string): void;
  tool: Tool;
  onTool(tool: Tool): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  snapping: boolean;
  onSnapping(on: boolean): void;
  globe: boolean;
  onGlobe(on: boolean): void;
  tableOpen: boolean;
  onTable(open: boolean): void;
  hasVector: boolean;
  onNew(): void;
  onOpen(file: File): void;
  onSave(): void;
  onImport(files: FileList): void;
  onExportPng(): void;
  onExportLayer(format: "geojson" | "csv" | "kml"): void;
}

function closeMenus() {
  document.querySelectorAll("details.menu[open]").forEach((d) => d.removeAttribute("open"));
}

export function Toolbar(p: Props) {
  const openInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const item = (label: string, fn: () => void, disabled = false, hint?: string) => (
    <button type="button" disabled={disabled} title={hint} onClick={() => { closeMenus(); fn(); }}>{label}</button>
  );
  return (
    <header className="toolbar">
      <div className="brand"><Icon name="layers" size={18} /> Decho Studio</div>
      <input className="title" value={p.title} onChange={(e) => p.onTitle(e.target.value)} aria-label="Map title" />
      <details className="menu">
        <summary>Project</summary>
        <div className="menu-items">
          {item("New project", p.onNew)}
          {item("Open project…", () => openInput.current?.click())}
          {item("Save project", p.onSave, false, "Ctrl+S")}
        </div>
      </details>
      <details className="menu">
        <summary>Data</summary>
        <div className="menu-items">
          {item("Import file…", () => importInput.current?.click(), false, "GeoJSON, CSV, KML or GPX — or drop files on the map")}
          {item("Export layer as GeoJSON", () => p.onExportLayer("geojson"), !p.hasVector)}
          {item("Export layer as CSV", () => p.onExportLayer("csv"), !p.hasVector)}
          {item("Export layer as KML", () => p.onExportLayer("kml"), !p.hasVector)}
          {item("Export map as PNG", p.onExportPng, false, "The current view, with title, legend, scale bar and north arrow")}
        </div>
      </details>
      <div className="sep" />
      <button type="button" className="icon" disabled={!p.canUndo} onClick={p.onUndo} title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
      <button type="button" className="icon" disabled={!p.canRedo} onClick={p.onRedo} title="Redo (Ctrl+Shift+Z)"><Icon name="redo" /></button>
      <div className="sep" />
      <div className="tools" role="radiogroup" aria-label="Map tool">
        {TOOLS.map((t) => (
          <button key={t.tool} type="button" role="radio" aria-checked={p.tool === t.tool} className={p.tool === t.tool ? "tool on" : "tool"} title={t.hint} onClick={() => p.onTool(t.tool)}>
            <Icon name={t.tool === "pan" ? "pan" : t.tool} /> <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="sep" />
      <button type="button" className={p.snapping ? "icon on" : "icon"} aria-pressed={p.snapping} onClick={() => p.onSnapping(!p.snapping)} title="Snap to vertices of the active layer"><Icon name="magnet" /></button>
      <button type="button" className={p.globe ? "icon on" : "icon"} aria-pressed={p.globe} onClick={() => p.onGlobe(!p.globe)} title="Globe projection"><Icon name="globe" /></button>
      <button type="button" className={p.tableOpen ? "icon on" : "icon"} aria-pressed={p.tableOpen} onClick={() => p.onTable(!p.tableOpen)} title="Attribute table"><Icon name="table" /></button>
      <input ref={openInput} type="file" accept=".json,.decho.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) {p.onOpen(f);} e.target.value = ""; }} />
      <input ref={importInput} type="file" multiple accept=".geojson,.json,.csv,.tsv,.txt,.kml,.gpx" hidden onChange={(e) => { if (e.target.files?.length) {p.onImport(e.target.files);} e.target.value = ""; }} />
    </header>
  );
}
