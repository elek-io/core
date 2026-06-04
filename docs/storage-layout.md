# Storage Layout

elek.io Core stores everything as plain files on disk. This document describes where those files live and what a Project looks like as a directory tree.

For the data model these files represent, see [`concepts.md`](./concepts.md).

## Root locations

Core works under a single directory in the user's home folder, `~/elek.io`. The `pathTo` helper (`src/util/node.ts`, exposed as `core.util.pathTo`) builds every path from there:

| Path                 | Resolves to                      | Holds                                      |
| -------------------- | -------------------------------- | ------------------------------------------ |
| `pathTo.projects`    | `~/elek.io/projects`             | All Projects, one folder each              |
| `pathTo.project(id)` | `~/elek.io/projects/{projectId}` | A single Project (a git repository)        |
| `pathTo.userFile`    | `~/elek.io/user.json`            | The current User set via `core.user.set()` |
| `pathTo.tmp`         | `~/elek.io/tmp`                  | Scratch space (emptied on Core startup)    |

The User file is global, not per-Project. There is one `user.json` for the machine.

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
|   |-- index.json                    UUID -> slug cache (not committed)
|   |-- {collectionId}/
|   |   |-- collection.json           collection metadata: name, slug, icon, field definitions
|   |   |-- {entryId}.json            an Entry: its values keyed by field slug
|-- components/
|   |-- index.json                    UUID -> slug cache (not committed)
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

The `coreVersion` stamp on each file is what the migration chain reads when upgrading a Project. See [`migration-and-history-flow.md`](./migration-and-history-flow.md).

## Index files

`collections/index.json` and `components/index.json` are UUID-to-slug lookup caches that let Core resolve a slug to an id without scanning every folder. They are **performance caches, not source of truth**: they are listed in the Project's `.gitignore`, never committed, and rebuilt from disk if missing or stale. A failed index write is swallowed and the cache self-heals on next access (see [`error-handling.md`](./error-handling.md#safewriteindex-swallows-errors)).

## What is and isn't committed

The generated `.gitignore` ignores all hidden files (`.*`) except `.gitignore`, `.gitattributes` and `.gitkeep` files, and additionally ignores the two `index.json` caches. Everything else - `project.json`, every `collection.json` / `component.json`, every Entry, asset metadata, and the binaries under `lfs/` - is committed.

## The `lfs` folder

Binary assets are stored under `lfs/` rather than alongside their metadata, and are tracked with Git LFS. A `.gitattributes` file generated at Project creation tracks `lfs/**`, so each binary is committed as a small pointer while the actual bytes live in the local LFS store (`.git/lfs/objects`). The working-tree file stays the real binary, so reading an Asset returns its content directly. See [`git-and-sync.md`](./git-and-sync.md#git-lfs) for how this works across clone, push and pull.

## See Also

- [`concepts.md`](./concepts.md) - what these files represent
- [`asset-management.md`](./asset-management.md) - the two-file Asset model in detail
- [`migration-and-history-flow.md`](./migration-and-history-flow.md) - how `coreVersion` drives upgrades
- [`git-and-sync.md`](./git-and-sync.md) - the git repository each Project lives in
