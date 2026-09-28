// maplibre/types.ts — PlacedOrder now uses generic WorldCoord tuples
// (rather than fromLat/fromLng) so the same shape works with any MapAdapter,
// not just geographic ones.
import type { WorldCoord } from "../adapter/types";

export type LineStyle = "solid" | "dashed" | "dotted" | "double" | "zigzag" | "blocky";
export type EndpointStyle = "none" | "arrow" | "arrow-filled" | "circle" | "square" | "bar";

export interface PlacedOrder {
  id: string;
  from: WorldCoord;
  to: WorldCoord;
  mid?: WorldCoord;
  colour: string;
  lineStyle?: LineStyle;
  endpointStyle?: EndpointStyle;
  tacticSidc?: string;
  tacticLabel?: string;
  milxScale?: number;
  milxParams?: Record<string, unknown>;
  fromAnchored?: boolean;
  toAnchored?: boolean;
}

export interface OrderHandleCallbacks {
  onMoveEnd?: (orderId: string, end: "from" | "to" | "mid", world: WorldCoord) => void;
  onMilxParamsChange?: (orderId: string, params: Record<string, unknown>) => void;
  onScaleChange?: (orderId: string, newScale: number) => void;
  onRemove?: (orderId: string) => void;
}

export type { WorldCoord } from "../adapter/types";