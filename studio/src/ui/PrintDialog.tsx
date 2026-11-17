import type { Map as MlMap } from "maplibre-gl";
import { useRef, useState } from "react";
import { download, safeName } from "../formats/vector";
import { fieldsOf } from "../project/reducer";
import type { Project, VectorLayerNode } from "../project/types";
import { Dialog } from "./FoundryDialogs";

type Paper = "A4" | "A3" | "A2" | "Letter" | "Tabloid";

/** Print layouts: one page, or an atlas with a page per feature of a layer. */
export function PrintDialog({ map, project, onClose, onMessage }: { map: MlMap; project: Project; onClose(): void; onMessage(text: string, kind?: "info" | "error"): void }) {
  const [paper, setPaper] = useState<Paper>("A4");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [dpi, setDpi] = useState(150);
  const [title, setTitle] = useState(project.title);
  const [subtitle, setSubtitle] = useState("");
  const [notes, setNotes] = useState("");
  const [grid, setGrid] = useState<"none" | "latlon" | "mgrs">(project.grid ?? "none");
  const [gridLines, setGridLines] = useState(false);
  const [legend, setLegend] = useState(true);
  const [overview, setOverview] = useState(true);
  const [extent, setExtent] = useState<"view" | "zoom" | "scale">("view");
  const [scale, setScale] = useState(50000);
  const [format, setFormat] = useState<"pdf" | "png" | "both">("pdf");
  const [atlasLayer, setAtlasLayer] = useState("");
  const [atlasField, setAtlasField] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const vectors = project.layers.filter((l): l is VectorLayerNode => l.kind === "vector" && l.data.features.length > 0);
  const atlas = vectors.find((l) => l.id === atlasLayer);

  const run = async () => {
    abort.current = new AbortController();
    setBusy("Preparing…");
    try {
      const { renderLayout, renderAtlas, legendFromProject } = await import("../print/layout");
      const attribution = [...new Set(Object.values(map.getStyle().sources ?? {}).map((s) => (s as { attribution?: string }).attribution).filter(Boolean))].join(" · ").replace(/<[^>]+>/g, "");
      const opts = {
        paper, orientation, dpi, title, subtitle: subtitle || undefined, notes: notes || undefined,
        legend: legend ? legendFromProject(project) : [], scaleBar: true, northArrow: true, grid, gridLines, overview,
        attribution, format, extent: extent === "scale" ? scale : extent,
        onProgress: (p: { fraction: number; stage: string }) => setBusy(`${p.stage}… ${Math.round(p.fraction * 100)}%`),
        signal: abort.current.signal,
      } as const;
      const name = safeName(title || project.title);
      if (atlas) {
        const pdf = await renderAtlas(map, atlas.data.features, { ...opts, format: "pdf", titleField: atlasField || undefined });
        download(`${name}-atlas.pdf`, pdf, "application/pdf");
        onMessage(`Atlas of ${atlas.data.features.length} pages exported.`);
      } else {
        const res = await renderLayout(map, opts);
        if (res.pdf) {download(`${name}.pdf`, res.pdf, "application/pdf");}
        if (res.png) {download(`${name}.png`, res.png, "image/png");}
        onMessage(`Exported${res.effectiveDpi < dpi ? ` at ${Math.round(res.effectiveDpi)} dpi (the GPU's limit)` : ""}.${res.warnings.length ? ` ${res.warnings.join(" ")}` : ""}`);
      }
      onClose();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {onMessage(`Print failed: ${e instanceof Error ? e.message : String(e)}`, "error");}
    } finally {
      setBusy(null);
    }
  };

  const row = (label: string, el: React.ReactNode) => <label className="row"><span>{label}</span>{el}</label>;
  return (
    <Dialog title="Print / export map" onClose={() => { abort.current?.abort(); onClose(); }} wide>
      {busy && <div className="print-cover"><p>{busy}</p><button type="button" className="small" onClick={() => abort.current?.abort()}>Cancel</button></div>}
      <div className="dialog-cols props">
        <section>
          <h3>Page</h3>
          {row("Paper", <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>{["A4", "A3", "A2", "Letter", "Tabloid"].map((p) => <option key={p}>{p}</option>)}</select>)}
          {row("Orientation", <select value={orientation} onChange={(e) => setOrientation(e.target.value as "landscape" | "portrait")}><option>landscape</option><option>portrait</option></select>)}
          {row(`Resolution ${dpi} dpi`, <input type="range" min={96} max={300} step={6} value={dpi} onChange={(e) => setDpi(Number(e.target.value))} />)}
          {row("Format", <select value={format} onChange={(e) => setFormat(e.target.value as "pdf" | "png" | "both")}><option value="pdf">PDF</option><option value="png">PNG</option><option value="both">PDF and PNG</option></select>)}
          <h3>Text</h3>
          {row("Title", <input value={title} onChange={(e) => setTitle(e.target.value)} />)}
          {row("Subtitle", <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />)}
          {row("Notes", <textarea className="expr" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />)}
        </section>
        <section>
          <h3>Map</h3>
          {row("Extent", <select value={extent} onChange={(e) => setExtent(e.target.value as "view" | "zoom" | "scale")}><option value="view">what is on screen</option><option value="zoom">same zoom as on screen</option><option value="scale">a fixed scale</option></select>)}
          {extent === "scale" && row("Scale 1:", <input type="number" min={500} step={500} value={scale} onChange={(e) => setScale(Number(e.target.value))} />)}
          {row("Grid", <select value={grid} onChange={(e) => setGrid(e.target.value as "none" | "latlon" | "mgrs")}><option value="none">none</option><option value="latlon">lat/lon ticks</option><option value="mgrs">MGRS ticks</option></select>)}
          {grid !== "none" && row("Grid lines", <input type="checkbox" checked={gridLines} onChange={(e) => setGridLines(e.target.checked)} />)}
          {row("Legend", <input type="checkbox" checked={legend} onChange={(e) => setLegend(e.target.checked)} />)}
          {row("Overview", <input type="checkbox" checked={overview} onChange={(e) => setOverview(e.target.checked)} />)}
          <h3>Atlas <small className="muted">a page per feature</small></h3>
          {row("Layer", <select value={atlasLayer} onChange={(e) => setAtlasLayer(e.target.value)}><option value="">— single page —</option>{vectors.map((l) => <option key={l.id} value={l.id}>{l.title} ({l.data.features.length} pages)</option>)}</select>)}
          {atlas && row("Page titles from", <select value={atlasField} onChange={(e) => setAtlasField(e.target.value)}><option value="">— numbered —</option>{fieldsOf(atlas).map((f) => <option key={f}>{f}</option>)}</select>)}
        </section>
      </div>
      <div className="button-row">
        <button type="button" className="small primary" disabled={!!busy} onClick={() => void run()}>{atlas ? `Export atlas (${atlas.data.features.length} pages)` : "Export"}</button>
        <span className="hint">The map resizes to the page while it renders, then returns to where it was.</span>
      </div>
    </Dialog>
  );
}
