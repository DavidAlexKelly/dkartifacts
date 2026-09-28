// overlay/TacticOverlay.ts — SVG-over-canvas renderer for tactical order
// graphics. Adapter-agnostic: works with any MapAdapter implementation
// (MapLibre, Leaflet, a plain canvas, …). Takes an explicit SymbolCatalog
// — no shared global state.
import type { Pt } from "../engine/geometry";
import { escapeXmlAttr } from "../engine/geometry";
import { isMilxOrder as isRegisteredSymbol, milxHandlesForOrder, getTacticOrders } from "../core/tacticOrders";
import type { SymbolCatalog } from "../engine/catalog";
import type { MapAdapter } from "../adapter/types";
import type { LiveOverrideStore } from "./LiveOverrideStore";
import type { PlacedOrder } from "../maplibre/types";

const HIT_STRIP_WIDTH = 20;
const HIT_STRIP_ENDPOINT_CLEARANCE = 16;

function fallbackArrow(from: Pt, to: Pt, colour: string): string {
  const dx = to.x - from.x, dy = to.y - from.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const ex = to.x - ux * 14, ey = to.y - uy * 14;
  const h1x = ex + nx * 7, h1y = ey + ny * 7;
  const h2x = ex - nx * 7, h2y = ey - ny * 7;
  const c = escapeXmlAttr(colour);
  return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity="0.9"/>`
    + `<polyline points="${h1x.toFixed(1)},${h1y.toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)} ${h2x.toFixed(1)},${h2y.toFixed(1)}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" opacity="0.9"/>`;
}

function buildHitStrip(from: Pt, to: Pt): string {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  if (len <= HIT_STRIP_ENDPOINT_CLEARANCE * 2) {return "";}
  const ux = dx / len, uy = dy / len;
  const x1 = from.x + ux * HIT_STRIP_ENDPOINT_CLEARANCE;
  const y1 = from.y + uy * HIT_STRIP_ENDPOINT_CLEARANCE;
  const x2 = to.x - ux * HIT_STRIP_ENDPOINT_CLEARANCE;
  const y2 = to.y - uy * HIT_STRIP_ENDPOINT_CLEARANCE;
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="transparent" stroke-width="${HIT_STRIP_WIDTH}" stroke-linecap="butt" pointer-events="all"/>`;
}

export interface TacticOverlayOptions {
  onRemove?: (orderId: string) => void;
  onHoverChange?: (orderId: string, hovered: boolean) => void;
}

export class TacticOverlay {
  private catalog: SymbolCatalog;
  private adapter: MapAdapter;
  private liveStore: LiveOverrideStore;
  private svg: SVGSVGElement;
  private orders: PlacedOrder[] = [];
  private rafId: number | null = null;
  private onRemove?: (orderId: string) => void;
  private onHoverChangeCb?: (orderId: string, hovered: boolean) => void;
  private container: HTMLElement;
  private unsubscribeCamera: () => void;
  private unsubscribeLive: () => void;
  private onContainerMouseMove = (e: MouseEvent) => this.handleContainerMouseMove(e);
  private onContainerMouseLeave = () => this.handleContainerMouseLeave();
  private lastHoveredId: string | null = null;

  constructor(catalog: SymbolCatalog, adapter: MapAdapter, liveStore: LiveOverrideStore, options: TacticOverlayOptions = {}) {
    this.catalog = catalog;
    this.adapter = adapter;
    this.liveStore = liveStore;
    this.onRemove = options.onRemove;
    this.onHoverChangeCb = options.onHoverChange;
    this.container = adapter.getContainer();

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.assign(this.svg.style, {
      position: "absolute", inset: "0", width: "100%", height: "100%",
      pointerEvents: "none", zIndex: "5", overflow: "visible",
    });
    this.container.appendChild(this.svg);

    this.container.addEventListener("mousemove", this.onContainerMouseMove);
    this.container.addEventListener("mouseleave", this.onContainerMouseLeave);
    this.unsubscribeCamera = adapter.onCameraChange(() => this.schedule());
    this.unsubscribeLive = liveStore.subscribe(() => this.schedule());

    this.schedule();
  }

  update(orders: PlacedOrder[]): void {
    this.orders = orders;
    this.schedule();
  }

  setHovered(orderId: string, hovered: boolean): void {
    // Compare attribute values in JS rather than interpolating orderId into
    // a querySelector string — an id containing `"` would otherwise either
    // throw (invalid selector) or, worse, be crafted to match unintended
    // elements.
    this.svg.querySelectorAll<SVGGElement>("g[data-id]").forEach((g) => {
      if (g.getAttribute("data-id") === orderId) {g.classList.toggle("tg-hovered", hovered);}
    });
    this.onHoverChangeCb?.(orderId, hovered);
  }

  destroy(): void {
    if (this.rafId !== null) {cancelAnimationFrame(this.rafId);}
    this.container.removeEventListener("mousemove", this.onContainerMouseMove);
    this.container.removeEventListener("mouseleave", this.onContainerMouseLeave);
    this.unsubscribeCamera();
    this.unsubscribeLive();
    this.svg.remove();
  }

  private findTacticOrder(sidc: string) {
    return getTacticOrders(this.catalog).find((o) => o.sidc === sidc);
  }

  private schedule(): void {
    if (this.rafId !== null) {return;}
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.repaint();
    });
  }

  private repaint(): void {
    const adapter = this.adapter;
    const parts: string[] = [];
    for (const stored of this.orders) {
      const sidc = stored.tacticSidc;
      if (!sidc) {continue;}
      try {
        const order = this.liveStore.apply(stored);
        const fromPx = adapter.project(order.from);
        const toPx = adapter.project(order.to);
        if (!isFinite(fromPx.x) || !isFinite(toPx.x)) {continue;}
        const from: Pt = { x: fromPx.x, y: fromPx.y };
        const to: Pt = { x: toPx.x, y: toPx.y };

        let mid: Pt | undefined;
        if (order.mid) {
          const midPx = adapter.project(order.mid);
          if (isFinite(midPx.x)) {mid = { x: midPx.x, y: midPx.y };}
        }

        const def = this.findTacticOrder(sidc);
        const colour = order.colour ?? "#4a7c59";
        const zoom = adapter.getZoom();
        const scale = order.milxScale ?? 1;
        const inner = def
          ? def.renderOnMap(from, to, colour, mid, order.milxParams, zoom, scale)
          : fallbackArrow(from, to, colour);
        if (!inner) {continue;}

        const hitStrip = buildHitStrip(from, to);
        parts.push(`<g data-id="${escapeXmlAttr(order.id)}" style="cursor:pointer">`, inner, hitStrip, `</g>`);
      } catch {
        // skip malformed order
      }
    }
    this.svg.innerHTML = parts.join("");

    this.svg.querySelectorAll<SVGGElement>("g[data-id]").forEach((g) => {
      const id = g.getAttribute("data-id");
      if (!id) {return;}
      g.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onRemove?.(id);
      });
    });
  }

  private handleContainerMouseMove(e: MouseEvent): void {
    const adapter = this.adapter;
    const rect = this.container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let foundId: string | null = null;
    for (const stored of this.orders) {
      if (!stored.tacticSidc || !isRegisteredSymbol(this.catalog, stored.tacticSidc)) {continue;}
      try {
        const order = this.liveStore.apply(stored);
        const fPx = adapter.project(order.from);
        if (!isFinite(fPx.x)) {continue;}
        const hs = milxHandlesForOrder(this.catalog, order.tacticSidc!, { x: fPx.x, y: fPx.y }, order.milxParams, adapter.getZoom(), order.milxScale);
        if (hs.length === 0) {continue;}
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const h of hs) {
          minX = Math.min(minX, h.pos.x); minY = Math.min(minY, h.pos.y);
          maxX = Math.max(maxX, h.pos.x); maxY = Math.max(maxY, h.pos.y);
        }
        const pad = 30;
        if (mx >= minX - pad && mx <= maxX + pad && my >= minY - pad && my <= maxY + pad) {
          foundId = order.id;
          break;
        }
      } catch { /* skip */ }
    }
    if (foundId !== this.lastHoveredId) {
      if (this.lastHoveredId) {this.setHovered(this.lastHoveredId, false);}
      if (foundId) {this.setHovered(foundId, true);}
      this.lastHoveredId = foundId;
    }
  }

  private handleContainerMouseLeave(): void {
    if (this.lastHoveredId) {
      this.setHovered(this.lastHoveredId, false);
      this.lastHoveredId = null;
    }
  }
}