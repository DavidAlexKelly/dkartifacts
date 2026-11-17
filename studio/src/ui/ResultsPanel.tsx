import type { Position } from "geojson";
import { Fragment } from "react";
import type { ProfilePoint } from "../data/elevation";
import type { LineOfSightResult } from "../analysis/terrain";
import type { Tool } from "../map/tools";
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

export interface ViewshedSettings {
  radiusKm: number;
  observerM: number;
  targetM: number;
}

interface Props {
  tool: Tool;
  los: LineOfSightResult | null;
  busy: string | null;
  viewshedSettings: ViewshedSettings;
  onViewshedSettings(s: ViewshedSettings): void;
  routeSettings: { profile: "tracked" | "wheeled" | "foot"; dataset: string };
  onRouteSettings(s: { profile: "tracked" | "wheeled" | "foot"; dataset: string }): void;
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

function SightChart({ r }: { r: LineOfSightResult }) {
  const pts = r.profile;
  if (pts.length < 2) {return null;}
  const W = 280, H = 130, L = 38, B = 20;
  const ys = pts.flatMap((p) => [p.ground, p.sightLine]);
  const min = Math.min(...ys), max = Math.max(...ys), span = Math.max(1, max - min);
  const total = pts[pts.length - 1].distanceM || 1;
  const x = (d: number) => L + (d / total) * (W - L - 6);
  const y = (h: number) => 6 + (1 - (h - min) / span) * (H - B - 6);
  const ground = pts.map((p, i) => `${i ? "L" : "M"}${x(p.distanceM).toFixed(1)},${y(p.ground).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="profile" role="img" aria-label="Line of sight profile">
      <path d={`${ground}L${x(total)},${H - B}L${x(0)},${H - B}Z`} className="profile-fill" />
      <path d={ground} className="profile-line" />
      <line x1={x(0)} y1={y(pts[0].sightLine)} x2={x(total)} y2={y(pts[pts.length - 1].sightLine)} stroke={r.visible ? "#1aa64b" : "#d7263d"} strokeWidth={1.6} strokeDasharray="4 3" />
      {r.blockedAt && <circle cx={x(r.blockedAt.distanceM)} cy={y(pts.reduce((a, p) => (Math.abs(p.distanceM - r.blockedAt!.distanceM) < Math.abs(a.distanceM - r.blockedAt!.distanceM) ? p : a)).ground)} r={3.5} fill="#d7263d" />}
      <text x={L - 4} y={y(max) + 4} textAnchor="end">{Math.round(max)}</text>
      <text x={L - 4} y={y(min)} textAnchor="end">{Math.round(min)}</text>
      <text x={W - 6} y={H - 5} textAnchor="end">{formatLength(total)}</text>
    </svg>
  );
}

export function ResultsPanel({ tool, los, busy, viewshedSettings, onViewshedSettings, routeSettings, onRouteSettings, identify, measurement, profile, profileBusy, onClose }: Props) {
  const showSettings = tool === "viewshed" || tool === "los";
  if (!identify && !measurement && !profile && !profileBusy && !los && !busy && !showSettings && tool !== "route") {return null;}
  const v = viewshedSettings;
  const num = (key: keyof ViewshedSettings, label: string, min: number, max: number, step: number) => (
    <label className="row">
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step} value={v[key]} onChange={(e) => onViewshedSettings({ ...v, [key]: Math.min(max, Math.max(min, Number(e.target.value) || 0)) })} />
    </label>
  );
  return (
    <section className="panel results" aria-label="Results">
      <div className="panel-head">
        <h2>{tool === "route" ? "Route" : los || tool === "los" ? "Line of sight" : tool === "viewshed" ? "Viewshed" : profile || profileBusy ? "Elevation profile" : measurement ? "Measurement" : "Identify"}</h2>
        <button type="button" className="small" onClick={onClose}>Close</button>
      </div>
      {showSettings && (
        <div className="props">
          {tool === "viewshed" && num("radiusKm", "Radius (km)", 0.5, 50, 0.5)}
          {num("observerM", "Observer height (m)", 0, 500, 1)}
          {num("targetM", "Target height (m)", 0, 500, 1)}
          <p className="hint">Heights above the ground. Earth curvature and refraction are included.</p>
        </div>
      )}
      {tool === "route" && (
        <div className="props">
          <label className="row">
            <span>Vehicle</span>
            <select value={routeSettings.profile} onChange={(e) => onRouteSettings({ ...routeSettings, profile: e.target.value as "tracked" | "wheeled" | "foot" })}>
              <option value="tracked">tracked</option>
              <option value="wheeled">wheeled</option>
              <option value="foot">on foot</option>
            </select>
          </label>
          <label className="row">
            <span>Graph dataset</span>
            <input value={routeSettings.dataset} onChange={(e) => onRouteSettings({ ...routeSettings, dataset: e.target.value.trim() })} aria-label="Pathfinding graph dataset" />
          </label>
          <p className="hint">Routes follow the terrain graphs: slope, water and built-up areas count. The result is added as a layer.</p>
        </div>
      )}
      {busy && <p className="empty">{busy}</p>}
      {los && (
        <>
          <p className="measure-value">
            {los.visible ? "Visible" : "Not visible"}
            <small>{los.blockedAt ? `Blocked ${formatLength(los.blockedAt.distanceM)} from the observer` : "Nothing in the way"}</small>
          </p>
          <SightChart r={los} />
        </>
      )}
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
