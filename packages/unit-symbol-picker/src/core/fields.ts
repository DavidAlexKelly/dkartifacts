/**
 * The code lists behind the dropdowns — one per SIDC position.
 *
 * These are the closed, short, stable parts of the standard: context, standard
 * identity, status, headquarters/task force/dummy, echelon, and the symbol sets
 * a unit picker plausibly needs. They are written out because they are small
 * enough to be right and unlikely to change.
 *
 * The main icon is NOT here, and that is deliberate. The entity block is a
 * published table of several thousand rows that differs per symbol set; typing
 * a subset of it from memory would produce a dropdown that looks authoritative
 * and is wrong in the parts nobody checks. The picker instead takes an optional
 * `icons` prop — supply the table you trust — and falls back to a plain
 * six-digit field, which is always honest and always usable.
 *
 * The tables now exist, generated from the published symbology data in
 * ../../schemas: import them from "@acc/unit-symbol-picker/tables". They are a
 * separate entry point rather than folded in here so that an app which only
 * parses and formats codes does not pay for 2000 icon rows it never renders.
 */

export interface SidcOption {
  code: string;
  label: string;
}

export const CONTEXTS: SidcOption[] = [
  { code: "0", label: "Reality" },
  { code: "1", label: "Exercise" },
  { code: "2", label: "Simulation" },
];

export const IDENTITIES: SidcOption[] = [
  { code: "0", label: "Pending" },
  { code: "1", label: "Unknown" },
  { code: "2", label: "Assumed friend" },
  { code: "3", label: "Friend" },
  { code: "4", label: "Neutral" },
  { code: "5", label: "Suspect / joker" },
  { code: "6", label: "Hostile / faker" },
];

export const STATUSES: SidcOption[] = [
  { code: "0", label: "Present" },
  { code: "1", label: "Planned / anticipated" },
  { code: "2", label: "Present, fully capable" },
  { code: "3", label: "Present, damaged" },
  { code: "4", label: "Present, destroyed" },
  { code: "5", label: "Present, full to capacity" },
];

export const HQ_TF_DUMMY: SidcOption[] = [
  { code: "0", label: "Not applicable" },
  { code: "1", label: "Feint / dummy" },
  { code: "2", label: "Headquarters" },
  { code: "3", label: "Feint / dummy headquarters" },
  { code: "4", label: "Task force" },
  { code: "5", label: "Feint / dummy task force" },
  { code: "6", label: "Task force headquarters" },
  { code: "7", label: "Feint / dummy task force headquarters" },
];

/**
 * Echelon, for the land symbol sets. Positions 9-10 carry mobility instead for
 * equipment and a towed-array indicator at sea, which is why this list is
 * offered per symbol set rather than globally.
 */
export const ECHELONS: SidcOption[] = [
  { code: "00", label: "Unspecified" },
  { code: "11", label: "Team / crew" },
  { code: "12", label: "Squad" },
  { code: "13", label: "Section" },
  { code: "14", label: "Platoon / detachment" },
  { code: "15", label: "Company / battery / troop" },
  { code: "16", label: "Battalion / squadron" },
  { code: "17", label: "Regiment / group" },
  { code: "18", label: "Brigade" },
  { code: "21", label: "Division" },
  { code: "22", label: "Corps / MEF" },
  { code: "23", label: "Army" },
  { code: "24", label: "Army group / front" },
  { code: "25", label: "Region / theater" },
  { code: "26", label: "Command" },
];

export const SYMBOL_SETS: SidcOption[] = [
  { code: "01", label: "Air" },
  { code: "02", label: "Air missile" },
  { code: "05", label: "Space" },
  { code: "06", label: "Space missile" },
  { code: "10", label: "Land unit" },
  { code: "11", label: "Land civilian unit / organisation" },
  { code: "15", label: "Land equipment" },
  { code: "20", label: "Land installation" },
  { code: "25", label: "Control measure" },
  { code: "27", label: "Dismounted individual" },
  { code: "30", label: "Sea surface" },
  { code: "35", label: "Sea subsurface" },
  { code: "36", label: "Mine warfare" },
  { code: "40", label: "Activity / event" },
];

/**
 * Which symbol sets carry an echelon in positions 9-10, as against mobility.
 *
 * Still hand-curated, and deliberately so. The published data has a field for
 * exactly this — `AmplifierGroup/@CompatibleSymbolSetIDs` — but in the shipped
 * Base.xml it is sparse to the point of being wrong: both echelon groups claim
 * `SS_AIR` and nothing else, and the three mobility groups claim nothing at
 * all. Generating this set from it would replace a visible judgement with an
 * invisible error. The generated `AMPLIFIER_GROUPS` carry the attribute
 * through as evidence; this line remains the decision.
 */
export const ECHELON_SYMBOL_SETS = new Set(["10", "11", "27"]);

/** Mobility, for the equipment sets — the other meaning of positions 9-10. */
export const MOBILITIES: SidcOption[] = [
  { code: "00", label: "Unspecified" },
  { code: "31", label: "Wheeled, limited cross-country" },
  { code: "32", label: "Wheeled, cross-country" },
  { code: "33", label: "Tracked" },
  { code: "34", label: "Wheeled and tracked" },
  { code: "35", label: "Towed" },
  { code: "36", label: "Rail" },
  { code: "37", label: "Pack animals" },
  { code: "41", label: "Over-snow" },
  { code: "42", label: "Sled" },
  { code: "51", label: "Barge" },
  { code: "52", label: "Amphibious" },
];

/**
 * A handful of land-unit icons, as a starting point and nothing more.
 *
 * Eight entries against a standard with thousands, chosen because they are the
 * ones a unit picker reaches for first. Every code and label here is now copied
 * from the generated table rather than typed from memory — import
 * `LAND_UNIT` from "@acc/unit-symbol-picker/tables" for all 202 of them, or
 * pass your own `icons` to the picker.
 *
 * The first version of this list was typed from memory, and generating the real
 * table found half of it wrong: `121000` is Combined Arms, not "Movement and
 * manoeuvre"; `121300` is Reconnaissance/Cavalry/Scout, not "Armour"; `160600`
 * is Combat Service Support, not "Engineer". Armour is `120500` and engineers
 * are `140700`. Nothing about the codes was implausible, which is exactly why a
 * short hand-written list is dangerous and why the picker asks for a table
 * instead of pretending to have one.
 */
export const COMMON_LAND_ICONS: SidcOption[] = [
  { code: "121100", label: "Infantry" },
  { code: "121102", label: "Infantry, armoured/mechanised" },
  { code: "120500", label: "Armour" },
  { code: "121300", label: "Reconnaissance / cavalry / scout" },
  { code: "121000", label: "Combined arms" },
  { code: "130100", label: "Air defence" },
  { code: "130300", label: "Field artillery" },
  { code: "140700", label: "Engineer" },
];
