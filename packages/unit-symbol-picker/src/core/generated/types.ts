/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: schemas/*.xml
 * Standard: MIL-STD-2525D / APP-6D, JointMilSyML (http://disa.mil/JointMilSyML.xsd)
 * Regenerate: npm run generate   (from packages/unit-symbol-picker)
 */

/**
 * The shapes the generated tables come in.
 *
 * `CodeOption` is deliberately assignable to `SidcOption` from ../fields —
 * same two required fields — so a generated list can be handed straight to the
 * picker's dropdowns without a mapping step.
 */

/** One value of one SIDC field. */
export interface CodeOption {
  code: string;
  label: string;
  /** Code 9 in most fields: "details specified by extension". */
  isExtension?: boolean;
}

/**
 * Digits 9-10, which the standard splits: digit 9 selects the group (echelon at
 * brigade and below, echelon at division and above, equipment mobility on
 * land, naval towed array, …) and digit 10 the value within it.
 */
export interface AmplifierGroupTable extends CodeOption {
  /**
   * The symbol sets the published data states this group applies to.
   *
   * READ THE GENERATOR'S NOTE BEFORE TRUSTING THIS. In the shipped Base.xml it
   * is sparse to the point of being wrong — both echelon groups claim only
   * SS_AIR and the mobility groups claim nothing — so it is passed through as
   * evidence, not used to decide which meaning digits 9-10 carry.
   */
  compatibleSymbolSetIds: string[];
  /** Values within the group. Their `code` is the full two digits. */
  amplifiers: CodeOption[];
}

/** Digits 11-16: the icon itself, as a three-level hierarchy. */
export interface IconOption extends CodeOption {
  /** Entity, entity type, entity subtype labels — outermost first. */
  path: string[];
  /**
   * The row exists to give the hierarchy a parent and draws nothing of its own
   * (Icon="NA" in the source, usually with Remarks="Reserved for hierarchical
   * purposes"). Still a legal code; just not a symbol anyone means to pick.
   */
  abstract?: boolean;
}

export interface SymbolSetTable {
  /** Digits 5-6. */
  code: string;
  /** The JointMilSyML ID, e.g. "SS_LAND_UNIT" — what `compatibleSymbolSetIds` refers to. */
  id: string;
  label: string;
  /** Digits 11-16, flattened; `path` carries the hierarchy. */
  icons: IconOption[];
  /** Digits 17-18. */
  sectorOneModifiers: CodeOption[];
  /** Digits 19-20. */
  sectorTwoModifiers: CodeOption[];
  /**
   * Subtypes the set applies to ANY entity/type — the source writes them
   * "10xxxx95". Their `code` is the last two digits only, so they are not
   * standalone icons and are kept out of `icons` rather than emitted as codes
   * that look complete and are not.
   */
  specialEntitySubTypes: CodeOption[];
}

/** What a legacy 2525C function code resolves to in the modern form. */
export interface LegacyEntry {
  /** Digits 5-6. */
  symbolSet: string;
  /** Digits 11-16. */
  entity: string;
  /** Digits 17-18, when the legacy symbol names a sector-one modifier. */
  modifier1?: string;
  /** Digits 19-20. */
  modifier2?: string;
  /** The legacy pattern this came from, e.g. "S*GPUUSR--*****". Kept for traceability. */
  legacy: string;
}
