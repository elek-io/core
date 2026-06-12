# Export

`elek export` writes Project content out to plain JSON - a self-contained snapshot you can consume statically, feed into other tools, or check into another repository. Unlike the [local API](./local-api.md) and [generated client](./api-clients.md), an export needs nothing running afterwards.

## CLI

```bash
elek export [outDir] [projects] [template] [--watch]
```

| Argument   | Default      | Meaning                                                 |
| ---------- | ------------ | ------------------------------------------------------- |
| `outDir`   | `./.elek.io` | Where to write the export.                              |
| `projects` | `all`        | `all`, or a comma-separated list of Project ids.        |
| `template` | `nested`     | `nested` (one JSON file) or `separate` (a folder tree). |
| `--watch`  | off          | Re-export automatically when Project content changes.   |

## What an export contains

Each Project is exported with its content inlined: `assets`, `collections` (each with its `entries`), and `components` as arrays on the Project object. References inside Entry values are kept as **ids, not resolved** - a consumer cross-references them against the exported Assets and Entries. Every object keeps its full metadata envelope (`id`, `coreVersion`, `created`, `updated`, and so on).

Whether the actual Asset **binaries** are included depends on the template.

## `nested` template

Everything goes into a single JSON file, binaries excluded (Asset metadata keeps its original `absolutePath`).

- One Project: `{outDir}/project-{projectId}.json`
- Multiple Projects: `{outDir}/projects.json`, an object keyed by Project id.

Best when you want one file to load and walk in memory.

## `separate` template

Each Project becomes a folder tree, and Asset **binaries are copied in** (with each Asset's `absolutePath` updated to point at the copied file):

```
{outDir}/project-{projectId}/
|-- project.json
|-- assets/
|   |-- {assetId}.{extension}     copied binary
|   |-- assets.json               all asset metadata
|-- components/
|   |-- {componentSlug}.json      one per Component
|   |-- components.json           all Components
|-- collections/
|   |-- collections.json          all Collections
|   |-- {collectionSlugPlural}/
|   |   |-- collection.json
|   |   |-- entries.json          all Entries in the Collection
```

Best when you want browsable files and the binaries alongside them.

## Selecting Projects

`all` exports every local Project. A comma-separated list of ids exports just those (each id is validated as a UUID).

## Watch mode

`--watch` keeps the export current: it watches the Projects directory (ignoring `.git`) with chokidar and re-runs the same export on any change. Useful as a background step while developing against the exported JSON.

## See Also

- [`storage-layout.md`](./storage-layout.md) - the on-disk source the export reads from
- [`local-api.md`](./local-api.md) - reading content over HTTP instead of exporting
- [`api-clients.md`](./api-clients.md) - generating a typed client over the API
- [`concepts.md`](./concepts.md) - the objects that appear in an export
