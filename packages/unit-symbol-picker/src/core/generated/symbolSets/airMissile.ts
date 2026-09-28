/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: schemas/Air_Missile.xml
 * Standard: MIL-STD-2525D / APP-6D, JointMilSyML (http://disa.mil/JointMilSyML.xsd)
 * Regenerate: npm run generate   (from packages/unit-symbol-picker)
 */

import type { SymbolSetTable } from "../types";

export const AIR_MISSILE: SymbolSetTable = {
  code: "02",
  id: "SS_AIR_MISSILE",
  label: "Air Missile",
  icons: [
    { code: "000000", label: "Unspecified", path: ["Unspecified"], abstract: true },
    { code: "110000", label: "Missile", path: ["Missile"] },
  ],
  sectorOneModifiers: [
    { code: "00", label: "Unspecified" },
    { code: "01", label: "Air" },
    { code: "02", label: "Surface" },
    { code: "03", label: "Subsurface" },
    { code: "04", label: "Space" },
    { code: "05", label: "Anti-Ballistic" },
    { code: "06", label: "Ballistic" },
    { code: "07", label: "Cruise" },
    { code: "08", label: "Interceptor" },
  ],
  sectorTwoModifiers: [
    { code: "00", label: "Unspecified" },
    { code: "01", label: "Air" },
    { code: "02", label: "Surface" },
    { code: "03", label: "Subsurface" },
    { code: "04", label: "Space" },
    { code: "05", label: "Launched" },
    { code: "06", label: "Missile" },
    { code: "07", label: "Patriot" },
    { code: "08", label: "Standard Missile-2 (SM-2)" },
    { code: "09", label: "Standard Missile-6 (SM-6)" },
    { code: "10", label: "Evolved Sea Sparrow Missile (ESSM)" },
    { code: "11", label: "Rolling Airframe Missile (RAM)" },
    { code: "12", label: "Short Range" },
    { code: "13", label: "Medium Range" },
    { code: "14", label: "Intermediate Range" },
    { code: "15", label: "Long Range" },
    { code: "16", label: "Intercontinental" },
  ],
  specialEntitySubTypes: [],
};
