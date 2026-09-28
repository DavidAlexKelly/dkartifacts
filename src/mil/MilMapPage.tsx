/**
 * The military planning workflow: this application's own, not a library.
 *
 * The whole workflow in one screen: right-click the map to place a unit,
 * right-click a unit to give it an order, click the objective. The component
 * owns the interaction; this page owns the state, which is exactly the split a
 * real application wants — swap `useState` for a Foundry-backed store and
 * nothing else here changes.
 *
 * No router is supplied, so orders take a straight line. Pass one and the
 * same orders follow terrain instead.
 */
import React, { useMemo, useState } from "react";
import { describeBasemapError } from "@acc/decho-basemap";
import type {
  MilOrder,
  PlacedMilUnit,
  UnitTemplate,
} from "@acc/app6d/orders";
import { MilMap } from "./MilMap";

/** Narva, Estonia — the same corner of the world the Scenario Planner opens on. */
const SPAWN = { lat: 59.37, lon: 28.19, zoom: 11 };

/**
 * A small palette. Domain data lives in the application, never in the package:
 * these are ordinary APP-6D unit SIDCs, and milsymbol draws them.
 */
const UNIT_TEMPLATES: UnitTemplate[] = [
  { id: "inf-pl", label: "Infantry Platoon", sidc: "SFGPUCI-----D---", category: "Friendly", echelon: "Platoon" },
  { id: "inf-coy", label: "Infantry Company", sidc: "SFGPUCI-----E---", category: "Friendly", echelon: "Company" },
  { id: "mech-coy", label: "Mechanised Company", sidc: "SFGPUCIZ----E---", category: "Friendly", echelon: "Company" },
  { id: "armd-coy", label: "Armoured Company", sidc: "SFGPUCA-----E---", category: "Friendly", echelon: "Company" },
  { id: "recce", label: "Reconnaissance Troop", sidc: "SFGPUCR-----C---", category: "Friendly", echelon: "Section" },
  { id: "arty-bty", label: "Artillery Battery", sidc: "SFGPUCF-----D---", category: "Friendly", echelon: "Battery" },
  { id: "engr", label: "Engineer Platoon", sidc: "SFGPUCE-----D---", category: "Friendly", echelon: "Platoon" },
  { id: "hq", label: "Battalion HQ", sidc: "SFGPUH------F---", category: "Friendly", echelon: "Battalion" },
  { id: "en-inf", label: "Infantry Company", sidc: "SHGPUCI-----E---", category: "Hostile", echelon: "Company" },
  { id: "en-armd", label: "Armoured Company", sidc: "SHGPUCA-----E---", category: "Hostile", echelon: "Company" },
];

function MilMapPage(): React.ReactElement {
  const [units, setUnits] = useState<PlacedMilUnit[]>([]);
  const [orders, setOrders] = useState<MilOrder[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const ordersByUnit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders) {
      // Orders placed on the map without a unit belong to no unit's count.
      if (order.unitId === undefined) {
        continue;
      }
      counts.set(order.unitId, (counts.get(order.unitId) ?? 0) + 1);
    }
    return counts;
  }, [orders]);

  return (
    <MilMap
      rid={"ri.foundry.main.dataset.c7e99de1-90a4-4e22-bd26-b42316d70fe4"}
      assetsRid={"ri.foundry.main.dataset.8637f7a1-7503-459c-82c9-78e6ffa94e6e"}
      spritePath="sprites/light"
      spawnLat={SPAWN.lat}
      spawnLong={SPAWN.lon}
      spawnZoom={SPAWN.zoom}
      unitTemplates={UNIT_TEMPLATES}
      units={units}
      orders={orders}
      onUnitsChange={setUnits}
      onOrdersChange={setOrders}
      selectedUnitId={selectedUnitId}
      onSelectUnit={setSelectedUnitId}
      style={{ height: "100%" }}
      renderError={(err) => {
        const { title, detail, remediation } = describeBasemapError(err);
        return (
          <div style={panel}>
            <strong>{title}</strong>
            <div>{detail}</div>
            {remediation && <div style={{ marginTop: 8 }}>{remediation}</div>}
          </div>
        );
      }}
    >
      <div style={hud}>
        <strong>Military map</strong>
        <div style={{ color: "#8b93a7" }}>
          Right-click the map to place a unit · right-click a unit to order it
        </div>
        <div style={{ marginTop: 6 }}>
          {units.length} unit{units.length === 1 ? "" : "s"} · {orders.length}{" "}
          order{orders.length === 1 ? "" : "s"}
        </div>
        {units.map((unit) => (
          <div
            key={unit.id}
            style={{
              color: unit.id === selectedUnitId ? "#4fc3f7" : "#c9d1d9",
            }}
          >
            {unit.label}
            <span style={{ color: "#5a6178" }}>
              {" "}
              · {ordersByUnit.get(unit.id) ?? 0} order
              {(ordersByUnit.get(unit.id) ?? 0) === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </MilMap>
  );
}

const hud: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  padding: "10px 12px",
  background: "rgba(17,19,24,0.92)",
  border: "1px solid #374057",
  borderRadius: 4,
  color: "#e8ecf4",
  font: "12px/1.5 system-ui, sans-serif",
  maxWidth: 260,
  maxHeight: "60vh",
  overflowY: "auto",
  pointerEvents: "none",
  zIndex: 5,
};

const panel: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.92)",
  border: "1px solid #ccc",
  borderRadius: 6,
  color: "#b00020",
  font: "12px/1.5 ui-monospace, monospace",
  maxWidth: 420,
  zIndex: 10,
};

export default MilMapPage;
