// overlay/OrderHandleController.ts — draggable edit handles for
// PlacedOrder tactical graphics. Adapter-agnostic, themeable, and takes an
// explicit SymbolCatalog — no shared global state.
import {
  isMilxOrder,
  milxHandlesForOrder,
  applyMilxOrderHandle,
  milxHasCenterHandle,
  getUnitAnchorHandleId,
  resolveCatalogNameForSidc,
  type Pt2,
} from "../core/tacticOrders";
import type { SymbolCatalog } from "../engine/catalog";
import { escapeXmlAttr } from "../engine/geometry";
import type { MapAdapter, MarkerHandle, WorldCoord } from "../adapter/types";
import type { LiveOverrideStore } from "./LiveOverrideStore";
import { resolveTheme, ensureHandleStyles, type HandleTheme } from "./theme";
import type { PlacedOrder, OrderHandleCallbacks } from "../maplibre/types";

const DEFAULT_SCALE_RANGE = { min: 0.001, max: 3.0 };

/** The handle an attached unit owns, resolved against the order's own params. */
function unitAnchorHandleIdForOrder(
  catalog: SymbolCatalog,
  order: PlacedOrder,
): string | undefined {
  if (!order.tacticSidc) {return undefined;}
  const name = resolveCatalogNameForSidc(catalog, order.tacticSidc);
  if (!name) {return undefined;}
  return getUnitAnchorHandleId(catalog, name, order.milxParams);
}

export interface ScaleRange {
  min: number;
  max: number;
}

export interface OrderHandleControllerOptions {
  theme?: Partial<HandleTheme>;
  scaleRange?: ScaleRange;
}

export class OrderHandleController {
  private catalog: SymbolCatalog;
  private adapter: MapAdapter;
  private liveStore: LiveOverrideStore;
  private callbacks: OrderHandleCallbacks;
  private theme: HandleTheme;
  private scaleRange: ScaleRange;
  private handles = new Map<string, MarkerHandle>();
  /**
   * The latest state of each order, by id — and it must be read at drag time
   * rather than closed over.
   *
   * A handle's listeners are attached once, when its marker is created, and
   * later syncs only move the marker. So the `order` those listeners captured
   * is the one that existed when the handle first appeared, and every drag
   * after the first would start from the params the symbol had BEFORE the
   * first drag: the edit just committed silently reverts and the graphic jumps
   * back to where it started.
   *
   * A field like this existed once and was removed as dead weight, correctly
   * at the time — it was written and never read. What made it necessary again
   * was clearing the live override on commit: while the override outlived the
   * drag it happened to carry the committed params forward, which hid the
   * stale closure behind a bug that was itself worth fixing.
   */
  private current = new Map<string, PlacedOrder>();

  /** The order as it is now, not as it was when this handle was built. */
  private live(order: PlacedOrder): PlacedOrder {
    return this.current.get(order.id) ?? order;
  }

  constructor(
    catalog: SymbolCatalog,
    adapter: MapAdapter,
    liveStore: LiveOverrideStore,
    callbacks: OrderHandleCallbacks = {},
    options: OrderHandleControllerOptions = {},
  ) {
    ensureHandleStyles();
    this.catalog = catalog;
    this.adapter = adapter;
    this.liveStore = liveStore;
    this.callbacks = callbacks;
    this.theme = resolveTheme(options.theme);
    this.scaleRange = options.scaleRange ?? DEFAULT_SCALE_RANGE;
  }

  sync(orders: PlacedOrder[]): void {
    const milxOrders = orders.filter((o) => o.tacticSidc && isMilxOrder(this.catalog, o.tacticSidc));
    const plainOrders = orders.filter((o) => !o.tacticSidc || !isMilxOrder(this.catalog, o.tacticSidc));
    const allIds = new Set(orders.map((o) => o.id));

    this.current.clear();
    for (const order of orders) {
      this.current.set(order.id, order);
    }

    for (const [key, marker] of this.handles) {
      const orderId = key.split(":")[0];
      if (!allIds.has(orderId)) {
        marker.remove();
        this.handles.delete(key);
      }
    }

    for (const order of plainOrders) {
      this.syncEndpointHandle(order, "from", order.from, !!order.fromAnchored);
      this.syncEndpointHandle(order, "to", order.to, !!order.toAnchored);
      if (order.mid) {this.syncEndpointHandle(order, "mid", order.mid, false);}
    }

    for (const order of milxOrders) {
      for (const end of ["from", "to", "mid"] as const) {
        const stale = this.handles.get(`${order.id}:${end}`);
        if (stale) { stale.remove(); this.handles.delete(`${order.id}:${end}`); }
      }
      this.syncMilxPositionHandle(order);
      this.syncMilxSectionHandles(order);
      this.syncScaleHandle(order);
    }
  }

  setHoverGroup(orderId: string, hovered: boolean): void {
    for (const [key, marker] of this.handles) {
      if (!key.startsWith(`${orderId}:`)) {continue;}
      marker.getElement().classList.toggle("tg-handle--group-hovered", hovered);
    }
  }

  setScaleRange(range: ScaleRange): void {
    this.scaleRange = range;
  }

  destroy(): void {
    for (const marker of this.handles.values()) {marker.remove();}
    this.handles.clear();
  }

  private makeHandleEl(size: number, shape: "circle" | "square", colour: string): HTMLDivElement {
    const el = document.createElement("div");
    Object.assign(el.style, {
      width: `${size}px`, height: `${size}px`,
      borderRadius: shape === "circle" ? "50%" : "3px",
      background: this.theme.handleFillIdle,
      border: `${this.theme.handleBorderWidth}px solid ${colour}`,
      boxSizing: "border-box", cursor: "grab", touchAction: "none",
    });
    return el;
  }

  private syncEndpointHandle(order: PlacedOrder, end: "from" | "to" | "mid", world: WorldCoord, anchored: boolean): void {
    const key = `${order.id}:${end}`;
    if (anchored) {
      const stale = this.handles.get(key);
      if (stale) { stale.remove(); this.handles.delete(key); }
      return;
    }
    const existing = this.handles.get(key);
    if (existing) { existing.setPosition(world); return; }

    const el = this.makeHandleEl(this.theme.endpointHandleSize, "circle", "rgba(255,255,255,0.9)");
    el.style.background = order.colour;
    el.style.zIndex = "0";
    el.classList.add("tg-handle", `tg-handle--${order.id}`);

    const marker = this.adapter.createMarker(el, world);

    let dragging = false;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {return;}
      e.stopPropagation(); e.preventDefault();
      dragging = true;
      el.style.cursor = "grabbing";
      el.classList.add("tg-handle--dragging");
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) {return;}
      e.stopPropagation();
      const rect = this.adapter.getContainer().getBoundingClientRect();
      const world2 = this.adapter.unproject({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      marker.setPosition(world2);
      this.liveStore.setDrag(order.id, end, world2);
    });
    const endDrag = () => {
      if (!dragging) {return;}
      dragging = false;
      el.style.cursor = "grab";
      el.classList.remove("tg-handle--dragging");
      this.liveStore.setDrag(order.id, null);
      this.callbacks.onMoveEnd?.(order.id, end, marker.getPosition());
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    this.handles.set(key, marker);
  }

  private syncMilxPositionHandle(order: PlacedOrder): void {
    const key = `${order.id}:milx-pos`;
    // fromAnchored means something else — e.g. a unit marker — now owns
    // this order's position; don't draw a handle that would fight it for
    // control.
    if (order.fromAnchored || milxHasCenterHandle(this.catalog, order.tacticSidc)) {
      const stale = this.handles.get(key);
      if (stale) { stale.remove(); this.handles.delete(key); }
      return;
    }
    const adapter = this.adapter;

    const computeWorld = (): WorldCoord => {
      const fPx = adapter.project(order.from);
      const handles = milxHandlesForOrder(this.catalog, order.tacticSidc!, { x: fPx.x, y: fPx.y }, order.milxParams, adapter.getZoom(), order.milxScale);
      const firstPt = handles.find((h) => h.kind === "point");
      const px = firstPt ? firstPt.pos : { x: fPx.x, y: fPx.y };
      return adapter.unproject(px);
    };

    const existing = this.handles.get(key);
    if (existing) { existing.setPosition(computeWorld()); return; }

    const el = this.makeHandleEl(this.theme.positionHandleSize, "circle", order.colour);
    el.title = "Move symbol";
    el.style.zIndex = "1";
    el.classList.add("tg-handle", `tg-handle--${order.id}`);

    const marker = adapter.createMarker(el, computeWorld());

    let dragging = false;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {return;}
      e.stopPropagation(); e.preventDefault();
      dragging = true;
      el.style.cursor = "grabbing";
      el.classList.add("tg-handle--dragging");
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) {return;}
      e.stopPropagation();
      const rect = adapter.getContainer().getBoundingClientRect();
      const cursorWorld = adapter.unproject({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      const curFromPx = adapter.project(this.live(order).from);
      const handlePx = adapter.project(marker.getPosition());
      const offsetPx = { x: handlePx.x - curFromPx.x, y: handlePx.y - curFromPx.y };
      const newFromPx = { x: e.clientX - rect.left - offsetPx.x, y: e.clientY - rect.top - offsetPx.y };
      const newFromWorld = adapter.unproject(newFromPx);
      marker.setPosition(cursorWorld);
      this.liveStore.setDrag(order.id, "from", newFromWorld);
    });
    const endDrag = () => {
      if (!dragging) {return;}
      dragging = false;
      el.style.cursor = "grab";
      el.classList.remove("tg-handle--dragging");
      const finalHandlePx = adapter.project(marker.getPosition());
      const handleStartPx = adapter.project(computeWorld());
      const fromPx = adapter.project(this.live(order).from);
      const delta = { x: finalHandlePx.x - handleStartPx.x, y: finalHandlePx.y - handleStartPx.y };
      const newFromWorld = adapter.unproject({ x: fromPx.x + delta.x, y: fromPx.y + delta.y });
      this.liveStore.setDrag(order.id, null);
      this.callbacks.onMoveEnd?.(order.id, "from", newFromWorld);
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", () => {
      dragging = false;
      el.classList.remove("tg-handle--dragging");
      this.liveStore.setDrag(order.id, null);
      marker.setPosition(computeWorld());
    });

    this.handles.set(key, marker);
  }

  private syncMilxSectionHandles(order: PlacedOrder): void {
    const adapter = this.adapter;
    const fPx = adapter.project(order.from);
    if (!isFinite(fPx.x)) {return;}
    const zoom = adapter.getZoom();
    const allHandles = milxHandlesForOrder(this.catalog, order.tacticSidc!, { x: fPx.x, y: fPx.y }, order.milxParams, zoom, order.milxScale);
    // A symbol's declared unit-anchor handle is its de facto move control, so
    // suppress it when fromAnchored: something else — a unit marker — now owns
    // this order's position, and two draggable things claiming one point drift
    // apart the moment either is used. Reshape/resize handles (radius,
    // gapAngle, marker, ...) stay interactive.
    //
    // This used to hardcode "center", which covered the 18 centre-anchored
    // symbols and left the 23 "start"-anchored ones — every axis of advance,
    // every attack — with a draggable spine0/A/P1 sitting exactly under the
    // attached unit, fighting it for control.
    const anchorHandleId = order.fromAnchored
      ? unitAnchorHandleIdForOrder(this.catalog, order)
      : undefined;
    const handles = anchorHandleId
      ? allHandles.filter((h) => h.id !== anchorHandleId)
      : allHandles;

    const wanted = new Set(handles.map((h) => `${order.id}:milx:${h.id}`));
    wanted.add(`${order.id}:milx:__scale`);
    for (const [key, marker] of this.handles) {
      if (key.startsWith(`${order.id}:milx:`) && !wanted.has(key)) {
        marker.remove();
        this.handles.delete(key);
      }
    }

    for (const h of handles) {
      const key = `${order.id}:milx:${h.id}`;
      const world = adapter.unproject(h.pos);
      const existing = this.handles.get(key);
      if (existing) { existing.setPosition(world); continue; }

      const el = this.makeHandleEl(this.theme.sectionHandleSize, h.kind === "point" ? "circle" : "square", order.colour);
      el.title = h.id;
      el.style.zIndex = "2";
      el.classList.add("tg-handle", `tg-handle--${order.id}`);

      const marker = adapter.createMarker(el, world);

      let dragging = false;
      let dragAnchor: Pt2 = { x: 0, y: 0 };
      let baseParams: Record<string, unknown> | undefined;
      let latestParams: Record<string, unknown> | null = null;
      // Read off the CURRENT order at pointerdown, not off the one this
      // listener closed over. See the `current` field.
      let dragSidc: string | undefined;
      let dragScale: number | undefined;

      el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) {return;}
        e.stopPropagation(); e.preventDefault();
        dragging = true;
        latestParams = null;
        el.style.cursor = "grabbing";
        el.classList.add("tg-handle--dragging");
        el.setPointerCapture(e.pointerId);
        const now = this.live(order);
        dragSidc = now.tacticSidc;
        dragScale = now.milxScale;
        const ap = adapter.project(now.from);
        dragAnchor = { x: ap.x, y: ap.y };
        baseParams = this.liveStore.getParams(now.id) ?? now.milxParams;
      });
      el.addEventListener("pointermove", (e) => {
        if (!dragging) {return;}
        e.stopPropagation();
        const rect = adapter.getContainer().getBoundingClientRect();
        const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const next = applyMilxOrderHandle(this.catalog, dragSidc!, dragAnchor, baseParams, h.id, screenPos, adapter.getZoom(), dragScale);
        if (!next) {return;}
        latestParams = next;

        const hs = milxHandlesForOrder(this.catalog, dragSidc!, dragAnchor, next, adapter.getZoom(), dragScale);
        for (const hh of hs) {
          const sib = this.handles.get(`${order.id}:milx:${hh.id}`);
          if (sib) {sib.setPosition(adapter.unproject(hh.pos));}
        }
        const posHandle = this.handles.get(`${order.id}:milx-pos`);
        if (posHandle) {
          const firstPt = hs.find((hh) => hh.kind === "point");
          if (firstPt) {posHandle.setPosition(adapter.unproject(firstPt.pos));}
        }
        this.liveStore.setParams(order.id, next);
      });
      const endDrag = (commit: boolean) => {
        if (!dragging) {return;}
        dragging = false;
        el.style.cursor = "grab";
        el.classList.remove("tg-handle--dragging");
        if (commit && latestParams) {
          this.callbacks.onMilxParamsChange?.(order.id, latestParams);
        }
        // Clear the transient override on BOTH paths, always.
        //
        // It existed to paint the drag in progress; once the drag is over the
        // stored order is the truth again — committed params arrive back
        // through props, and a cancelled drag has nothing to show. Leaving it
        // set was the bug: TacticOverlay renders liveStore.apply(order), so an
        // override that outlives its drag pins that order to the params it had
        // mid-drag and every later change is painted over — the unit walks
        // away, the anchor is re-pinned, the order is edited, and none of it
        // appears. It looked like attachment breaking after the first drag,
        // which is what it was, one layer down.
        //
        // The cancel path had the same leak with a different value: it wrote
        // `baseParams` back as a permanent override rather than removing it.
        this.liveStore.setParams(order.id, null);
        latestParams = null;
      };
      el.addEventListener("pointerup", () => endDrag(true));
      el.addEventListener("pointercancel", () => endDrag(false));

      this.handles.set(key, marker);
    }
  }

  private syncScaleHandle(order: PlacedOrder): void {
    const adapter = this.adapter;
    const key = `${order.id}:milx:__scale`;
    const fPx = adapter.project(order.from);
    if (!isFinite(fPx.x)) {return;}
    const handles = milxHandlesForOrder(this.catalog, order.tacticSidc!, { x: fPx.x, y: fPx.y }, order.milxParams, adapter.getZoom(), order.milxScale);
    if (handles.length === 0) {
      const stale = this.handles.get(key);
      if (stale) { stale.remove(); this.handles.delete(key); }
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const h of handles) {
      minX = Math.min(minX, h.pos.x); minY = Math.min(minY, h.pos.y);
      maxX = Math.max(maxX, h.pos.x); maxY = Math.max(maxY, h.pos.y);
    }
    const scaleWorld = adapter.unproject({ x: maxX + 14, y: maxY + 14 });

    const existing = this.handles.get(key);
    if (existing) { existing.setPosition(scaleWorld); return; }

    const el = this.makeHandleEl(this.theme.scaleHandleSize, "square", order.colour);
    el.style.cursor = "nwse-resize";
    el.style.zIndex = "3";
    el.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" style="display:block;margin:auto"><path d="M1 9L9 1M5 9L9 5" stroke="${escapeXmlAttr(order.colour)}" stroke-width="1.5" fill="none"/></svg>`;
    el.title = "Drag to resize";
    el.classList.add("tg-handle", `tg-handle--${order.id}`);

    const marker = adapter.createMarker(el, scaleWorld);

    let dragging = false;
    let startDist = 0;
    let startScale = 1;
    // Current, not captured: scaling twice would otherwise measure the second
    // drag against the position and scale the order had before the first.
    const anchorPx = () => adapter.project(this.live(order).from);

    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {return;}
      e.stopPropagation(); e.preventDefault();
      dragging = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add("tg-handle--dragging");
      const ap = anchorPx();
      const rect = adapter.getContainer().getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      startDist = Math.hypot(mx - ap.x, my - ap.y) || 1;
      startScale = this.live(order).milxScale ?? 1;
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) {return;}
      e.stopPropagation();
      const ap = anchorPx();
      const rect = adapter.getContainer().getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const curDist = Math.hypot(mx - ap.x, my - ap.y) || 1;
      const raw = startScale * (curDist / startDist);
      const clamped = Math.max(this.scaleRange.min, Math.min(this.scaleRange.max, raw));
      this.callbacks.onScaleChange?.(order.id, clamped);
    });
    const endScale = () => {
      if (!dragging) {return;}
      dragging = false;
      el.classList.remove("tg-handle--dragging");
    };
    el.addEventListener("pointerup", endScale);
    el.addEventListener("pointercancel", endScale);

    this.handles.set(key, marker);
  }
}