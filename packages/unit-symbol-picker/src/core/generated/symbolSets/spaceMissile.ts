/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: schemas/Space_Missile.xml
 * Standard: MIL-STD-2525D / APP-6D, JointMilSyML (http://disa.mil/JointMilSyML.xsd)
 * Regenerate: npm run generate   (from packages/unit-symbol-picker)
 */

import type { SymbolSetTable } from "../types.js";

export const SPACE_MISSILE: SymbolSetTable = {
  code: "06",
  id: "SS_SPACE_MISSILE",
  label: "Space Missile",
  icons: [
    { code: "000000", label: "Unspecified", path: ["Unspecified"], abstract: true },
    { code: "110000", label: "Missile", path: ["Missile"] },
  ],
  sectorOneModifiers: [
    { code: "00", label: "Unspecified" },
    { code: "01", label: "Ballistic" },
    { code: "02", label: "Space" },
    { code: "03", label: "Interceptor" },
  ],
  sectorTwoModifiers: [
    { code: "00", label: "Unspecified" },
    { code: "01", label: "Short Range" },
    { code: "02", label: "Medium Range" },
    { code: "03", label: "Intermediate Range" },
    { code: "04", label: "Long Range" },
    { code: "05", label: "Intercontinental" },
    { code: "06", label: "Arrow" },
    { code: "07", label: "Ground-Based Interceptor (GBI)" },
    { code: "08", label: "Patriot" },
    { code: "09", label: "Standard Missile - Terminal Phase (SM-T)" },
    { code: "10", label: "Standard Missile - 3 (SM-3)" },
    { code: "11", label: "Terminal High-Altitude Area Defense (THAAD)" },
    { code: "12", label: "Space" },
  ],
  specialEntitySubTypes: [],
};
