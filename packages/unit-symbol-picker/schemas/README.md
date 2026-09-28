# JointMilSyML — the symbology data this package is built from

The machine-readable form of the symbology standard, unmodified. Everything in
`../src/core/generated/` is derived from these files by
`../scripts/generate-tables.mjs`; nothing here is ever hand-edited.

```
base.xsd  core.xsd  symbolSet.xsd     the schema
Base.xml                              the Library: the fields every symbol has
<Symbol_Set>.xml            × 24      one per symbol set: the icons it can draw
```

## What the files say about themselves

- Namespace `http://disa.mil/JointMilSyML.xsd` (JMSML — Joint Military
  Symbology Markup Language).
- `Base.xml` declares one version: `Name="Base"`,
  `Description="No changes to APP-6(C)/2525D"`, `VersionCode` **10** — which is
  digits 1–2 of every SIDC this package produces.
- Each symbol set declares its own `LegacyCodingSchemeCode` and carries a
  `LegacySymbols` block mapping 2525C function codes onto modern entities.

> **Provenance to confirm.** These files were added to the repository without a
> recorded download URL or retrieval date. They are self-describing enough to
> generate from, but if this package is published externally, the exact release
> they came from should be written down here first — a symbology table whose
> edition nobody can name is a table nobody can audit.

## Shape

`Base.xml` is a `<Library>` holding the fields common to every symbol:

| Element | SIDC digits |
|---|---|
| `Versions` | 1–2 |
| `Contexts` | 3 |
| `StandardIdentities`, `StandardIdentityGroups`, `Affiliations` | 4 |
| `Dimensions` → `SymbolSets` | 5–6 |
| `Statuses` | 7 |
| `HQTFDummies` | 8 |
| `AmplifierGroups` → `Amplifiers` | 9–10 |

Digits 9–10 are two fields, not one: digit 9 selects the group (echelon at
brigade and below, echelon at division and above, equipment mobility on land /
snow / water, naval towed array) and digit 10 the value within it. So a platoon
is `14` — group 1, value 4.

Each `<SymbolSet>` file holds the rest:

| Element | SIDC digits |
|---|---|
| `Entities` → `Entity` → `EntityTypes` → `EntitySubTypes` | 11–16, two digits per level |
| `SectorOneModifiers` | 17–18 |
| `SectorTwoModifiers` | 19–20 |
| `LegacySymbols` | — the 2525C ⇄ 2525D mapping |

`SpecialEntitySubTypes` (only in `Land_Unit.xml`) are subtypes that apply to any
entity — the source writes them `10xxxx95` — so their code is the last two
digits alone and they are not standalone icons.

## Two inconsistencies the generator has to absorb

Worth knowing before reading either the XML or the generator:

1. **Codes are spelled two ways.** `SingleDigitType` is element text
   (`<ContextCode>0</ContextCode>`); `DoubleDigitType` is a pair of child
   elements (`<DigitOne>1</DigitOne><DigitTwo>0</DigitTwo>`).
2. **Identifiers are spelled two ways.** `Context`, `StandardIdentity`,
   `Entity`, `Modifier` and `SymbolSet` use `@ID`; `Status`, `HQTFDummy`,
   `Amplifier` and `AmplifierGroup` use `@Name`.

## And one the generator refuses to absorb

`AmplifierGroup/@CompatibleSymbolSetIDs` is meant to say which symbol sets a
group of digits 9–10 applies to. In these files it is sparse to the point of
being misleading: both echelon groups claim `SS_AIR` and nothing else, and the
three mobility groups claim nothing at all. It is passed through to the
generated tables as evidence, but it is **not** used to decide whether digits
9–10 mean echelon or mobility for a given symbol set — that decision stays the
hand-curated `ECHELON_SYMBOL_SETS` in `../src/core/fields.ts`, where it is at
least visibly a judgement.

Likewise, the legacy dimension letter cannot be resolved to a symbol set from
`Base.xml`'s `Dimensions` alone: dimension `G` maps to land units, land
equipment or land installations depending on `@FirstFunctionLetter`. The
generator therefore keys the legacy table off each `LegacySymbol`'s own row
rather than deriving it.
