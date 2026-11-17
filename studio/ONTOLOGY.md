# Setting up the Ontology for Decho Studio

The studio uses the Ontology for three things:

| | What | Needs |
|---|---|---|
| **Saved projects** | Project → Save to Foundry / Open from Foundry | `MapProject` object type + 3 actions |
| **Editable feature collections** | draw/import into a collection, then *Commit* | `MapFeature` object type + 3 actions |
| **Reading your own data** | Data → Add from the Ontology: any object type with a `geopoint` or `geoshape` property becomes a read-only layer | nothing new: just add those object types as Resources on the app |

Every save and every committed edit is an **Action**: it's validated by
Foundry, permissioned like any other action, and appears in the action log,
so you can see who changed what and when.

## 1. Backing datasets

Create two datasets (a Pipeline Builder output or a manually created
dataset), each with one row per object:

**`map_projects`**

| column | type | notes |
|---|---|---|
| `project_id` | string | primary key |
| `title` | string | title property |
| `document` | string | the project as JSON; can be large — long text |
| `updated_at` | timestamp | |
| `updated_by` | string | |

**`map_features`**

| column | type | notes |
|---|---|---|
| `feature_id` | string | primary key |
| `collection` | string | the layer the feature belongs to |
| `title` | string | title property |
| `geometry` | string | GeoJSON geometry — mapped to a **geoshape** property |
| `properties` | string | the feature's attributes as a JSON object |
| `updated_at` | timestamp | |
| `updated_by` | string | |

## 2. Object types

In Ontology Manager, create two object types from those datasets. The
**API names** matter, because the studio uses them (they can be changed; see
step 5):

**Map Project** — API name `MapProject`

| property API name | type |
|---|---|
| `projectId` | String (primary key) |
| `title` | String (title) |
| `document` | String |
| `updatedAt` | Timestamp |
| `updatedBy` | String |

**Map Feature** — API name `MapFeature`

| property API name | type |
|---|---|
| `featureId` | String (primary key) |
| `collection` | String |
| `title` | String (title) |
| `geometry` | **Geoshape** |
| `properties` | String |
| `updatedAt` | Timestamp |
| `updatedBy` | String |

Make both editable (writeback enabled on the object type).

## 3. Actions

Create six action types. The **action API names** and **parameter IDs** below
are what the studio sends.

| Action API name | Rule | Parameters (ID: type) |
|---|---|---|
| `create-map-project` | Create object *Map Project* | `projectId`: String, `title`: String, `document`: String (long text) |
| `modify-map-project` | Modify object *Map Project* | `project`: Object reference (Map Project), `title`: String, `document`: String |
| `delete-map-project` | Delete object *Map Project* | `project`: Object reference (Map Project) |
| `create-map-feature` | Create object *Map Feature* | `featureId`: String, `collection`: String, `geometry`: Geoshape, `properties`: String (optional), `title`: String (optional) |
| `modify-map-feature` | Modify object *Map Feature* | `feature`: Object reference (Map Feature), `geometry`: Geoshape, `properties`: String (optional), `title`: String (optional) |
| `delete-map-feature` | Delete object *Map Feature* | `feature`: Object reference (Map Feature) |

For the create and modify actions, map each parameter to the property of the
same name. Set `updatedAt` to *current time* and `updatedBy` to *current user*
in the rule, rather than as parameters.

Submission criteria are where governance goes. For example: only members of a
group may delete projects, or a feature's `collection` may not be changed by
modify.

## 4. The application in Developer Console

- Scopes: `api:use-datasets-read`, `api:use-ontologies-read`,
  `api:use-ontologies-write`.
- Resources: the two object types and six actions above; every object type
  you want to show as a read-only layer; every terrain-gen dataset you add by
  ID.

## 5. Configuration (`studio/.env`)

The defaults match the names above. Override any of them if your names
differ:

```
VITE_ONTOLOGY=                  # ontology API name or RID; default: the first one visible
VITE_MAP_PROJECT_TYPE=MapProject
VITE_MAP_FEATURE_TYPE=MapFeature
VITE_ACTION_CREATE_PROJECT=create-map-project
VITE_ACTION_MODIFY_PROJECT=modify-map-project
VITE_ACTION_DELETE_PROJECT=delete-map-project
VITE_ACTION_CREATE_FEATURE=create-map-feature
VITE_ACTION_MODIFY_FEATURE=modify-map-feature
VITE_ACTION_DELETE_FEATURE=delete-map-feature
```

## How the studio uses it

- **Save to Foundry** creates the `MapProject` the first time and modifies it
  afterwards; the project's `id` is the primary key. Layers backed by Foundry
  store only *where* their features come from; their features are reloaded
  on open, so a saved project stays small. Layers held only in the project
  are stored with their features (subject to the string property's size
  limit; publish large layers as a collection instead).
- **Feature collections:** edits are kept locally, counted in the layer list
  ("3 unsaved"), and sent as create/modify/delete actions when you press
  *Commit*. A refused action is reported for that feature and stays pending
  so it can be fixed and retried; the rest go through. A feature created and
  deleted before committing is never sent.
- **Publish to Foundry** turns a local layer into a collection by creating one
  `MapFeature` per feature.
- **Read-only layers** from your own object types load up to 50,000 objects,
  with every non-geo property in the attribute table.

## Trying it without an enrollment

`npm run dev` can run a fake Foundry that implements exactly this contract,
with two made-up demo object types:

```bash
cat > .env.local <<'ENV'
VITE_FOUNDRY_API_URL=http://localhost:8080/fake-foundry
VITE_FOUNDRY_TOKEN=fake
ENV
STUDIO_FAKE_FOUNDRY=1 STUDIO_DATA=../terrain-gen/out npm run dev
```

Each folder of `STUDIO_DATA` is served as a dataset. The fake dataset IDs are
printed at start-up and listed at `/fake-foundry/fake/rids`. A folder that
holds a `table.csv` reads as a table. `test/foundry.test.ts` runs the studio's
Ontology code against the same fake.

`VITE_FOUNDRY_TOKEN` also works against a real enrollment in development
(paste a personal token). Production builds never read it.
