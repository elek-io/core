# Migration and History Reading Flow

This document describes how Projects are upgraded to a new Core version and how objects are read from git history.

## Migration Chain

Every service (Asset, Collection, Component, Entry, Project) has a `migrate()` method that transforms a potentially outdated JSON file into the current schema. The migration follows three stages:

1. **Loose parse** - validate with `migrateXSchema` (relaxed schema that accepts any `coreVersion`)
2. **Apply migration chain** - walk through registered `Migration` steps from the file's `coreVersion` to the target version
3. **Strict parse** - validate the result with the current `xFileSchema`

### `applyMigrations(data, migrations, targetVersion)`

The shared helper in `src/service/migrations/applyMigrations.ts` drives the chain:

```
Input data (structuredClone'd to prevent mutation)
  |
  v
Is data.coreVersion === targetVersion? --yes--> return data
  |
  no
  v
Find migration where migration.from === data.coreVersion
  |
  +--> Found: run migration, stamp coreVersion = migration.to, loop back
  |
  +--> Not found: stamp coreVersion = targetVersion, return (backward-compatible gap)
```

- Migrations are exact version matches (`from: '1.0.0'`), not semver ranges
- Each `Migration.run()` is a pure function - it must not mutate input or set `coreVersion`
- `applyMigrations` stamps `coreVersion` after each step
- If no migration exists for a version gap, the data is assumed backward-compatible

### Migration files

Each service has its own migration array under `src/service/migrations/`:

| File                      | Service           |
| ------------------------- | ----------------- |
| `assetMigrations.ts`      | AssetService      |
| `collectionMigrations.ts` | CollectionService |
| `componentMigrations.ts`  | ComponentService  |
| `entryMigrations.ts`      | EntryService      |
| `projectMigrations.ts`    | ProjectService    |

To add a migration, append a `Migration` object to the relevant array:

```typescript
// Example: src/service/migrations/projectMigrations.ts
export const projectMigrations: Migration[] = [
  {
    from: '1.0.0',
    to: '1.1.0',
    run: (data) => {
      // Transform data from 1.0.0 shape to 1.1.0 shape
      const { oldField, ...rest } = data;
      return { ...rest, newField: oldField };
    },
  },
];
```

## Project Upgrade Flow

`ProjectService.upgrade()` orchestrates upgrading an entire Project and all its objects to the current Core version.

```
upgrade({ id, force? })
  |
  v
Switch to 'work' branch (if not already on it)
  |
  v
Read project.json (unsafe read, no strict validation)
  |
  v
Version checks:
  - Project coreVersion > Core version? --> Error (client needs update)
  - Project coreVersion === Core version and !force? --> Error (already up to date)
  |
  v
List all Asset, Component and Collection references
  |
  v
Create upgrade branch: upgrade/core-{from}-to-{to}
  |
  v
  +-- Upgrade all Assets (sequential)
  |     For each: unsafeRead -> service.migrate() -> service.update()
  |
  +-- Upgrade all Components (sequential)
  |     For each: unsafeRead -> service.migrate() -> service.update()
  |
  +-- Upgrade all Collections (sequential)
  |     For each: unsafeRead -> service.migrate() -> service.update()
  |
  +-- Upgrade all Entries (sequential per Collection)
  |     For each: unsafeRead -> service.migrate() -> service.update()
  |
  v
Migrate the Project file itself
  |
  v
Switch back to 'work' branch
  |
  v
Squash-merge upgrade branch into 'work'
  |
  v
Commit with method: 'upgrade'
  |
  v
Create git tag with upgrade metadata
  |
  v
Delete upgrade branch
  |
  v
Done (logged with previous + migrated state)
```

### Rollback on failure

If any step inside the `try` block fails:

1. Switch back to the `work` branch
2. Force-delete the upgrade branch
3. Re-throw the error

The `work` branch remains unchanged since all upgrade work happened on the temporary upgrade branch.

## Reading from Git History

When `read()` is called with a `commitHash`, the service retrieves the file content at that specific commit and runs it through the migration chain. This ensures historical data is always returned in the current schema shape.

### Project history read

```
read({ id, commitHash })
  |
  v
gitService.getFileContentAtCommit(projectPath, projectFilePath, commitHash)
  |
  v
JSON.parse(content)
  |
  v
this.migrate(parsedJson)
  |  Internally: loose parse -> applyMigrations -> strict parse
  |
  v
toProject(projectFile)  -- resolves remoteOriginUrl
  |
  v
Return Project
```

### Asset history read

Same pattern, with an additional step to retrieve the binary asset file:

```
read({ projectId, id, commitHash })
  |
  v
Get asset JSON at commit -> JSON.parse -> migrate()
  |
  v
Get binary asset content at commit
  -> if it is an LFS pointer, resolve it to the real bytes from the local store
  -> write to temp path
  |
  v
toAsset(projectId, assetFile, commitHash)  -- uses temp path
  |
  v
Return Asset
```

Because Assets are tracked with Git LFS, the content at a commit is a pointer rather than the binary. Core resolves it to the real bytes from the local LFS store, which is always complete (see [`git-and-sync.md`](../docs/git-and-sync.md#git-lfs)), so historical reads work offline.

### Collection and Entry history reads

Follow the same `getFileContentAtCommit -> JSON.parse -> migrate() -> toX()` pattern without additional file handling.

### Why migrate on history reads?

A file stored at commit `abc123` may have been written by Core v1.0.0 with a different schema shape. By running `migrate()`, the historical data is transformed through the migration chain to match the current schema, allowing callers to use a single consistent type regardless of when the data was written.

## See Also

- [`releases.md`](../docs/releases.md) - the related `upgrade` tag and versioned snapshots
- [`schema-changes.md`](../docs/schema-changes.md) - a separate mechanism: editing field definitions cascades into existing content
- [`storage-layout.md`](../docs/storage-layout.md) - the `coreVersion` stamp on each file that drives migrations
- [`git-and-sync.md`](../docs/git-and-sync.md) - the branches and history reads this builds on
- [`error-handling.md`](../docs/error-handling.md) - `UpgradeFailed` and the other error types
