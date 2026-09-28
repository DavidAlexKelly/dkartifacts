/**
 * Example: elevation as an add-on to the basemap.
 *
 * Two things are being demonstrated, and they are separable on purpose:
 *
 *   1. `elevation()` is an EXTENSION. The basemap is stock — no elevation props
 *      on it, no wrapper component — and the add-on contributes its terrain,
 *      hillshade and tints into the style before the map is built. Swap the
 *      array for `[elevation(...), milGraphics(...)]` and both are on the same
 *      map, which is the whole point of the contract.
 *
 *   2. The SAME DEM source answers questions. The extension hands its source
 *      to `onReady`, and this page uses it for the readout under the cursor,
 *      the section under a line, and whether one point can see the other. No
 *      second source, no second copy of every decoded cell.
 *
 * Layer toggles remount the map (see `signature` below) because a MapLibre
 * style is assembled once at construction. That is a harness convenience, not
 * a library limitation: an app that wants live toggling holds the layers and
 * flips their visibility, which is three lines against the map object.
 */

import React, { useMemo, useState } from "react";
import type maplibregl from "maplibre-gl";
import { describeBasemapError } from "@acc/decho-basemap";
import { DechoBasemap } from "@acc/decho-basemap/react";
import {
  contourTiles,
  elevation,
  hillshadeTiles,
} from "@acc/decho-elevation/extension";
import type { DemSourceHandle, ElevationProfile, SightResult } from "@acc/decho-elevation";
import {
  TerrainProfile,
  useCursorElevation,
  useElevation,
} from "@acc/decho-elevation/react";
import {
  errorPanel,
  mapPanel,
  panelCheckbox,
  panelFigures,
  panelHeading,
  panelMuted,
  panelSeparator,
  panelToggle,
  surface,
} from "@/components/mapPanel";

/** Jotunheimen. Steep, glaciated, and unambiguous relief to look at. */
const SPAWN = { lat: 61.5, lon: 9.0, zoom: 10 };

interface Picked {
  lon: number;
  lat: number;
}

function ElevationPage(): React.ReactElement {
  const [terrain, setTerrain] = useState(true);
  // Two hillshades, and the page is where you compare them: one computed by
  // MapLibre from the DEM, one baked by gdaldem into its own GeoTIFFs.
  const [hillshade, setHillshade] = useState(true);
  const [bakedHillshade, setBakedHillshade] = useState(false);
  const [tint, setTint] = useState(false);
  const [slope, setSlope] = useState(false);
  // Two kinds of contour, and the page is where the difference is visible.
  // The traced ones are vector tiles cut per DEM cell and can be labelled; the
  // DEM ones are found per pixel at render time and cannot.
  const [contours, setContours] = useState(true);
  const [demContours, setDemContours] = useState(false);

  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [zoom, setZoom] = useState(SPAWN.zoom);
  const [source, setSource] = useState<DemSourceHandle | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [profile, setProfile] = useState<ElevationProfile | null>(null);
  const [sight, setSight] = useState<SightResult | null>(null);
  const [busy, setBusy] = useState(false);

  const cursor = useCursorElevation(map, source);
  const { profile: computeProfile, sight: computeSight } = useElevation({
    source,
  });

  // The style is assembled once, so the layer set is part of the map's
  // identity: changing it changes the key and React builds a new map.
  const signature = `${terrain}-${hillshade}-${tint}-${slope}-${contours}-${demContours}-${bakedHillshade}`;

  const extensions = useMemo(
    () => [
      elevation({
        terrain: terrain ? { exaggeration: 1.5 } : false,
        hillshade,
        tint: tint ? { opacity: 0.65 } : false,
        slope,
        // No options: the interval comes from the tile's own zoom — 10 m at
        // z14 and above, 25 m at z12-13, 100 m below — with every fifth line
        // heavier. Fixing it with `interval` is the thing NOT to do here,
        // because this page is where you find out what the ladder looks like.
        contours: demContours,
        sky: terrain,
        onReady: setSource,
      }),
      // Baked relief before the traced contours, so the lines read over the
      // shading rather than under it.
      ...(bakedHillshade ? [hillshadeTiles()] : []),
      // The traced contours are a separate extension because they are a
      // separate dataset: one PMTiles per DEM cell, attached per visible cell
      // because each archive is clipped to its own.
      ...(contours ? [contourTiles()] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  const onMapReady = (instance: maplibregl.Map) => {
    setMap(instance);
    // Shown in the panel next to the DEM's own floor. Without it, "why is there
    // no relief" at low zoom looks like a broken map rather than a deliberate
    // refusal to download 2° chunks nobody can see.
    instance.on("zoomend", () => setZoom(instance.getZoom()));
    instance.on("click", (event) => {
      const point = { lon: event.lngLat.lng, lat: event.lngLat.lat };
      setPicked((previous) => (previous.length >= 2 ? [point] : [...previous, point]));
    });
  };

  // Two points picked: draw the section between them and answer the only
  // question anybody asks of a DEM on a military map.
  React.useEffect(() => {
    if (picked.length !== 2 || !source) {
      setProfile(null);
      setSight(null);
      return;
    }

    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const [from, to] = picked;
        const [nextProfile, nextSight] = await Promise.all([
          computeProfile([from, to], { samples: 240 }),
          computeSight({ from, to, observerHeight: 2, targetHeight: 2 }),
        ]);
        if (cancelled) {return;}
        setProfile(nextProfile);
        setSight(nextSight);
      } finally {
        if (!cancelled) {setBusy(false);}
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [picked, source, computeProfile, computeSight]);

  const stats = source?.stats();

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <DechoBasemap
        key={signature}
        rid="ri.foundry.main.dataset.c7e99de1-90a4-4e22-bd26-b42316d70fe4"
        assetsRid="ri.foundry.main.dataset.8637f7a1-7503-459c-82c9-78e6ffa94e6e"
        spritePath="sprites/light"
        spawnLat={SPAWN.lat}
        spawnLong={SPAWN.lon}
        spawnZoom={SPAWN.zoom}
        extensions={extensions}
        onMapReady={onMapReady}
        style={{ height: "100%" }}
        renderError={(err) => {
          const { title, detail, remediation, rid, path } =
            describeBasemapError(err);
          return (
            <div style={errorStyle}>
              <strong>{title}</strong>
              <div>{detail}</div>
              {remediation && <div style={{ marginTop: 8 }}>{remediation}</div>}
              {rid && (
                <div style={{ marginTop: 8, opacity: 0.75 }}>
                  {rid}
                  {path ? ` · ${path}` : ""}
                </div>
              )}
            </div>
          );
        }}
      />

      <div style={panel}>
        <div style={{ ...panelHeading, marginBottom: 4 }}>Elevation</div>
        <Toggle label="3D terrain" value={terrain} onChange={setTerrain} />
        <Toggle label="Hillshade (from DEM)" value={hillshade} onChange={setHillshade} />
        <Toggle
          label="Hillshade (baked)"
          value={bakedHillshade}
          onChange={setBakedHillshade}
        />
        <Toggle label="Contours (traced)" value={contours} onChange={setContours} />
        <Toggle
          label="Contours (from DEM)"
          value={demContours}
          onChange={setDemContours}
        />
        <Toggle label="Hypsometric tint" value={tint} onChange={setTint} />
        <Toggle label="Slope / mobility" value={slope} onChange={setSlope} />

        <div style={panelSeparator} />

        <div>
          {source && zoom < source.minZoom ? (
            <span style={{ color: "#e0b64a" }}>
              Zoom in to z{source.minZoom} for relief — currently z
              {zoom.toFixed(1)}
            </span>
          ) : (
            <span style={panelMuted}>
              Relief from z{source?.minZoom ?? "?"} · now z{zoom.toFixed(1)}
            </span>
          )}
        </div>

        <div style={panelSeparator} />

        <div>
          {cursor ? (
            <>
              <div>
                {Number.isFinite(cursor.elevation ?? NaN)
                  ? `${Math.round(cursor.elevation as number)} m`
                  : "no data"}
              </div>
              <div style={panelMuted}>
                {cursor.lat.toFixed(4)}, {cursor.lon.toFixed(4)}
              </div>
            </>
          ) : (
            <div style={panelMuted}>Move over the map for a height</div>
          )}
        </div>

        <div style={panelSeparator} />

        <div style={panelMuted}>
          {picked.length === 0 && "Click two points for a section"}
          {picked.length === 1 && "Click the second point"}
          {picked.length === 2 && (busy ? "Reading the terrain…" : "Click again to start over")}
        </div>

        {stats && (
          <div style={{ ...panelFigures, marginTop: 8 }}>
            {stats.residentCells} cells ·{" "}
            {(stats.residentBytes / 1e6).toFixed(0)}/
            {(stats.budgetBytes / 1e6).toFixed(0)} MB
            {stats.absentCells > 0 ? ` · ${stats.absentCells} absent` : ""}
          </div>
        )}
      </div>

      {profile && (
        <div style={profilePanel}>
          <TerrainProfile
            profile={profile}
            sight={sight}
            height={150}
            // The chart's own defaults are for a light page; on the dark panel
            // it needs the surface's colours or it is a white rectangle.
            groundColour="#3c4a3f"
            lineColour="#9fc4a8"
            style={{ color: surface.text }}
          />
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}): React.ReactElement {
  return (
    <label style={panelToggle}>
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        style={panelCheckbox}
      />
      {label}
    </label>
  );
}

const panel: React.CSSProperties = {
  ...mapPanel,
  top: 12,
  left: 12,
  minWidth: 190,
};

const profilePanel: React.CSSProperties = {
  ...mapPanel,
  bottom: 12,
  left: 12,
  right: 12,
  padding: 8,
};

const errorStyle: React.CSSProperties = {
  ...errorPanel,
  top: 12,
  left: 220,
  zIndex: 3,
};

export default ElevationPage;
