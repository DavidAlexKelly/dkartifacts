/**
 * Example: an offline Foundry basemap in a stock OSDK React app.
 *
 * Just the map, full bleed, with the drawing tools enabled. There is no
 * basemap URL anywhere in this file and the app makes no external network
 * calls: tiles, glyphs and sprites all come from Foundry datasets.
 *
 * The error state is kept deliberately — it is the one overlay worth having,
 * because the most common setup failure (datasets not added as Resources on
 * the app) otherwise produces a blank screen with a 403 buried in the console.
 *
 * The 3D switch is here rather than on a page of its own because
 * `buildings3d()` extrudes the archive's OWN `buildings` layer — no second
 * dataset, no second download — so it is a property of this package. It sits at
 * the end of the drawing toolbar via `toolbarItems`, which is where an add-on's
 * control belongs: beside the map controls, not in a panel in another corner.
 *
 * The ground textures beside it are the same argument again: `landusePatterns()`
 * colours and then prints on the archive's own `landuse` polygons, so the plate
 * says what the ground IS rather than only what colour it is. On by default,
 * because it is what this page is for.
 *
 * Note what the switch does and does not do. It toggles the ICONS; the colour
 * stays. Farmland being yellow is a fact about the map — and it has to be
 * painted here at all because the Protomaps flavor does not colour farmland,
 * orchard, wetland, heath, scrub or residential, leaving all six the same grey.
 *
 * NOTHING IS REBUILT WHEN IT IS SWITCHED
 * --------------------------------------
 * The extension is created ONCE (`useMemo` with no dependencies) and toggled
 * with `setVisible`, which flips one layout property on the live map. There is
 * no `key`, so React never remounts <DechoBasemap/>: the downloaded tiles, the
 * camera, the drawing and the map instance all survive the switch. Rebuilding
 * the map to add a layer is the obvious implementation and it throws all of
 * that away for a control the user expects to be instant.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type BasemapHandle,
  type BuildingCoverage,
  buildings3d,
  describeBasemapError,
  describeBuildingCoverage,
  landusePatterns,
} from "@acc/decho-basemap";
import {
  BuildingsIcon,
  DechoBasemap,
  MapToolbarButton,
  TexturesIcon,
} from "@acc/decho-basemap/react";
import type maplibregl from "maplibre-gl";
import { errorPanel } from "@/components/mapPanel";

/** Paris. Change these, or pass ?lat= &lon= &z= through from the URL. */
const SPAWN = { lat: 48.8566, lon: 2.3522, zoom: 12 };

/** Where the extrusions start. Also where the flat building fill hands over. */
const BUILDINGS_FROM = 14;

function MapPage(): React.ReactElement {
  const [buildings, setBuildings] = useState(false);
  const [textures, setTextures] = useState(true);
  const [, setGlobe] = useState<BasemapHandle | null>(null);
  const [, setZoom] = useState(SPAWN.zoom);
  const [, setCoverage] = useState<BuildingCoverage | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Created once. A new instance per render would register a second protocol
  // and claim the same layer id, and the extension list is read at
  // construction anyway.
  const extension = useMemo(() => buildings3d({ minZoom: BUILDINGS_FROM, visible: false }), []);
  // Ground colour and ground texture: farmland yellow, woodland green, marsh
  // blue-green, then trees, wheat, reeds and houses printed on top. Created
  // once and toggled for the same reason the buildings are — the switch must
  // not cost the downloaded tiles.
  //
  // `ground` repaints the flavor's `earth` fill, which is a grey: defensible
  // when nothing else on the plate is coloured, and pavement-like once the
  // fields and woods around it are not.
  const patterns = useMemo(() => landusePatterns({ ground: true }), []);
  const extensions = useMemo(() => [patterns, extension], [patterns, extension]);

  useEffect(() => {
    patterns.setVisible(textures);
  }, [textures, patterns]);

  useEffect(() => {
    extension.setVisible(buildings);

    // Extrusions only read as 3D from an oblique camera, and nothing about
    // showing the layer tilts the map for you. Eased both ways, so the switch
    // is reversible rather than leaving the user to find the pitch control.
    mapRef.current?.easeTo({ pitch: buildings ? 55 : 0, duration: 600 });
  }, [buildings, extension]);

  const onMapReady = useCallback((map: maplibregl.Map, handle: BasemapHandle) => {
    mapRef.current = map;
    setGlobe(handle);
    setZoom(map.getZoom());

    const census = () => {
      setZoom(map.getZoom());
      setCoverage(describeBuildingCoverage(map, { sourceId: handle.sourceId }));
    };
    // `idle` as well as `moveend`: the census reads the tiles the map is
    // holding, and straight after a pan that is the old set. Idle fires once
    // the new tiles are in, which is when the numbers mean anything.
    map.on("moveend", census);
    map.on("idle", census);
  }, []);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <DechoBasemap
        rid={"ri.foundry.main.dataset.c7e99de1-90a4-4e22-bd26-b42316d70fe4"}
        assetsRid={"ri.foundry.main.dataset.8637f7a1-7503-459c-82c9-78e6ffa94e6e"}
        // Without this the style gets a `glyphs` key but no `sprite`, so labels
        // render while every icon the Protomaps layers ask for (park, peak,
        // train_station, generic_shield-*) logs "could not be loaded".
        spritePath="sprites/light"
        spawnLat={SPAWN.lat}
        spawnLong={SPAWN.lon}
        spawnZoom={SPAWN.zoom}
        drawingTools
        extensions={extensions}
        onMapReady={onMapReady}
        toolbarItems={
          <>
            {/*
              The ICONS only. The colour underneath them stays either way —
              see the note above: it is the ground, not an overlay.
            */}
            <MapToolbarButton
              label={textures ? "Ground icons: on" : "Ground icons: off"}
              active={textures}
              onClick={() => setTextures((on) => !on)}
            >
              <TexturesIcon />
            </MapToolbarButton>
            <MapToolbarButton
              label={buildings ? "3D buildings: on" : "3D buildings: off"}
              active={buildings}
              onClick={() => setBuildings((on) => !on)}
            >
              <BuildingsIcon />
            </MapToolbarButton>
          </>
        }
        // MapLibre's native globe projection: a sphere when zoomed out,
        // transitioning to the flat map as you zoom in. Only worth enabling for
        // a store with global coverage — which the chunked planet basemap is.
        //
        // Left on with the buildings switch: the projection has already
        // transitioned to flat well below z14, so at the zooms extrusions exist
        // at there is nothing for the two to disagree about.
        globe
        style={{ height: "100%" }}
        renderError={(err) => {
          // The library classifies the failure and owns the remediation copy.
          // This page used to hardcode "probably not added as a Resource" and
          // show it for every error, including the ones where that was untrue.
          const { title, detail, remediation, rid, path } = describeBasemapError(err);
          return (
            <div style={panel}>
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

      {/*
        The census is the point of this readout. The Protomaps schema holds
        MERGED buildings up to z14 and individual ones only from z15, so an
        archive cut at z12 can only ever give block-level massing — and if
        `height` is missing from most features, every block is the same default
        slab. Both facts are visible here and nowhere else.
      */}
    </div>
  );
}

const panel: React.CSSProperties = {
  ...errorPanel,
  // Below the toolbar, which is at top-left.
  top: 56,
  left: 12,
  zIndex: 3,
};

export default MapPage;
