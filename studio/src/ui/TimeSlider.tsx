import { useEffect, useMemo, useState } from "react";
import { timeValue } from "../map/style";
import type { VectorLayerNode } from "../project/types";

const WIDTHS: Array<[string, number]> = [
  ["1 hour", 3600e3], ["6 hours", 6 * 3600e3], ["1 day", 86400e3], ["1 week", 7 * 86400e3], ["30 days", 30 * 86400e3], ["1 year", 365 * 86400e3],
];

/**
 * Filters every layer that has a time field to a moving window. Play steps
 * the window forward by a tenth of its width.
 */
export function TimeSlider({ layers, window: win, onWindow }: { layers: VectorLayerNode[]; window: [number, number] | null | undefined; onWindow(w: [number, number] | null): void }) {
  const extent = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const l of layers) {
      if (!l.timeField) {continue;}
      for (const f of l.data.features) {
        const t = timeValue(f.properties[l.timeField]);
        if (t !== null) {lo = Math.min(lo, t); hi = Math.max(hi, t);}
      }
    }
    return lo <= hi ? [lo, hi] as const : null;
  }, [layers]);
  const [width, setWidth] = useState(WIDTHS[2][1]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || !extent) {return;}
    const t = setInterval(() => {
      const end = (win?.[1] ?? extent[0]) + width / 10;
      if (end > extent[1] + width) {setPlaying(false); return;}
      onWindow([end - width, end]);
    }, 400);
    return () => clearInterval(t);
  }, [playing, win, width, extent, onWindow]);
  if (!extent) {return null;}
  const fmt = (t: number) => new Date(t).toISOString().slice(0, width < 86400e3 ? 16 : 10).replace("T", " ");
  const end = win?.[1] ?? extent[1];
  return (
    <div className="time-slider" role="group" aria-label="Time">
      <button type="button" className="small" onClick={() => { if (!win) {onWindow([extent[0], extent[0] + width]);} setPlaying(!playing); }}>{playing ? "Pause" : "Play"}</button>
      <input type="range" min={extent[0]} max={extent[1] + width} step={Math.max(1, width / 20)} value={end} onChange={(e) => { const v = Number(e.target.value); onWindow([v - width, v]); }} aria-label="Window end" />
      <select value={width} onChange={(e) => { const w = Number(e.target.value); setWidth(w); if (win) {onWindow([win[1] - w, win[1]]);} }} aria-label="Window width">
        {WIDTHS.map(([label, ms]) => <option key={ms} value={ms}>{label}</option>)}
      </select>
      <span className="time-label">{win ? `${fmt(win[0])} → ${fmt(win[1])}` : "all times"}</span>
      {win && <button type="button" className="link" onClick={() => { setPlaying(false); onWindow(null); }}>show all</button>}
    </div>
  );
}
