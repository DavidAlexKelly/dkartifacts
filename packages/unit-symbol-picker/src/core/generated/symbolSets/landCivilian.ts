/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: schemas/Land_Civilian.xml
 * Standard: MIL-STD-2525D / APP-6D, JointMilSyML (http://disa.mil/JointMilSyML.xsd)
 * Regenerate: npm run generate   (from packages/unit-symbol-picker)
 */

import type { SymbolSetTable } from "../types";

export const LAND_CIVILIAN: SymbolSetTable = {
  code: "11",
  id: "SS_LAND_CIVILIAN",
  label: "Land Civilian",
  icons: [
    { code: "000000", label: "Unspecified", path: ["Unspecified"], abstract: true },
    { code: "110000", label: "Civilian", path: ["Civilian"] },
    { code: "110100", label: "Environmental Protection", path: ["Civilian", "Environmental Protection"] },
    { code: "110200", label: "Government Organization", path: ["Civilian", "Government Organization"] },
    { code: "110300", label: "Individual", path: ["Civilian", "Individual"] },
    { code: "110400", label: "Organization or Group", path: ["Civilian", "Organization or Group"] },
    { code: "110500", label: "Killing Victim", path: ["Civilian", "Killing Victim"] },
    { code: "110600", label: "Killing Victims", path: ["Civilian", "Killing Victims"] },
    { code: "110700", label: "Victim of an Attempted Crime", path: ["Civilian", "Victim of an Attempted Crime"] },
    { code: "110800", label: "Spy", path: ["Civilian", "Spy"] },
    { code: "110900", label: "Composite Loss", path: ["Civilian", "Composite Loss"] },
    { code: "111000", label: "Emergency Medical Operation", path: ["Civilian", "Emergency Medical Operation"] },
  ],
  sectorOneModifiers: [
    { code: "00", label: "Unspecified" },
    { code: "01", label: "Assassination" },
    { code: "02", label: "Execution (Wrongful Killing)" },
    { code: "03", label: "Murder Victims" },
    { code: "04", label: "Hijacking" },
    { code: "05", label: "Kidnapping" },
    { code: "06", label: "Piracy" },
    { code: "07", label: "Rape" },
    { code: "08", label: "Civilian" },
    { code: "09", label: "Displaced Person(s), Refugee(s) and Evacuee(s)" },
    { code: "10", label: "Foreign Fighter(s)" },
    { code: "11", label: "Gang Member or Gang" },
    { code: "12", label: "Government Organization" },
    { code: "13", label: "Leader or Leadership" },
    { code: "14", label: "Nongovernmental Organization Member or Nongovernmental Organization" },
    { code: "15", label: "Coerced/Impressed Recruit" },
    { code: "16", label: "Willing Recruit" },
    { code: "17", label: "Religious or Religious Organization" },
    { code: "18", label: "Targeted Individual or Organization" },
    { code: "19", label: "Terrorist or Terrorist Organization" },
    { code: "20", label: "Speaker" },
    { code: "21", label: "Accident" },
    { code: "22", label: "Combat" },
    { code: "23", label: "Other" },
    { code: "24", label: "Loot" },
  ],
  sectorTwoModifiers: [
    { code: "00", label: "Unspecified" },
    { code: "01", label: "Leader or Leadership" },
  ],
  specialEntitySubTypes: [],
};
