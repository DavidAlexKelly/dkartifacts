// react/useOrderStore.ts — optional self-managing state container for
// PlacedOrders, so simple use cases don't need to hand-roll add/remove/
// update reducers around useTacticGraphics's callbacks.
import { useCallback, useState } from "react";
import type { PlacedOrder, WorldCoord } from "../maplibre/types";

export interface OrderStore {
  orders: PlacedOrder[];
  add: (order: PlacedOrder) => void;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<PlacedOrder>) => void;
  moveEnd: (id: string, end: "from" | "to" | "mid", world: WorldCoord) => void;
  setParams: (id: string, params: Record<string, unknown>) => void;
  setScale: (id: string, scale: number) => void;
}

export function useOrderStore(initial: PlacedOrder[] = []): OrderStore {
  const [orders, setOrders] = useState<PlacedOrder[]>(initial);

  const add = useCallback((order: PlacedOrder) => setOrders((prev) => [...prev, order]), []);
  const remove = useCallback((id: string) => setOrders((prev) => prev.filter((o) => o.id !== id)), []);
  const update = useCallback((id: string, patch: Partial<PlacedOrder>) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o))), []);
  const moveEnd = useCallback((id: string, end: "from" | "to" | "mid", world: WorldCoord) =>
    update(id, { [end]: world } as Partial<PlacedOrder>), [update]);
  const setParams = useCallback((id: string, params: Record<string, unknown>) =>
    update(id, { milxParams: params }), [update]);
  const setScale = useCallback((id: string, scale: number) =>
    update(id, { milxScale: scale }), [update]);

  return { orders, add, remove, update, moveEnd, setParams, setScale };
}