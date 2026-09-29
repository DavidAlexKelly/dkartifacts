/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: schemas/*.xml
 * Standard: MIL-STD-2525D / APP-6D, JointMilSyML (http://disa.mil/JointMilSyML.xsd)
 * Regenerate: npm run generate   (from packages/unit-symbol-picker)
 */

import type { SymbolSetTable } from "../types.js";
import { ACTIVITY } from "./activity.js";
import { AIR } from "./air.js";
import { AIR_MISSILE } from "./airMissile.js";
import { ATMOSPHERIC } from "./atmospheric.js";
import { CONTROL_MEASURE } from "./controlMeasure.js";
import { CYBERSPACE } from "./cyberspace.js";
import { INTERNAL } from "./internal.js";
import { LAND_CIVILIAN } from "./landCivilian.js";
import { LAND_EQUIPMENT } from "./landEquipment.js";
import { LAND_INSTALLATION } from "./landInstallation.js";
import { LAND_UNIT } from "./landUnit.js";
import { METEOROLOGICAL_SPACE } from "./meteorologicalSpace.js";
import { MINE_WARFARE } from "./mineWarfare.js";
import { OCEANOGRAPHIC } from "./oceanographic.js";
import { SIGINT_AIR } from "./sigintAir.js";
import { SIGINT_LAND } from "./sigintLand.js";
import { SIGINT_SPACE } from "./sigintSpace.js";
import { SIGINT_SUBSURFACE } from "./sigintSubsurface.js";
import { SIGINT_SURFACE } from "./sigintSurface.js";
import { SEA_SUBSURFACE } from "./seaSubsurface.js";
import { SEA_SURFACE } from "./seaSurface.js";
import { SPACE } from "./space.js";
import { SPACE_MISSILE } from "./spaceMissile.js";
import { UNKNOWN } from "./unknown.js";

export {
  ACTIVITY,
  AIR,
  AIR_MISSILE,
  ATMOSPHERIC,
  CONTROL_MEASURE,
  CYBERSPACE,
  INTERNAL,
  LAND_CIVILIAN,
  LAND_EQUIPMENT,
  LAND_INSTALLATION,
  LAND_UNIT,
  METEOROLOGICAL_SPACE,
  MINE_WARFARE,
  OCEANOGRAPHIC,
  SIGINT_AIR,
  SIGINT_LAND,
  SIGINT_SPACE,
  SIGINT_SUBSURFACE,
  SIGINT_SURFACE,
  SEA_SUBSURFACE,
  SEA_SURFACE,
  SPACE,
  SPACE_MISSILE,
  UNKNOWN,
};

/**
 * Every symbol set by its two-digit code.
 *
 * Importing this barrel pulls in all of them. Import the individual module when
 * one set is all that is wanted — a picker for land units has no use for
 * oceanographic features, and this is the seam that lets it not pay for them.
 */
export const SYMBOL_SET_TABLES: Record<string, SymbolSetTable> = {
  [ACTIVITY.code]: ACTIVITY,
  [AIR.code]: AIR,
  [AIR_MISSILE.code]: AIR_MISSILE,
  [ATMOSPHERIC.code]: ATMOSPHERIC,
  [CONTROL_MEASURE.code]: CONTROL_MEASURE,
  [CYBERSPACE.code]: CYBERSPACE,
  [INTERNAL.code]: INTERNAL,
  [LAND_CIVILIAN.code]: LAND_CIVILIAN,
  [LAND_EQUIPMENT.code]: LAND_EQUIPMENT,
  [LAND_INSTALLATION.code]: LAND_INSTALLATION,
  [LAND_UNIT.code]: LAND_UNIT,
  [METEOROLOGICAL_SPACE.code]: METEOROLOGICAL_SPACE,
  [MINE_WARFARE.code]: MINE_WARFARE,
  [OCEANOGRAPHIC.code]: OCEANOGRAPHIC,
  [SIGINT_AIR.code]: SIGINT_AIR,
  [SIGINT_LAND.code]: SIGINT_LAND,
  [SIGINT_SPACE.code]: SIGINT_SPACE,
  [SIGINT_SUBSURFACE.code]: SIGINT_SUBSURFACE,
  [SIGINT_SURFACE.code]: SIGINT_SURFACE,
  [SEA_SUBSURFACE.code]: SEA_SUBSURFACE,
  [SEA_SURFACE.code]: SEA_SURFACE,
  [SPACE.code]: SPACE,
  [SPACE_MISSILE.code]: SPACE_MISSILE,
  [UNKNOWN.code]: UNKNOWN,
};
