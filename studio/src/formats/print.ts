/**
 * Map export as an image with a layout around it: title, the map, a legend,
 * a scale bar, a north arrow and the attributions. Drawn on a 2D canvas from
 * the WebGL canvas (the map keeps its drawing buffer for exactly this).
 */
import type { Map as MlMap } from "maplibre-gl";
import type { CatalogLayerNode, Project, VectorLayerNode } from "../project/types";

export interface PrintOptions {
  title: string;
  subtitle?: string;
  scale: number; // device pixels per CSS pixel
  legend: boolean;
}

function niceDistance(maxMetres: number): number {
  const pow = 10 ** Math.floor(Math.log10(maxMetres));
  for (const m of [5, 2, 1]) {if (m * pow <= maxMetres) {return m * pow;}}
  return pow;
}

function legendEntries(project: Project): Array<{ label: string; color: string; kind: "fill" | "line" | "point" | "raster" }> {
  const out: Array<{ label: string; color: string; kind: "fill" | "line" | "point" | "raster" }> = [];
  for (const node of [...project.layers].reverse()) {
    if (!node.visible) {continue;}
    if (node.kind === "vector") {
      const v = node as VectorLayerNode;
      const geoms = new Set(v.data.features.map((f) => f.geometry.type.replace("Multi", "")));
      const kind = geoms.has("Polygon") ? "fill" : geoms.has("LineString") ? "line" : "point";
      if (v.style.categorize) {
        out.push({ label: `${v.title} — by ${v.style.categorize.field}`, color: "transparent", kind: "raster" });
        for (const [k, c] of Object.entries(v.style.categorize.colors).slice(0, 12)) {out.push({ label: `   ${k}`, color: c, kind });}
      } else {
        out.push({ label: v.title, color: v.style.color, kind });
      }
    } else {
      const c = node as CatalogLayerNode;
      out.push({ label: c.title, color: c.options.color ?? "#888", kind: "raster" });
    }
  }
  return out;
}

function waitForRender(map: MlMap): Promise<void> {
  return new Promise((resolve) => {
    map.once("render", () => resolve());
    map.triggerRepaint();
  });
}

export async function renderLayout(map: MlMap, project: Project, opts: PrintOptions): Promise<Blob> {
  await waitForRender(map);
  const src = map.getCanvas();
  const k = opts.scale;
  const mapW = src.width;
  const mapH = src.height;
  const pad = 24 * k;
  const header = (opts.subtitle ? 74 : 56) * k;
  const footer = 40 * k;
  const canvas = document.createElement("canvas");
  canvas.width = mapW + pad * 2;
  canvas.height = mapH + header + footer + pad;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title
  ctx.fillStyle = "#111";
  ctx.font = `600 ${22 * k}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(opts.title, pad, pad * 0.75);
  if (opts.subtitle) {
    ctx.font = `${13 * k}px system-ui, sans-serif`;
    ctx.fillStyle = "#555";
    ctx.fillText(opts.subtitle, pad, pad * 0.75 + 30 * k);
  }

  // Map
  const mx = pad;
  const my = header;
  ctx.drawImage(src, mx, my);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1 * k;
  ctx.strokeRect(mx + 0.5, my + 0.5, mapW - 1, mapH - 1);

  // Legend
  if (opts.legend) {
    const entries = legendEntries(project);
    if (entries.length) {
      ctx.font = `${12 * k}px system-ui, sans-serif`;
      const row = 20 * k;
      const w = Math.max(...entries.map((e) => ctx.measureText(e.label).width)) + 44 * k;
      const h = entries.length * row + 34 * k;
      const lx = mx + 12 * k;
      const ly = my + 12 * k;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(lx, ly, w, h);
      ctx.strokeStyle = "#999";
      ctx.strokeRect(lx, ly, w, h);
      ctx.fillStyle = "#111";
      ctx.font = `600 ${12 * k}px system-ui, sans-serif`;
      ctx.fillText("Legend", lx + 10 * k, ly + 8 * k);
      ctx.font = `${12 * k}px system-ui, sans-serif`;
      entries.forEach((e, i) => {
        const y = ly + 28 * k + i * row;
        const sx = lx + 10 * k;
        ctx.fillStyle = e.color;
        ctx.strokeStyle = e.color;
        if (e.kind === "fill") {ctx.fillRect(sx, y + 2 * k, 18 * k, 12 * k);}
        else if (e.kind === "line") {
          ctx.lineWidth = 3 * k;
          ctx.beginPath();
          ctx.moveTo(sx, y + 8 * k);
          ctx.lineTo(sx + 18 * k, y + 8 * k);
          ctx.stroke();
        } else if (e.kind === "point") {
          ctx.beginPath();
          ctx.arc(sx + 9 * k, y + 8 * k, 5 * k, 0, Math.PI * 2);
          ctx.fill();
        } else if (e.color !== "transparent") {
          const g = ctx.createLinearGradient(sx, 0, sx + 18 * k, 0);
          g.addColorStop(0, "#ddd");
          g.addColorStop(1, e.color);
          ctx.fillStyle = g;
          ctx.fillRect(sx, y + 2 * k, 18 * k, 12 * k);
        }
        ctx.fillStyle = "#111";
        ctx.fillText(e.label, sx + 26 * k, y + 2 * k);
      });
    }
  }

  // Scale bar, measured at the bottom-centre of the map
  const y0 = map.getContainer().clientHeight - 30;
  const x0 = map.getContainer().clientWidth / 2;
  const a = map.unproject([x0 - 50, y0]);
  const b = map.unproject([x0 + 50, y0]);
  const metresPer100 = a.distanceTo(b);
  if (metresPer100 > 0 && Number.isFinite(metresPer100)) {
    const target = niceDistance(metresPer100 * 1.5);
    const barCss = (target / metresPer100) * 100;
    const bx = mx + mapW - barCss * k - 24 * k;
    const by = my + mapH - 28 * k;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(bx - 8 * k, by - 18 * k, barCss * k + 16 * k, 30 * k);
    ctx.fillStyle = "#111";
    ctx.fillRect(bx, by, barCss * k, 4 * k);
    ctx.fillRect(bx, by - 4 * k, 1.5 * k, 12 * k);
    ctx.fillRect(bx + barCss * k - 1.5 * k, by - 4 * k, 1.5 * k, 12 * k);
    ctx.font = `${11 * k}px system-ui, sans-serif`;
    ctx.textBaseline = "bottom";
    const label = target >= 1000 ? `${target / 1000} km` : `${target} m`;
    ctx.fillText(label, bx, by - 4 * k);
    ctx.textBaseline = "top";
  }

  // North arrow
  const ax = mx + mapW - 34 * k;
  const ay = my + 40 * k;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate((-map.getBearing() * Math.PI) / 180);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(0, 0, 20 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.moveTo(0, -14 * k);
  ctx.lineTo(7 * k, 8 * k);
  ctx.lineTo(0, 3 * k);
  ctx.lineTo(-7 * k, 8 * k);
  ctx.closePath();
  ctx.fill();
  ctx.font = `600 ${10 * k}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -28 * k);
  ctx.restore();

  // Footer: attributions and date
  const attributions = new Set<string>();
  const style = map.getStyle();
  for (const s of Object.values(style.sources ?? {})) {
    const attr = (s as { attribution?: string }).attribution;
    if (attr) {attributions.add(attr.replace(/<[^>]+>/g, ""));}
  }
  ctx.fillStyle = "#555";
  ctx.font = `${10 * k}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  const foot = [...attributions].join(" · ");
  ctx.fillText(foot.length > 220 ? `${foot.slice(0, 217)}…` : foot, pad, my + mapH + 12 * k, mapW - 140 * k);
  ctx.textAlign = "right";
  ctx.fillText(`Decho Studio · ${new Date().toISOString().slice(0, 10)}`, mx + mapW, my + mapH + 12 * k);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/png"));
}
