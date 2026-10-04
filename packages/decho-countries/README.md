# @acc/decho-countries

Country outlines and facts, served **from Foundry** like the rest of the decho
stack: borders under several points of view, regions under several schemes,
population, area and GDP, a "which country is this point in" lookup, and a
clickable country layer for `@acc/decho-basemap`.

**Everything comes from one Foundry dataset.** The package carries no data of
its own and fetches nothing from anywhere else: the dataset is built in
Foundry, by the transform in `foundry/`, from files downloaded once by hand.

## Quick start

```tsx
import { DechoBasemap } from "@acc/decho-basemap/react";
import { countries } from "@acc/decho-countries/extension";

const store = { kind: "dataset", datasetRid: "ri.foundry.main.dataset.…" }; // countries_map
const [selection, setSelection] = useState(null);

<DechoBasemap extensions={[countries({ store, onSelect: setSelection })]} />;
```

`selection` is `{ kind: "country", country, region }` or
`{ kind: "region", region, scheme }`. Showing it is the app's job — see
[Showing a country's facts](#showing-a-countrys-facts).

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
| `{ kind: "dataset", datasetRid }` | The `countries_map` dataset (below). Read through `@acc/decho-foundry-bytes`, so `configureFoundryBytes` (`configureBasemap`) must have run, and the dataset must be a **Resource** on the app in Developer Console. |
| `{ kind: "files", files }` | The same files held in memory, by path. For tests. |

### Building the dataset in Foundry

`foundry/countries_transform.py` is a Foundry Python transform. It reads the
raw files as downloaded and needs no internet access:

1. **Download** (once, by hand) and upload to one Foundry dataset:
   - Natural Earth 1:10m [admin 0 countries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/)
     and [populated places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/):
     the `ne_10m_admin_0_countries.*` and `ne_10m_populated_places.*`
     shapefiles (`.shp`, `.shx`, `.dbf`, `.cpg`; `VERSION.txt` is used if
     present).
   - World Bank CSV downloads of
     [population](https://data.worldbank.org/indicator/SP.POP.TOTL),
     [land area](https://data.worldbank.org/indicator/AG.LND.TOTL.K2),
     [surface area](https://data.worldbank.org/indicator/AG.SRF.TOTL.K2),
     [GDP](https://data.worldbank.org/indicator/NY.GDP.MKTP.CD) and
     [GDP per person](https://data.worldbank.org/indicator/NY.GDP.PCAP.CD):
     the `API_*.csv` files and one `Metadata_Country_*.csv`.

   Names are matched loosely, so the version numbers in them do not matter;
   `Metadata_Indicator_*`, README and `.prj` files are ignored.
2. **Set up** a Python transforms repository: copy the file in, set the three
   paths in its `@transform` decorator, and add `shapely` (2.0 or later) and
   `pyshp` to the run requirements. `pyshp` is pure Python — no GDAL.
3. **Build.** Two outputs:

| Output | |
|---|---|
| `countries_map` | Files, exactly what this package reads: `manifest.json`, `countries.json`, `views/<view>/low.geojson` (simplified, from zoom 0) and `high.geojson` (full 1:10m, from zoom 4). Its RID is the `datasetRid`. About 200 MB, but the map only reads the view and detail on screen. |
| `countries` | A table, one row per country: codes, names, the five region schemes, capital, label point, Wikidata id, every figure with its year and source, and the outline as a GeoJSON string. For Contour, the Ontology or joins. |

The figures are each World Bank series' most recent year, per country;
Natural Earth's 2019 estimates where the World Bank has nothing (Taiwan,
Somaliland, Northern Cyprus); total area from the outline where neither has it.
The build lists any sovereign country the World Bank had no figures for.

The same file runs on a laptop, for checking a build before uploading —
`python countries_transform.py <raw folder> <out folder>` — and reads only
the folder it is given.

### Licences

| Source | Gives | Licence |
|---|---|---|
| Natural Earth | Outlines, points of view, region fields, names in 26 languages, capitals, Wikidata ids | Public domain |
| World Bank | Population, areas, GDP, World Bank regions, income groups | CC BY 4.0 — credit it wherever its figures are shown; the dataset's manifest lists the sources to credit |

## Showing a country's facts

The package has no card or panel: how it looks is the app's call. The core
exports what one needs, so a panel in your own style is short:

```tsx
import { FIGURE_LABELS, figuresOf, flagEmoji, formatFigure, orderedFigureKeys } from "@acc/decho-countries";

const figures = figuresOf(country);   // its figures plus density and GDP per person
<h3>{flagEmoji(country.iso2)} {country.name}</h3>
{orderedFigureKeys(figures).map((key) => (
  <div key={key}>
    {FIGURE_LABELS[key]?.label ?? key}: {formatFigure(key, figures[key])} ({figures[key].year})
  </div>
))}
<small>Sources: {data.manifest.sources.map((s) => s.name).join(", ")}</small>
```

Two things worth keeping in any version: **each figure's year** (they differ
by country and by figure) and **the sources line** (the World Bank's licence
asks for credit wherever its figures appear). For a region, use
`region.figures`: the sums over its members, each with how many contributed.
The `/countries` demo page has a complete one.

### Loading the data in a component

`useCountries(store)` from `@acc/decho-countries/react` loads the data
without a map — for a country list, a search box, a table, or tagging data
with `countryAt` before it reaches the map:

```tsx
const { data, loading, error } = useCountries({ kind: "dataset", datasetRid });
```

With the map extension you do not need it: the extension's controller
carries the same data as `controller.data`.

## Border views

Where territory is disputed, a view decides whose claim the map follows. The
transform makes one per Natural Earth point of view that differs from the
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

Region schemes come from the data too. The transform writes five:
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
| `store` | required | See above. |
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
   `./extension` (optional otherwise); `react` for the `./react` hook
   (optional).

## Package notes

- Built like its siblings: `tsc -b tsconfig.build.json`, `NodeNext`, so `dist`
  loads under Node's own loader as well as bundlers.
