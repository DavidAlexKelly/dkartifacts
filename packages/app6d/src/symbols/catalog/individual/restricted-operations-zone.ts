// symbols/catalog/individual/restricted-operations-zone.ts — standalone,
// tree-shakeable.
//
// The ROZ: airspace of defined dimensions within which the activities of
// certain airspace users are restricted.
//
// Like the FLOT, this is not one of the 346 extracted rows — it comes from
// TACTIC_TASK_CATALOG, which has carried `restricted-operations-zone-roz` and
// its SIDC with no graphic behind it. It is the same drawn airspace area as
// the engagement zones, so it is authored rather than left undrawable.
import type { SymbolDefinition } from "../../../engine/types";
import { areaFamily, areaHandles, AREA_RING_DEFAULT } from "../../families";

export const RESTRICTED_OPERATIONS_ZONE_NAME = "svg-restricted-operations-zone" as const;

export const restrictedOperationsZoneSymbol: SymbolDefinition = {
  title: 'Restricted Operations Zone (ROZ)',
  params: { ring: AREA_RING_DEFAULT, label: ['ROZ'], labelSize: 240, dashed: false },
  generate: areaFamily,
  handles: areaHandles,
  unitAnchor: 'center',
  meta: { sidcTaskId: "restricted-operations-zone-roz" },
};
