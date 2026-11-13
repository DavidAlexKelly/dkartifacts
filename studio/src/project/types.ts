/**
 * The project document: everything that makes a map, and nothing else.
 *
 * The map on screen is a pure function of this (see map/style.ts), so saving,
 * undo, redo and export all work by handling this object and never by asking
 * MapLibre what it currently shows.
 */
import type { Feature, Geometry } from "geojson";
import type { Connection } from "../data/library";

export type BasemapFlavor = "light" | "dark" | "white" | "grayscale" | "black";

export interface CatalogLayerOptions {
  // basemap
  flavor?: BasemapFlavor;
  labels?: boolean;
  // raster-dem
  hillshade?: boolean;
  terrain3d?: boolean;
  exaggeration?: number;
  // contours / generic vector tiles
  color?: string;
  width?: number;
}

export interface CatalogLayerNode {
  kind: "catalog";
  id: string;
  catalogId: string;
  title: string;
  visible: boolean;
  opacity: number;
  options: CatalogLayerOptions;
}

export interface VectorStyle {
  color: string;
  strokeColor: string;
  strokeWidth: number;
  fillOpacity: number;
  radius: number;
  categorize: { field: string; colors: Record<string, string> } | null;
  labelField: string | null;
  labelSize: number;
}

export type StudioFeature = Omit<Feature<Geometry, Record<string, unknown>>, "id" | "properties"> & {
  id: string;
  properties: Record<string, unknown>;
};

export interface VectorLayerNode {
  kind: "vector";
  id: string;
  title: string;
  visible: boolean;
  opacity: number;
  style: VectorStyle;
  data: { type: "FeatureCollection"; features: StudioFeature[] };
  /** Fields in display order; features may carry others, which are appended. */
  fields: string[];
}

export type LayerNode = CatalogLayerNode | VectorLayerNode;

export interface MapView {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface Project {
  format: "decho-studio-project/1";
  title: string;
  connection: Connection | null;
  view: MapView;
  globe: boolean;
  /** Bottom to top: index 0 is drawn first. The layer panel shows it reversed. */
  layers: LayerNode[];
}

export const PALETTE = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#46a5a5", "#f032e6", "#9a9a1f", "#808000", "#008080", "#9a6324", "#800000"];

export function defaultVectorStyle(index: number): VectorStyle {
  const color = PALETTE[index % PALETTE.length];
  return {
    color,
    strokeColor: color,
    strokeWidth: 2,
    fillOpacity: 0.3,
    radius: 6,
    categorize: null,
    labelField: null,
    labelSize: 12,
  };
}

export function newProject(connection: Connection | null = null): Project {
  return {
    format: "decho-studio-project/1",
    title: "Untitled map",
    connection,
    view: { center: [10, 60], zoom: 4, bearing: 0, pitch: 0 },
    globe: false,
    layers: [],
  };
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
