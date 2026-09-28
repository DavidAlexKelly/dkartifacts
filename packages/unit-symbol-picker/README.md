# @acc/unit-symbol-picker

A compact APP-6D / MIL-STD-2525D unit symbol picker. The symbol in the middle,
the SIDC above it, one dropdown per position below.

```tsx
import { UnitSymbolPicker } from "@acc/unit-symbol-picker/react";

<UnitSymbolPicker onChange={(sidc, code) => console.log(code)} />;
```

Three ways to say the same thing, all editable, all in sync — because they are
views of one `Sidc` value rather than three strings kept in step by hand:

- the twenty-digit modern code, typed or pasted, separators optional;
- the legacy fifteen-character code (`SFGPUCI-----D---`), for the data and the
  fingers that still carry it;
- a dropdown per position: context, identity, symbol set, status,
  HQ/task-force/dummy, echelon or mobility, main icon.

## The model is usable on its own

`@acc/unit-symbol-picker` (no React, no milsymbol) is the SIDC as data:

```ts
import { parseSidc, withField, formatSidc } from "@acc/unit-symbol-picker";

const hostile = withField(parseSidc("10-0-3-10-0-0-00-121100-00-00"), "identity", "6");
formatSidc(hostile); // 10061000000121100000 …
```

`withField` is the whole point: it changes one field and leaves every other
digit alone. Splicing the string in a component is how a picker ends up quietly
rewriting the echelon when the user picks an affiliation, and there is a test
that says so.

## The published tables

`@acc/unit-symbol-picker/tables` is the symbology standard as data: every icon,
every modifier, and the 2525C mapping. It is **generated** from the JointMilSyML
XML in [`schemas/`](schemas/README.md), which ships in the tarball so the tables
can be checked against their source rather than trusted.

```tsx
import { lookupLegacy, LAND_UNIT } from "@acc/unit-symbol-picker/tables";

<UnitSymbolPicker icons={{ "10": LAND_UNIT.icons }} legacyLookup={lookupLegacy} />;
```

| | |
|---|---|
| Symbol sets | 24 |
| Icons | 2,083, as a three-level hierarchy with the path on each row |
| Modifiers | 628 across both sectors |
| 2525C codes mapped | 1,936 (78 more are retired and have no modern entity) |

**A separate entry point on purpose.** The main entry is a SIDC parser; these
tables are ~520 kB of source. An app that only parses and formats codes should
not carry them, so importing them is opting in. The barrel pulls in all 24 sets:
when one is enough, import it directly and the bundler drops the rest.

```ts
import { LAND_UNIT } from "@acc/unit-symbol-picker/tables/landUnit"; // 32 kB, not 1.3 MB
```

### The main icon is a cascade, not a list

The entity block is a tree — entity, entity type, entity subtype, two digits
each — so the picker renders one control per level rather than one list of two
thousand leaves. `Movement and Maneuver → Infantry → Armored/Mechanized/Tracked`
is three short dropdowns that narrow each other, and each is the same
`withField(sidc, "entity", …)` call.

Options carrying a `path` get the cascade; a flat list gets a single control, so
a short curated list still behaves the way it reads. A consumer who only kept
the joined display labels (`"Civilian : Merchant Ship : Ferry"`) gets the
cascade too — `iconPath` falls back to splitting on `" : "`.

Categories that draw nothing of their own are marked with an ellipsis and kept
in the list, because dropping them would take their branch with them: `120000`
Movement and Maneuver has no icon and is the only way to reach Infantry.
`iconLevels` in `core/` is the whole of this logic, has no React in it, and is
tested against the published table — including the invariant that every
published row is reachable.

### Generated, not read at runtime

The XML ships, but the code imports TypeScript derived from it, because a
published library cannot dictate how a consumer's bundler loads a non-JS file:
`?raw` is a Vite-ism, `readFileSync` is Node-only, `fetch` needs a URL the
library cannot know and a network call this estate's CSP would refuse, and
`DOMParser` would make the framework-free core browser-only. A generated module
is imported by every bundler with no configuration, and is parsed once at build
rather than on every page load.

```bash
npm run generate          # after editing schemas/
npm run generate -- --check   # fail if the two have drifted
```

The output is committed, so updating the standard produces a reviewable diff.
`tables.test.ts` runs `--check`, which is what stops the two silently parting
company.

## What the tables do not settle

**Which meaning digits 9–10 carry.** The standard splits them — digit 9 picks
the group (echelon, equipment mobility, naval towed array), digit 10 the value —
and the data has a field saying which group applies to which symbol set. In this
release that field is sparse to the point of being misleading: both echelon
groups claim `SS_AIR` and nothing else, the mobility groups claim nothing.
`AMPLIFIER_GROUPS` carries it through as evidence; `ECHELON_SYMBOL_SETS` in
`core/fields.ts` remains a hand-made decision, which is at least visibly one.

**Symbol set 27.** Dismounted Individual is in the standard and absent from this
data. The picker still offers it; the test names it, so if the data is ever
updated the discrepancy surfaces instead of being inherited.

**Eight legacy keys collide** — one in air missiles, seven in weather and
oceanography — where two published rows claim the same scheme, dimension and
function code. The generator keeps the first, deterministically, and prints
every one of them.

## Rendering

milsymbol is a peer dependency, asked for the icon directly. If it cannot draw a
code — a half-typed entity, an implausible combination — the frame stays and the
space says so: a blank box reads as a broken component, and an error message
reads as a wrong code.

The SVG goes through an `<img>` data URL rather than `dangerouslySetInnerHTML`,
which this estate's CI blocks outright.

## A note on hand-written lists

`COMMON_LAND_ICONS` exists so the component is useful before anyone passes
`icons`. Its first version was typed from memory, and generating the real table
found three of its six labels attached to the wrong code: `121000` is Combined
Arms, not "Movement and manoeuvre"; `121300` is Reconnaissance/Cavalry/Scout,
not "Armour"; `160600` is Combat Service Support, not "Engineer". Armour is
`120500` and engineers are `140700`.

Nothing about the wrong ones looked wrong. That is the entire argument for
generating the table, and the starter list is now checked against it by a test
rather than trusted.
