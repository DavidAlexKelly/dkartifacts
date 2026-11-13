import type { Position } from "geojson";
import { cacheStats } from "../data/cache";
import type { Tool } from "../map/tools";

interface Props {
  cursor: Position | null;
  elevation: number | null;
  zoom: number;
  tool: Tool;
  sketchLength: number;
  message: { text: string; kind: "info" | "error" } | null;
  onDismiss(): void;
}

const TOOL_HINT: Partial<Record<Tool, string>> = {
  point: "Click to add a point",
  line: "Click to add vertices · double-click or Enter to finish",
  polygon: "Click to add vertices · double-click or Enter to finish",
  edit: "Click a feature, then drag its vertices · drag a midpoint to add · alt-click to remove",
  "measure-line": "Click to measure · double-click to finish",
  "measure-area": "Click to measure · double-click to finish",
  profile: "Draw a line · double-click to see the terrain along it",
  identify: "Click to identify",
};

function dms(v: number, pos: string, neg: string): string {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = ((a - d) * 60 - m) * 60;
  return `${d}°${String(m).padStart(2, "0")}′${s.toFixed(1).padStart(4, "0")}″${v >= 0 ? pos : neg}`;
}

export function StatusBar({ cursor, elevation, zoom, tool, sketchLength, message, onDismiss }: Props) {
  return (
    <footer className="status">
      {message ? (
        <span className={message.kind === "error" ? "msg error" : "msg"}>
          {message.text} <button type="button" className="link" onClick={onDismiss}>dismiss</button>
        </span>
      ) : (
        <span className="msg muted">{TOOL_HINT[tool] ?? "Drag to pan · scroll to zoom · right-drag to rotate and tilt"}{sketchLength ? ` · ${sketchLength} vertices` : ""}</span>
      )}
      <span className="spacer" />
      {cursor && (
        <span title={`${cursor[1].toFixed(6)}, ${cursor[0].toFixed(6)}`}>
          {dms(cursor[1], "N", "S")} {dms(cursor[0], "E", "W")}
        </span>
      )}
      {elevation !== null && <span>{Math.round(elevation)} m</span>}
      <span>z{zoom.toFixed(1)}</span>
      <span className="muted" title="Files read: from the network / from the persistent cache (keyed by content hash) / from memory">
        files {cacheStats.network}/{cacheStats.persistent}/{cacheStats.memory}
      </span>
    </footer>
  );
}
