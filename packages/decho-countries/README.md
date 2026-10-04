# @acc/decho-countries

Country outlines and facts, served **from Foundry** like the rest of the decho
stack: borders under several points of view, regions under several schemes,
population, area and GDP, a "which country is this point in" lookup, and a
clickable country layer for `@acc/decho-basemap`.

It ships a low-detail world (Natural Earth 1:110m) inside the package, so it
works before you have a dataset — and with one, nothing is fetched from the
public internet.

## Quick start

```tsx
import { DechoBasemap } from "@acc/decho-basemap/react";
import { countries } from "@acc/decho-countries/extension";
import { CountryCard } from "@acc/decho-countries/react";

const [selection, setSelection] = useState(null);

<DechoBasemap
  extensions={[
    countries({
      store: { kind: "dataset", datasetRid: "ri.foundry.main.dataset.…" }, // omit for the built-in world
      onSelect: setSelection,
    }),
  ]}
/>;
<CountryCard selection={selection} />;
```

Like `decho-elevation`, it is a `BasemapExtension`: the basemap does not know
it exists, and it composes with other extensions in the same array.

### Without a map

```ts
import { loadCountries } from "@acc/decho-countries";

const data = await loadCountries({ kind: "dataset", datasetRid });
const index = await data.index();               // outlines of the default view
index.countryAt(2.35, 48.85);                   // "FRA"
data.country("FRA")?.figures.population;        // { value, year, source }
data.regions("un-subregion");                   // regions with summed figures
```

`countryAt` is cheap — bounding boxes first, the exact test only for the few
countries a point could be in — so tagging thousands of events by country is
fine.

## Where the data comes from

| Store | What it is |
|---|---|
| `{ kind: "builtin" }` (default) | Natural Earth 1:110m inside the package: one view, five region schemes, Natural Earth's figures (2019 estimates), areas from the 1:50m outlines. About 106 KB gzipped, loaded on first use. |
| `{ kind: "dataset", datasetRid }` | A Foundry dataset built by `scripts/build-data.mjs`. Read through `@acc/decho-foundry-bytes`, so `configureFoundryBytes` (`configureBasemap`) must have run, and the dataset must be a **Resource** on the app in Developer Console. |
| `{ kind: "files", files }` | Files you already hold, by path. For tests, or data fetched some other way. |

### Building a dataset

On a machine with internet access:

```sh
cd packages/decho-countries
npm install                       # polygon-clipping, used to merge outlines
node scripts/build-data.mjs --out ./countries-data --world-bank
```

Then upload everything in `./countries-data` to a Foundry dataset, **keeping
the folder structure**, and pass its RID as `datasetRid`.

| Option | |
|---|---|
| `--scales 50m,10m` | Natural Earth scales, least detailed first. Default: 1:50m from zoom 0, 1:10m from zoom 5. |
| `--views all` | `all`: the de facto view and every point of view that draws differently. `default`: one view. Or a list: `US,IN,CN`. |
| `--world-bank` | Use the World Bank's latest population, land and total area, GDP and GDP per person, and its income groups, instead of Natural Earth's 2019 estimates. Lists any sovereign country it could not match. |
| `--cache <dir>` | Keep and reuse downloads (default `.ne-cache`). |

With the defaults that is 32 views (15 distinct sets of outlines — views that
draw identically share files), about 170 MB in all: 1.6 MB per view at 1:50m,
10 MB at 1:10m. The map only ever reads the view and detail on screen.

`npm run build-builtin` regenerates the built-in world the same way.

### Building it in Foundry instead

`foundry/countries_transform.py` builds the same dataset as a Foundry Python
transform, from the files as downloaded — no internet access needed in
Foundry, and no Node:

1. Upload the raw files to one dataset: the Natural Earth 1:10m
   `ne_10m_admin_0_countries.*` and `ne_10m_populated_places.*` shapefiles
   (`.shp`, `.shx`, `.dbf`, `.cpg`; the `VERSION.txt` is used if present), and
   the World Bank CSV exports `API_SP.POP.TOTL_*.csv`,
   `API_AG.LND.TOTL.K2_*.csv`, `API_AG.SRF.TOTL.K2_*.csv`,
   `API_NY.GDP.MKTP.CD_*.csv`, `API_NY.GDP.PCAP.CD_*.csv` and one
   `Metadata_Country_*.csv`. Names are matched loosely, so the version
   numbers in them do not matter; the `Metadata_Indicator_*` and README files
   are ignored.
2. Copy the file into a Python transforms repository, set the three paths in
   its `@transform` decorator, and add `shapely` and `pyshp` to the run
   requirements (`pyshp` is pure Python — no GDAL).
3. Build. Two outputs:

| Output | |
|---|---|
| `countries_map` | Files, exactly what this package reads: `manifest.json`, `countries.json`, `views/<view>/low.geojson` (simplified, from zoom 0) and `high.geojson` (full 1:10m, from zoom 4). Its RID is the `datasetRid`. About 200 MB. |
| `countries` | A table, one row per country: codes, names, the five region schemes, capital, label point, Wikidata id, every figure with its year and source, and the outline as a GeoJSON string. For Contour, the Ontology or joins. |

The same file runs locally — `python countries_transform.py <raw folder>
<out folder>` — and builds a dataset identical, record for record, to
`build-data.mjs` given the same Natural Earth data.

### Data sources

| Source | Gives | Licence |
|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com/) — [admin 0 countries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/), [populated places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/), files read from [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector/tree/master/geojson) | Outlines at 1:110m/50m/10m, points of view, region fields, names in 26 languages, capitals, Wikidata ids | Public domain |
| [World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation) — [population](https://data.worldbank.org/indicator/SP.POP.TOTL), [land area](https://data.worldbank.org/indicator/AG.LND.TOTL.K2), [surface area](https://data.worldbank.org/indicator/AG.SRF.TOTL.K2), [GDP](https://data.worldbank.org/indicator/NY.GDP.MKTP.CD), [GDP per person](https://data.worldbank.org/indicator/NY.GDP.PCAP.CD), [country list](https://api.worldbank.org/v2/country?format=json) | Figures, income groups, capitals where Natural Earth has none | CC BY 4.0 — credit it where shown; `CountryCard` does |

## Border views

Where territory is disputed, a view decides whose claim the map follows. The
build script makes one per Natural Earth point of view that differs from the
de facto lines — e.g. under `in`, Western Sahara is part of Morocco and
Kosovo of Serbia; under `cn`, Taiwan is part of China; under `us`, Somaliland
is part of Somalia. Which views exist is the dataset's business; the package
lists whatever the manifest does:

```ts
countries({ view: "in", onReady: (controller) => {
  controller.data.manifest.views;   // [{ id, label, description, files }]
  void controller.setView("cn");    // swaps the outlines, no map rebuild
}});
```

**One limit worth knowing.** A view here moves whole Natural Earth units from
one country to another and merges their outlines. Natural Earth also publishes
dedicated 1:10m files per point of view in which some lines are redrawn — most
notably in Kashmir — and those changes are not reproduced. Figures are per
record, not per view: Somalia's population does not change when a view merges
Somaliland into it.

## Regions

Region schemes come from the data too. The build script writes five:
`un-region` (default), `un-subregion`, `wb-region`, `continent` and `income`.
A record says which region it is in under each; regions and their summed
figures are worked out from the records, so no region outlines are needed —
in region mode the layer highlights and selects every member country.

```ts
countries({ regionScheme: "wb-region", mode: "auto", regionsBelowZoom: 3 });
```

| Mode | Hover and click pick |
|---|---|
| `countries` (default) | a country |
| `regions` | the whole region of the country under the pointer |
| `auto` | regions below `regionsBelowZoom` (3), countries above |

## The extension's options

| Option | Default | |
|---|---|---|
| `store` | built-in | See above. |
| `view`, `regionScheme` | the dataset's defaults | Starting choices; the controller changes them later. |
| `mode`, `regionsBelowZoom` | `countries`, 3 | |
| `fill` | `"region"` | `"country"`, `"uniform"`, `"none"`, or `(record, region) => colour` for a choropleth. |
| `palette`, `uniformColour`, `fillOpacity`, `hoverOpacity`, `borderColour`, `borderWidth`, `highlightColour` | | Looks. |
| `interactive` | `true` | `false` draws the layer and listens to nothing. |
| `before` | `"labels"` | Under the basemap's labels, so names stay readable. |
| `id` | `"countries"` | Extension id and layer prefix; change it to put two layers on one map. |
| `onSelect`, `onHover` | | `{ kind: "country", country, region }` or `{ kind: "region", region, scheme }`, or `null`. |
| `onReady(controller)` | | `setView`, `setRegionScheme`, `setMode`, `select`, `fitTo`, `countryAt`, and `data`. |
| `onError` | | Load failures. The map still works without the layer. |

**Clicks it leaves alone.** A click only selects a country when nothing on a
layer above the countries is under the pointer (the basemap's labels aside),
so events, units and routes drawn over the map keep their clicks.

**Map rebuilds.** A host that rebuilds its map (to toggle globe or terrain)
gets the same view, scheme, mode and selection back, without the data being
read again.

## Requirements on the consuming application

1. **For a dataset:** the same `configureFoundryBytes` / `configureBasemap`
   call the basemap needs, and the dataset as a Resource on the app in
   Developer Console. A missing Resource loses the country layer and reports
   it through `onError`; the map is unaffected.
2. **Peers:** `@acc/decho-foundry-bytes@^0.1.0`; `@acc/decho-basemap` for
   `./extension` (optional otherwise); `react` for `./react` (optional).

## Package notes

- Built like its siblings: `tsc -b tsconfig.build.json`, `NodeNext`, so `dist`
  loads under Node's own loader as well as bundlers.
- The built-in world is `src/builtin/world.ts`, generated — do not edit it.
  It is one `JSON.parse` of a string, which engines load faster than an
  object literal and which keeps TypeScript from inferring a type for every
  coordinate.
- `scripts/` ships in the tarball so a consumer can build a dataset from the
  installed package.
