/**
 * Example: terrain-aware routing on the offline basemap.
 *
 * Click once to set a start, again to set an objective; the route is computed
 * from the tiled pathfinding graphs in Foundry and drawn on the map. Change the
 * mobility profile and the same two points give a different line — that is the
 * cost model doing its job, not a different graph.
 *
 * This is deliberately the LOW-LEVEL composition: a stock <DechoBasemap/>, the
 * map handed over by onMapReady, and the routing package attached to it from
 * outside. Nothing in @acc/decho-basemap knows this page exists, which is the
 * property that lets several add-ons share one map.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
// Namespace, not default: maplibre-gl 6 is ESM-only and has no default export.
import * as maplibregl from "maplibre-gl";
import { DechoBasemap } from "@acc/decho-basemap/react";
import {
  FOOT,
  TRACKED,
  WHEELED,
  isPathfindingError,
  type GeoPoint,
  type VehicleProfile,
} from "@acc/decho-pathfinding";
import { usePathfinding } from "@acc/decho-pathfinding/react";
import {
  attachViewportPrefetch,
  useRouteLayer,
} from "@acc/decho-pathfinding/map";

/** Paris, matching the basemap example. */
const SPAWN = { lat: 48.8566, lon: 2.3522, zoom: 10 };

const PROFILES: VehicleProfile[] = [FOOT, WHEELED, TRACKED];

const START_COLOUR = "#22c55e";
const GOAL_COLOUR = "#ef4444";

function marker(
  map: maplibregl.Map,
  point: GeoPoint,
  colour: string,
): maplibregl.Marker {
  return new maplibregl.Marker({ color: colour })
    .setLngLat([point.lon, point.lat])
    .addTo(map);
}

function RoutePage(): React.ReactElement {
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [profileId, setProfileId] = useState(TRACKED.id);
  const [from, setFrom] = useState<GeoPoint | null>(null);
  const [to, setTo] = useState<GeoPoint | null>(null);

  const { route, result, routing, error, reset, pathfinder } = usePathfinding();
  useRouteLayer(map, result?.waypoints ?? null);

  const markers = useRef<maplibregl.Marker[]>([]);

  const clear = useCallback(() => {
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    setFrom(null);
    setTo(null);
    reset();
  }, [reset]);

  // State is read through refs inside the map handler: MapLibre listeners are
  // registered once, so a closure over `from`/`to` would see their first
  // values forever.
  const stateRef = useRef({ from, to, profileId });
  stateRef.current = { from, to, profileId };

  // Detach for the viewport prefetch below. The map is destroyed with the
  // page anyway, but the debounce timer is not.
  const detachPrefetch = useRef<(() => void) | null>(null);
  useEffect(() => () => detachPrefetch.current?.(), []);

  const onMapReady = useCallback(
    (instance: maplibregl.Map) => {
      setMap(instance);

      // Warm the cells under the view once the user settles, so the first
      // click-to-route in an area does not wait on a download. Opt-in, because
      // it spends megabytes on someone who may never route — reasonable here,
      // since routing is the entire point of this page.
      detachPrefetch.current = attachViewportPrefetch(
        instance,
        pathfinder.source,
      );

      instance.on("click", (event) => {
        const point: GeoPoint = {
          lat: event.lngLat.lat,
          lon: event.lngLat.lng,
        };
        const current = stateRef.current;

        // Third click starts a new pair rather than extending the old one.
        if (current.from && current.to) {
          markers.current.forEach((marker) => marker.remove());
          markers.current = [];
          setTo(null);
          setFrom(point);
          markers.current.push(marker(instance, point, START_COLOUR));
          return;
        }

        if (!current.from) {
          setFrom(point);
          markers.current.push(marker(instance, point, START_COLOUR));
          return;
        }

        setTo(point);
        markers.current.push(marker(instance, point, GOAL_COLOUR));
        void route(current.from, point, {
          profile: PROFILES.find((p) => p.id === current.profileId),
        });
      });
    },
    // The pathfinder is memoised for the life of the component, so naming its
    // source here does not re-register the map handlers.
    [route, pathfinder.source],
  );

  const stats = pathfinder.source.stats();

  return (
    <DechoBasemap
      spawnLat={SPAWN.lat}
      spawnLong={SPAWN.lon}
      spawnZoom={SPAWN.zoom}
      onMapReady={onMapReady}
      style={{ height: "100%" }}
    >
      <div style={panel}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          Terrain routing · @acc/decho-pathfinding
        </div>

        <div style={{ marginBottom: 6 }}>
          {!from && "Click a start point."}
          {from && !to && "Click an objective."}
          {routing && "Routing…"}
          {from && to && !routing && !error && !result && "No result."}
        </div>

        <label style={{ display: "block", marginBottom: 6 }}>
          Mobility{" "}
          <select
            value={profileId}
            onChange={(event) => {
              setProfileId(event.target.value);
              // Re-route the pair already on the map, so switching profile
              // shows the difference immediately — which is the whole point.
              if (from && to) {
                void route(from, to, {
                  profile: PROFILES.find((p) => p.id === event.target.value),
                });
              }
            }}
          >
            {PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label ?? profile.id}
              </option>
            ))}
          </select>
        </label>

        {result && (
          <div style={{ marginBottom: 6 }}>
            <div>{(result.distanceM / 1000).toFixed(1)} km</div>
            {result.etaS !== null && (
              <div>{(result.etaS / 3600).toFixed(1)} h</div>
            )}
            <div style={{ opacity: 0.7 }}>
              {result.cells.length} cells · {result.stats.expanded} nodes ·{" "}
              {result.stats.ms} ms
              {result.truncated ? " · truncated" : ""}
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: "#b00020", marginBottom: 6 }}>
            {isPathfindingError(error) ? error.message : String(error)}
          </div>
        )}

        <div style={{ opacity: 0.7, marginBottom: 6 }}>
          {stats.residentCells} cells resident ·{" "}
          {(stats.residentBytes / 1e6).toFixed(1)} MB parsed
        </div>

        <button type="button" onClick={clear}>
          Clear
        </button>
      </div>
    </DechoBasemap>
  );
}

const panel: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.92)",
  border: "1px solid #ccc",
  borderRadius: 6,
  font: "12px/1.5 ui-monospace, monospace",
  maxWidth: 320,
  zIndex: 1,
};

export default RoutePage;
