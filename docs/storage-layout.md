# Storage layout

elek.io Core stores everything as plain files on disk. This document describes where those files live and what a Project looks like as a directory tree.

For the data model these files represent, see [`concepts.md`](./concepts.md).

## Root locations

Core works under a single data directory, `~/elek.io` by default. The root is configurable with the `dataDir` constructor option or the `ELEK_IO_DATA_DIR` environment variable, see [`usage.md`](./usage.md#options). The `pathTo` helper (`src/util/node.ts`, exposed as `core.util.pathTo`) builds every path from the resolved root. With the default root:

| Path | Resolves to | Holds |
| --- | --- | --- |
| `pathTo.projects` | `~/elek.io/projects` | All Projects, one folder each |
| `pathTo.project(id)` | `~/elek.io/projects/{projectId}` | A single Project (a git repository) |
| `pathTo.userFile` | `~/elek.io/user.json` | The current User set via `core.user.set()` |
| `pathTo.tmp` | `~/elek.io/tmp` | Scratch space (emptied on Core startup) |

The User file is global, not per-Project. There is one `user.json` per data directory.

## A Project on disk

Each Project is a self-contained git repository:

```
~/elek.io/projects/{projectId}/
|-- .git/
|-- .gitignore
|-- project.json                      project metadata: name, description, version, settings
|-- assets/
|   |-- {assetId}.json                asset metadata (name, description, extension, mimeType, size)
|-- collections/
|   |-- {collectionId}/
|   |   |-- collection.json           collection metadata: name, slug, icon, field definitions
|   |   |-- {entryId}.json            an Entry: its values keyed by field slug
|-- components/
|   |-- {componentId}/
|   |   |-- component.json            component metadata: name, slug, field definitions
|-- lfs/
|   |-- {assetId}.{extension}         the actual binary asset file
```

A few things worth calling out:

- **Entries live directly inside their Collection folder**, alongside `collection.json`, named `{entryId}.json`. Collections and Components each get their own UUID-named folder. Entries do not.
- **Assets are split across two folders.** The metadata JSON lives in `assets/{assetId}.json`. The binary itself lives in `lfs/{assetId}.{extension}`. See [`asset-management.md`](./asset-management.md).
- Every Project folder is created with a `.gitkeep` so empty folders are tracked.

## Object files

Every object file shares a common envelope (`baseFileSchema` in `src/schema/fileSchema.ts`):

```typescript
{
  objectType: 'project' | 'collection' | 'component' | 'entry' | 'asset',
  id: string,            // UUID, readonly
  coreVersion: string,   // the Core version that wrote it, readonly - drives migrations
  created: string,       // ISO datetime, readonly
  updated: string | null // ISO datetime, readonly
}
```

On top of that envelope:

- `project.json` adds `name`, `description`, `version` and `settings` (including the supported languages).
- `collection.json` adds the translatable `name` (singular / plural), `slug`, `icon` and `fieldDefinitions`.
- `component.json` adds `name`, `slug` and `fieldDefinitions`.
- An Entry file adds `values`, keyed by field-definition slug.
- An asset metadata file adds `extension`, `mimeType` and `size`.

The `coreVersion` stamp on each file is what the migration chain reads when upgrading a Project.

## The slug index

Resolving a Collection or Component slug to an id, and checking that a new slug is free, both go through a UUID-to-slug map. It lives in memory, per Core instance, and is built by scanning the entity folders and reading each entity file the first time something needs it.

Nothing on disk backs it:

- A Core that has just started rebuilds the map on the first slug lookup or slug-uniqueness check of a Project.
- The map is dropped when the process ends, so it can never be stale across runs.
- A Project written by an older Core may still carry `collections/slug.index.json` and `components/slug.index.json`. Nothing reads or writes them, and the generated `.gitignore` still names them so a leftover file does not show up as a change.

Writing the map back to disk would save that first scan, and it is not done because nothing invalidates such a file after a `pull`, `merge`, `switch` or `reset`. That would introduce a staleness bug the in-memory map does not have, since a fresh process always rebuilds.

Field-value uniqueness (`isUnique` and the `slug` field type) does not use this map at all. It is enforced by scanning a Collection's Entries on each write (see [`fields.md`](./fields.md#uniqueness)), which keeps it correct for Entries brought in by a pull or merge that never passed through Core's write path.

## What is and isn't committed

The generated `.gitignore` ignores all hidden files (`.*`) except `.gitignore`, `.gitattributes` and `.gitkeep` files, and also names the two `slug.index.json` paths an older Core may have left behind. Everything else - `project.json`, every `collection.json` / `component.json`, every Entry, asset metadata, and the binaries under `lfs/` - is committed.

## Line endings

Every file Core writes uses LF, on every operating system. Object files get it from `JSON.stringify`, and the generated `.gitignore` and `.gitattributes` are joined with LF rather than the platform newline.

That is not enough on its own. `core.autocrlf` is a per machine git setting Core does not control, and a Windows checkout with it enabled would convert files to CRLF anyway. So the generated `.gitattributes` pins the checkout instead:

- `* text=auto eol=lf` comes first and holds for every text file, whatever `core.autocrlf` says.
- The `lfs/**` rules follow it, so binaries keep their `-text` marker and stay out of conversion. The last matching pattern wins.

The result is that a Project is byte identical whichever OS created it. Without this, the same Project edited on Windows and on Linux would differ on every line of every file, and syncing the two would conflict everywhere.

## The `lfs` folder

Binary assets live under `lfs/` rather than next to their metadata, and are tracked with Git LFS. The `.gitattributes` generated at Project creation tracks `lfs/**`, so each binary is committed as a small pointer while the bytes live in the local LFS store (`.git/lfs/objects`).

The working-tree file stays the real binary, so reading an Asset returns its content directly. See [`git-and-sync.md`](./git-and-sync.md#git-lfs) for how this works across clone, push and pull.

## See also

- [`concepts.md`](./concepts.md) - what these files represent
- [`asset-management.md`](./asset-management.md) - the two-file Asset model in detail
- [`git-and-sync.md`](./git-and-sync.md) - the git repository each Project lives in
