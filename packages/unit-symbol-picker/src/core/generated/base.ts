/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: schemas/Base.xml
 * Standard: MIL-STD-2525D / APP-6D, JointMilSyML (http://disa.mil/JointMilSyML.xsd)
 * Regenerate: npm run generate   (from packages/unit-symbol-picker)
 */

import type { AmplifierGroupTable, CodeOption } from "./types.js";

/** The one version the standard defines. Digits 1-2. */
export const VERSION = "10";

/** Digit 3. */
export const CONTEXTS: CodeOption[] = [
  { code: "0", label: "Reality" },
  { code: "1", label: "Exercise" },
  { code: "2", label: "Simulation" },
  { code: "9", label: "Extension", isExtension: true },
];

/** Digit 4. */
export const STANDARD_IDENTITIES: CodeOption[] = [
  { code: "0", label: "Pending" },
  { code: "1", label: "Unknown" },
  { code: "2", label: "Assumed Friend" },
  { code: "3", label: "Friend" },
  { code: "4", label: "Neutral" },
  { code: "5", label: "Suspect/Joker" },
  { code: "6", label: "Hostile/Faker" },
  { code: "9", label: "Extension", isExtension: true },
];

/** Digit 7. */
export const STATUSES: CodeOption[] = [
  { code: "0", label: "Present" },
  { code: "1", label: "Planned/Anticipated/Suspect" },
  { code: "2", label: "Present/Fully Capable" },
  { code: "3", label: "Present/Damaged" },
  { code: "4", label: "Present/Destroyed" },
  { code: "5", label: "Present/Full to Capacity" },
  { code: "9", label: "Extension", isExtension: true },
];

/** Digit 8. */
export const HQ_TF_DUMMIES: CodeOption[] = [
  { code: "0", label: "Unknown" },
  { code: "1", label: "Feint/Dummy" },
  { code: "2", label: "Headquarters" },
  { code: "3", label: "Feint/Dummy Headquarters" },
  { code: "4", label: "Task Force" },
  { code: "5", label: "Feint/Dummy Task Force" },
  { code: "6", label: "Task Force Headquarters" },
  { code: "7", label: "Feint/Dummy Task Force Headquarters" },
  { code: "9", label: "Extension", isExtension: true },
];

/**
 * Digits 9-10, by group.
 *
 * The standard does not have one flat list here: digit 9 chooses between
 * echelon, equipment mobility and naval towed array, and digit 10 is the value
 * within that. Which group applies to which symbol set is NOT reliably stated
 * in the published data — see `compatibleSymbolSetIds`.
 */
export const AMPLIFIER_GROUPS: AmplifierGroupTable[] = [
  { code: "0", label: "Unknown", compatibleSymbolSetIds: [], amplifiers: [
    { code: "00", label: "Unknown" },
  ] },
  { code: "1", label: "Echelon at brigade and below", compatibleSymbolSetIds: ["SS_AIR"], amplifiers: [
    { code: "11", label: "Team/Crew" },
    { code: "12", label: "Squad" },
    { code: "13", label: "Section" },
    { code: "14", label: "Platoon/Detachment" },
    { code: "15", label: "Company/Battery/Troop" },
    { code: "16", label: "Battalion/Squadron" },
    { code: "17", label: "Regiment/Group" },
    { code: "18", label: "Brigade" },
    { code: "19", label: "Extension", isExtension: true },
  ] },
  { code: "2", label: "Echelon at division and above", compatibleSymbolSetIds: ["SS_AIR"], amplifiers: [
    { code: "21", label: "Division" },
    { code: "22", label: "Corps/MEF" },
    { code: "23", label: "Army" },
    { code: "24", label: "Army Group/Front" },
    { code: "25", label: "Region/Theater" },
    { code: "26", label: "Command" },
    { code: "29", label: "Extension", isExtension: true },
  ] },
  { code: "3", label: "Equipment mobility on land", compatibleSymbolSetIds: [], amplifiers: [
    { code: "31", label: "Wheeled limited cross country" },
    { code: "32", label: "Wheeled cross country" },
    { code: "33", label: "Tracked" },
    { code: "34", label: "Wheeled and tracked combination" },
    { code: "35", label: "Towed" },
    { code: "36", label: "Rail" },
    { code: "37", label: "Pack animals" },
    { code: "39", label: "Extension", isExtension: true },
  ] },
  { code: "4", label: "Equipment mobility on snow", compatibleSymbolSetIds: [], amplifiers: [
    { code: "41", label: "Over snow (prime mover)" },
    { code: "42", label: "Sled" },
    { code: "49", label: "Extension", isExtension: true },
  ] },
  { code: "5", label: "Equipment mobility on water", compatibleSymbolSetIds: [], amplifiers: [
    { code: "51", label: "Barge" },
    { code: "52", label: "Amphibious" },
    { code: "59", label: "Extension", isExtension: true },
  ] },
  { code: "6", label: "Naval towed array", compatibleSymbolSetIds: ["SS_SEA_SURFACE"], amplifiers: [
    { code: "61", label: "Short towed array" },
    { code: "62", label: "Long towed array" },
    { code: "69", label: "Extension", isExtension: true },
  ] },
  { code: "9", label: "Extension", isExtension: true, compatibleSymbolSetIds: [], amplifiers: [
    { code: "99", label: "Extension", isExtension: true },
  ] },
];

/** Every amplifier as a flat two-digit list, for a single dropdown. */
export const AMPLIFIERS: CodeOption[] = AMPLIFIER_GROUPS.flatMap((group) => group.amplifiers);

/** Digits 5-6, with the dimension each belongs to. */
export const SYMBOL_SETS: Array<CodeOption & { id: string; dimension: string }> = [
  { code: "00", id: "SS_UNKNOWN", label: "Unknown", dimension: "Unknown" },
  { code: "01", id: "SS_AIR", label: "Air", dimension: "Air" },
  { code: "02", id: "SS_AIR_MISSILE", label: "Air Missile", dimension: "Air" },
  { code: "05", id: "SS_SPACE", label: "Space", dimension: "Space" },
  { code: "06", id: "SS_SPACE_MISSILE", label: "Space Missile", dimension: "Space" },
  { code: "10", id: "SS_LAND_UNIT", label: "Land Units", dimension: "Land Unit" },
  { code: "11", id: "SS_LAND_CIVILIAN", label: "Land Civilian", dimension: "Land Unit" },
  { code: "15", id: "SS_LAND_EQUIPMENT", label: "Land Equipment", dimension: "Land Equipment" },
  { code: "20", id: "SS_LAND_INSTALLATION", label: "Land Installation", dimension: "Land Installations" },
  { code: "25", id: "SS_CONTROL_MEASURE", label: "Control Measure", dimension: "Control Measure" },
  { code: "30", id: "SS_SEA_SURFACE", label: "Sea Surface", dimension: "Sea Surface" },
  { code: "35", id: "SS_SEA_SUBSURFACE", label: "Sea Subsurface", dimension: "Sea Subsurface" },
  { code: "36", id: "SS_MINE_WARFARE", label: "Mine Warfare", dimension: "Sea Subsurface" },
  { code: "40", id: "SS_ACTIVITY", label: "Activity", dimension: "Activities" },
  { code: "45", id: "SS_ATMOSPHERIC", label: "Atmospheric", dimension: "Meteorological" },
  { code: "46", id: "SS_OCEANIC", label: "Oceanographic", dimension: "Meteorological" },
  { code: "47", id: "SS_MET_SPACE", label: "Meteorological Space", dimension: "Meteorological" },
  { code: "50", id: "SS_SIGINT_SPACE", label: "Signals Intelligence - Space", dimension: "Space" },
  { code: "51", id: "SS_SIGINT_AIR", label: "Signals Intelligence - Air", dimension: "Air" },
  { code: "52", id: "SS_SIGINT_LAND", label: "Signals Intelligence - Land", dimension: "Land Equipment" },
  { code: "53", id: "SS_SIGINT_SURFACE", label: "Signals Intelligence - Surface", dimension: "Sea Surface" },
  { code: "54", id: "SS_SIGINT_SUBSURFACE", label: "Signals Intelligence - Subsurface", dimension: "Sea Subsurface" },
  { code: "60", id: "SS_CYBERSPACE", label: "Cyberspace", dimension: "Air" },
  { code: "98", id: "SS_INTERNAL", label: "Internal", dimension: "Internal" },
];
