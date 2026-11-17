import { useEffect, useState } from "react";
import { Dialog } from "./FoundryDialogs";

/** Ask which coordinate system files without one are in. proj4 loads only when this opens. */
export function CrsDialog({ names, onChoose, onClose }: { names: string[]; onChoose(crs: string): void; onClose(): void }) {
  const [options, setOptions] = useState<Array<{ code: string; name: string }>>([]);
  const [filter, setFilter] = useState("");
  const [choice, setChoice] = useState("");
  useEffect(() => {
    void import("../formats/crs").then((m) => setOptions(m.CRS_OPTIONS));
  }, []);
  const shown = options.filter((o) => `${o.code} ${o.name}`.toLowerCase().includes(filter.toLowerCase())).slice(0, 200);
  return (
    <Dialog title="Which coordinate system?" onClose={onClose}>
      <p className="hint">
        {names.join(", ")} {names.length === 1 ? "has" : "have"} coordinates that are not longitude/latitude and say nothing about their
        coordinate system. Choose it and they will be reprojected.
      </p>
      <input className="dialog-filter" placeholder="Search: UTM 32N, 27700, Lambert…" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus aria-label="Search coordinate systems" />
      <select className="crs-list" size={10} value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Coordinate system">
        {shown.map((o) => <option key={o.code} value={o.code}>{o.code} — {o.name}</option>)}
      </select>
      <div className="button-row">
        <button type="button" className="small primary" disabled={!choice} onClick={() => onChoose(choice)}>Import in {choice || "…"}</button>
      </div>
    </Dialog>
  );
}
