// overlay/LiveOverrideStore.ts — adapter-agnostic bridge for transient
// drag state shared between TacticOverlay (visual repaint) and
// OrderHandleController (handle positions), without either needing to know
// about the other or smuggle state onto the underlying map object.
import type { WorldCoord } from "../adapter/types";

export type LiveEnd = "from" | "to" | "mid";

export interface LiveOverride {
  from?: WorldCoord;
  to?: WorldCoord;
  mid?: WorldCoord;
  params?: Record<string, unknown>;
}

export class LiveOverrideStore {
  private overrides = new Map<string, LiveOverride>();
  private listeners = new Set<() => void>();

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }

  setDrag(orderId: string, end: LiveEnd | null, world?: WorldCoord): void {
    if (end === null) {
      this.overrides.delete(orderId);
    } else if (world) {
      const cur = this.overrides.get(orderId) ?? {};
      cur[end] = world;
      this.overrides.set(orderId, cur);
    }
    this.notify();
  }

  setParams(orderId: string, params: Record<string, unknown> | null): void {
    if (params === null) {
      const cur = this.overrides.get(orderId);
      if (cur) {
        delete cur.params;
        if (!cur.from && !cur.to && !cur.mid) {this.overrides.delete(orderId);}
      }
    } else {
      const cur = this.overrides.get(orderId) ?? {};
      cur.params = params;
      this.overrides.set(orderId, cur);
    }
    this.notify();
  }

  getParams(orderId: string): Record<string, unknown> | undefined {
    return this.overrides.get(orderId)?.params;
  }

  /** Merge any live override for `order.id` on top of the stored order. */
  apply<T extends { id: string; from: WorldCoord; to: WorldCoord; mid?: WorldCoord; milxParams?: Record<string, unknown> }>(
    order: T,
  ): T {
    const live = this.overrides.get(order.id);
    if (!live) {return order;}
    return {
      ...order,
      ...(live.from ? { from: live.from } : {}),
      ...(live.to ? { to: live.to } : {}),
      ...(live.mid ? { mid: live.mid } : {}),
      ...(live.params ? { milxParams: live.params } : {}),
    };
  }
}