// @acc/unit-symbol-picker — the SIDC model, with no React and no milsymbol in
// it. Import "@acc/unit-symbol-picker/react" for the component.
//
// The split is deliberate: parsing a SIDC, changing one field of it and
// formatting it back are useful in a transform, a validator or a test, none of
// which want a rendering library on the dependency list.
//
// The published symbology tables — every icon, modifier and 2525C mapping —
// are at "@acc/unit-symbol-picker/tables", and deliberately not re-exported
// here: they are ~2000 rows, and this entry point stays something a validator
// can import without paying for them.
export * from "./core/sidc";
export * from "./core/fields";
export * from "./core/iconLevels";
