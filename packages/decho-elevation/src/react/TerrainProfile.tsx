/**
 * <TerrainProfile /> — the section under a line, as an SVG.
 *
 * Plain SVG with inline styles and no charting dependency, for the reason the
 * mil map's menus give: a component that drags in a chart library is one every
 * consumer has to reconcile with the chart library they already have. It draws
 * a filled section, an optional sight line, and the axis figures — which is all
 * a profile needs to answer "is that hill in the way".
 *
 * Pass a `SightResult`'s samples as `sightLine` and the obstruction is drawn
 * too: the line goes red past the point where the ground crosses it.
 */

import type { ElevationProfile } from "../core/profile";
import type { SightResult } from "../core/lineOfSight";

export interface TerrainProfileProps {
  profile: ElevationProfile;
  /** Draws the observer-to-target line over the section. */
  sight?: SightResult | null;
  /** SVG height in pixels. Width is fluid. */
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Fill under the ground line. */
  groundColour?: string;
  lineColour?: string;
  /**
   * Plate behind the chart. Transparent by default so the component inherits
   * whatever it is dropped on — a light card or a dark translucent map panel —
   * rather than punching a pale rectangle into it.
   */
  backgroundColour?: string;
}

const VIEW_WIDTH = 1000;

export function TerrainProfile({
  profile,
  sight,
  height = 140,
  className,
  style,
  groundColour = "#cbd5c0",
  lineColour = "#4a5240",
  backgroundColour = "transparent",
}: TerrainProfileProps) {
  const samples = profile.samples.filter((s) => Number.isFinite(s.elevation));
  if (samples.length < 2 || !Number.isFinite(profile.min)) {
    return (
      <div
        className={className}
        style={{ height, font: "12px/1.4 sans-serif", opacity: 0.7, ...style }}
      >
        No elevation data along this line.
      </div>
    );
  }

  // Sight lines rise above the ground by definition, so the vertical extent has
  // to include them or the line is drawn off the top of the chart.
  const sightValues = (sight?.samples ?? [])
    .map((s) => s.sightLine)
    .filter((v) => Number.isFinite(v));

  const low = Math.min(profile.min, ...sightValues);
  const high = Math.max(profile.max, ...sightValues);
  // A dead-flat profile would divide by zero and collapse to a single line at
  // the top of the box.
  const span = high - low || 1;
  const pad = span * 0.12;
  const top = high + pad;
  const bottom = Math.max(0, low - pad);

  const xOf = (distance: number) =>
    profile.length > 0 ? (distance / profile.length) * VIEW_WIDTH : 0;
  const yOf = (elevation: number) =>
    height - ((elevation - bottom) / (top - bottom || 1)) * height;

  const ground = samples
    .map((s, i) => `${i === 0 ? "M" : "L"}${xOf(s.distance).toFixed(1)} ${yOf(s.elevation).toFixed(1)}`)
    .join(" ");

  const filled =
    `${ground} L${xOf(samples[samples.length - 1].distance).toFixed(1)} ${height} ` +
    `L${xOf(samples[0].distance).toFixed(1)} ${height} Z`;

  const sightPath = sight
    ? sight.samples
        .map(
          (s, i) =>
            `${i === 0 ? "M" : "L"}${xOf(s.distance).toFixed(1)} ${yOf(s.sightLine).toFixed(1)}`,
        )
        .join(" ")
    : null;

  const blocked = sight && !sight.visible;

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", ...style }}
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label={`Terrain profile over ${formatDistance(profile.length)}, ${Math.round(
          profile.min,
        )} to ${Math.round(profile.max)} metres`}
        style={{ display: "block", background: backgroundColour }}
      >
        <path d={filled} fill={groundColour} />
        <path d={ground} fill="none" stroke={lineColour} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {sightPath && (
          <path
            d={sightPath}
            fill="none"
            stroke={blocked ? "#c43c30" : "#2f7d32"}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {sight?.obstruction && (
          <circle
            cx={xOf(sight.obstruction.distance)}
            cy={yOf(sight.obstruction.elevation)}
            r={4}
            fill="#c43c30"
            // The chart is stretched horizontally by preserveAspectRatio="none",
            // which would turn a circle into an ellipse. Drawing it in the
            // untransformed corner is not an option, so it is accepted: at r=4
            // the distortion is not what anyone is looking at.
          />
        )}
      </svg>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          font: "11px/1.6 sans-serif",
          // Inherited, not fixed: the axis figures have to be legible on
          // whatever this is dropped on, and the host already set a colour.
          color: "inherit",
          opacity: 0.8,
          padding: "2px 2px 0",
        }}
      >
        <span>0</span>
        <span>
          {Math.round(profile.min)}–{Math.round(profile.max)} m
          {profile.gain > 0 ? ` · +${Math.round(profile.gain)} m` : ""}
          {profile.voids > 0 ? ` · ${profile.voids} no-data` : ""}
          {sight
            ? sight.visible
              ? ` · line of sight clear by ${Math.round(sight.clearance)} m`
              : ` · blocked by ${Math.round(sight.obstruction?.rise ?? 0)} m at ${formatDistance(
                  sight.obstruction?.distance ?? 0,
                )}`
            : ""}
        </span>
        <span>{formatDistance(profile.length)}</span>
      </div>
    </div>
  );
}

function formatDistance(metres: number): string {
  return metres >= 10000
    ? `${(metres / 1000).toFixed(0)} km`
    : metres >= 1000
      ? `${(metres / 1000).toFixed(1)} km`
      : `${Math.round(metres)} m`;
}
