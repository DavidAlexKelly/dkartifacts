/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: schemas/Space.xml
 * Standard: MIL-STD-2525D / APP-6D, JointMilSyML (http://disa.mil/JointMilSyML.xsd)
 * Regenerate: npm run generate   (from packages/unit-symbol-picker)
 */

import type { SymbolSetTable } from "../types";

export const SPACE: SymbolSetTable = {
  code: "05",
  id: "SS_SPACE",
  label: "Space",
  icons: [
    { code: "000000", label: "Unspecified", path: ["Unspecified"], abstract: true },
    { code: "110000", label: "Military", path: ["Military"] },
    { code: "110100", label: "Space Vehicle", path: ["Military", "Space Vehicle"] },
    { code: "110200", label: "Re-Entry Vehicle", path: ["Military", "Re-Entry Vehicle"] },
    { code: "110300", label: "Planet Lander", path: ["Military", "Planet Lander"] },
    { code: "110400", label: "Orbiter Shuttle", path: ["Military", "Orbiter Shuttle"] },
    { code: "110500", label: "Capsule", path: ["Military", "Capsule"] },
    { code: "110600", label: "Satellite, General", path: ["Military", "Satellite, General"] },
    { code: "110700", label: "Satellite", path: ["Military", "Satellite"] },
    { code: "110800", label: "Antisatellite Weapon", path: ["Military", "Antisatellite Weapon"] },
    { code: "110900", label: "Astronomical Satellite", path: ["Military", "Astronomical Satellite"] },
    { code: "111000", label: "Biosatellite", path: ["Military", "Biosatellite"] },
    { code: "111100", label: "Communications Satellite", path: ["Military", "Communications Satellite"] },
    { code: "111200", label: "Earth Observation Satellite", path: ["Military", "Earth Observation Satellite"] },
    { code: "111300", label: "Miniaturized Satellite", path: ["Military", "Miniaturized Satellite"] },
    { code: "111400", label: "Navigational Satellite", path: ["Military", "Navigational Satellite"] },
    { code: "111500", label: "Reconnaissance Satellite", path: ["Military", "Reconnaissance Satellite"] },
    { code: "111600", label: "Space Station", path: ["Military", "Space Station"] },
    { code: "111700", label: "Tethered Satellite", path: ["Military", "Tethered Satellite"] },
    { code: "111800", label: "Weather Satellite", path: ["Military", "Weather Satellite"] },
    { code: "111900", label: "Space Launched Vehicle (SLV)", path: ["Military", "Space Launched Vehicle (SLV)"] },
    { code: "120000", label: "Civilian", path: ["Civilian"] },
    { code: "120100", label: "Orbiter Shuttle", path: ["Civilian", "Orbiter Shuttle"] },
    { code: "120200", label: "Capsule", path: ["Civilian", "Capsule"] },
    { code: "120300", label: "Satellite", path: ["Civilian", "Satellite"] },
    { code: "120400", label: "Astronomical Satellite", path: ["Civilian", "Astronomical Satellite"] },
    { code: "120500", label: "Biosatellite", path: ["Civilian", "Biosatellite"] },
    { code: "120600", label: "Communications Satellite", path: ["Civilian", "Communications Satellite"] },
    { code: "120700", label: "Earth Observation Satellite", path: ["Civilian", "Earth Observation Satellite"] },
    { code: "120800", label: "Miniaturized Satellite", path: ["Civilian", "Miniaturized Satellite"] },
    { code: "120900", label: "Navigational Satellite", path: ["Civilian", "Navigational Satellite"] },
    { code: "121000", label: "Space Station", path: ["Civilian", "Space Station"] },
    { code: "121100", label: "Tethered Satellite", path: ["Civilian", "Tethered Satellite"] },
    { code: "121200", label: "Weather Satellite", path: ["Civilian", "Weather Satellite"] },
    { code: "130000", label: "Manual Track", path: ["Manual Track"] },
  ],
  sectorOneModifiers: [
    { code: "00", label: "Unspecified" },
    { code: "01", label: "Low Earth Orbit (LEO)" },
    { code: "02", label: "Medium Earth Orbit (MEO)" },
    { code: "03", label: "High Earth Orbit (HEO)" },
    { code: "04", label: "Geosynchronous Orbit (GSO)" },
    { code: "05", label: "Geostationary Orbit (GO)" },
    { code: "06", label: "Molniya Orbit (MO)" },
  ],
  sectorTwoModifiers: [
    { code: "00", label: "Unspecified" },
    { code: "01", label: "Optical" },
    { code: "02", label: "Infrared" },
    { code: "03", label: "Radar" },
    { code: "04", label: "Signals Intelligence (SIGINT)" },
  ],
  specialEntitySubTypes: [],
};
