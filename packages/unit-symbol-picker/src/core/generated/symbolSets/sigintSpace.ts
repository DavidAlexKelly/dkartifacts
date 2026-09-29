/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: schemas/SIGINT_Space.xml
 * Standard: MIL-STD-2525D / APP-6D, JointMilSyML (http://disa.mil/JointMilSyML.xsd)
 * Regenerate: npm run generate   (from packages/unit-symbol-picker)
 */

import type { SymbolSetTable } from "../types.js";

export const SIGINT_SPACE: SymbolSetTable = {
  code: "50",
  id: "SS_SIGINT_SPACE",
  label: "Signals Intelligence - Space",
  icons: [
    { code: "000000", label: "Unspecified", path: ["Unspecified"], abstract: true },
    { code: "110000", label: "Signal Intercept", path: ["Signal Intercept"], abstract: true },
    { code: "110100", label: "Communications", path: ["Signal Intercept", "Communications"] },
    { code: "110200", label: "Jammer", path: ["Signal Intercept", "Jammer"] },
    { code: "110300", label: "Radar", path: ["Signal Intercept", "Radar"] },
  ],
  sectorOneModifiers: [
    { code: "00", label: "Unspecified" },
    { code: "14", label: "Data Transmission" },
    { code: "15", label: "Earth Surveillance" },
    { code: "21", label: "Identification Friend or Foe (Interrogator)" },
    { code: "24", label: "Identification Friend or Foe (Transponder)" },
    { code: "25", label: "Barrage Jammer" },
    { code: "26", label: "Click Jammer" },
    { code: "27", label: "Deceptive Jammer" },
    { code: "28", label: "Frequency Swept Jammer" },
    { code: "29", label: "Jammer (General)" },
    { code: "30", label: "Noise Jammer" },
    { code: "31", label: "Pulsed Jammer" },
    { code: "32", label: "Repeater Jammer" },
    { code: "33", label: "Spot Noise Jammer" },
    { code: "34", label: "Transponder Jammer" },
    { code: "36", label: "Missile Control" },
    { code: "39", label: "Multi-Function" },
    { code: "42", label: "Missile Tracking" },
    { code: "43", label: "Navigational/General" },
    { code: "44", label: "Navigational/Distance Measuring Equipment" },
    { code: "45", label: "Navigation/Terrain Following" },
    { code: "49", label: "Point-to-Point Line of Sight (LOS)" },
    { code: "50", label: "Instrumentation" },
    { code: "51", label: "Range Only" },
    { code: "53", label: "Satellite Downlink" },
    { code: "54", label: "Space" },
    { code: "55", label: "Surface Search" },
    { code: "58", label: "Target Acquisition" },
    { code: "61", label: "Target Tracking" },
    { code: "62", label: "Unknown" },
    { code: "63", label: "Video Remoting" },
    { code: "64", label: "Experimental" },
  ],
  sectorTwoModifiers: [],
  specialEntitySubTypes: [],
};
