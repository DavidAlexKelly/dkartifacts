import type { Position } from "geojson";
import { Fragment } from "react";
import type { ProfilePoint } from "../data/elevation";
import { formatArea, formatLength } from "../map/geometry";

export interface IdentifyHit {
  layer: string;
  detail?: string;
  properties: Record<string, unknown>;
}

export interface IdentifyResult {
  at: Position;
  elevation: number | null;
  hits: IdentifyHit[];
}

export interface Measurement {
  kind: "distance" | "area";
  value: number;
  vertices: number;
}

interface Props {
  identify: IdentifyResult | null;
  measurement: Measurement | null;
  profile: ProfilePoint[] | null;
  profileBusy: boolean;
  onClose(): void;
}

function ProfileChart({ points }: { points: ProfilePoint[] }) {
  const valid = points.filter((p) => p.elevation !== null) as Array<ProfilePoint & { elevation: number }>;
  if (valid.length < 2) {return <p className="empty">No terrain data along that line.</p>;}
  const W = 280, H = 140, L = 38, B = 20;
  const min = Math.min(...valid.map((p) => p.elevation));
  const max = Math.max(...valid.map((p) => p.elevation));
  const span = Math.max(1, max - min);
  const total = points[points.length - 1].distance;
  const x = (d: number) => L + (d / total) * (W - L - 6);
  const y = (h: number) => 6 + (1 - (h - min) / span) * (H - B - 6);
  const path = valid.map((p, i) => `${i ? "L" : "M"}${x(p.distance).toFixed(1)},${y(p.elevation).toFixed(1)}`).join("");
  let gain = 0, loss = 0;
  for (let i = 1; i < valid.length; i++) {
    const d = valid[i].elevation - valid[i - 1].elevation;
    if (d > 0) {gain += d;} else {loss -= d;}
  }
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="profile" role="img" aria-label="Elevation profile">
        <path d={`${path}L${x(valid[valid.length - 1].distance)},${H - B}L${x(valid[0].distance)},${H - B}Z`} className="profile-fill" />
        <path d={path} className="profile-line" />
        <line x1={L} x2={W - 6} y1={H - B} y2={H - B} className="axis" />
        <text x={L - 4} y={y(max) + 4} textAnchor="end">{Math.round(max)}</text>
        <text x={L - 4} y={y(min)} textAnchor="end">{Math.round(min)}</text>
        <text x={L} y={H - 5}>0</text>
        <text x={W - 6} y={H - 5} textAnchor="end">{formatLength(total)}</text>
      </svg>
      <dl className="meta">
        <dt>Length</dt><dd>{formatLength(total)}</dd>
        <dt>Range</dt><dd>{Math.round(min)} – {Math.round(max)} m</dd>
        <dt>Climb</dt><dd>+{Math.round(gain)} m / −{Math.round(loss)} m</dd>
      </dl>
    </>
  );
}

export function ResultsPanel({ identify, measurement, profile, profileBusy, onClose }: Props) {
  if (!identify && !measurement && !profile && !profileBusy) {return null;}
  return (
    <section className="panel results" aria-label="Results">
      <div className="panel-head">
        <h2>{profile || profileBusy ? "Elevation profile" : measurement ? "Measurement" : "Identify"}</h2>
        <button type="button" className="small" onClick={onClose}>Close</button>
      </div>
      {profileBusy && <p className="empty">Sampling the terrain…</p>}
      {profile && <ProfileChart points={profile} />}
      {measurement && (
        <p className="measure-value">
          {measurement.kind === "distance" ? formatLength(measurement.value) : formatArea(measurement.value)}
          <small>{measurement.vertices} vertices · double-click or Enter to finish, Esc to clear</small>
        </p>
      )}
      {identify && (
        <div className="identify">
          <p className="muted">
            {identify.at[1].toFixed(5)}, {identify.at[0].toFixed(5)}
            {identify.elevation !== null && <> · <strong>{Math.round(identify.elevation)} m</strong></>}
          </p>
          {identify.hits.length === 0 && <p className="empty">Nothing here.</p>}
          {identify.hits.map((h, i) => (
            <details key={i} open={i < 3}>
              <summary>{h.layer}{h.detail ? <small> · {h.detail}</small> : null}</summary>
              <dl className="meta">
                {Object.entries(h.properties).filter(([k]) => !k.startsWith("__")).map(([k, v]) => (
                  <Fragment key={k}><dt>{k}</dt><dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></Fragment>
                ))}
              </dl>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
