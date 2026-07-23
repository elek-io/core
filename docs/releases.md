# Releases

A Release promotes the current `work` branch to `production` as a tagged, versioned snapshot. Core computes the semantic-version bump for you by diffing the two branches, so the version number reflects what actually changed. Releases are managed through `core.releases`.

For the branch model these build on, see [`git-and-sync.md`](./git-and-sync.md).

## The three operations

| Method            | What it does                                                                                       | Touches production? |
| ----------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| `prepare()`       | Read-only. Diffs `work` against `production` and returns the computed bump and per-object changes. | No                  |
| `create()`        | Promotes `work` to `production`, bumps the version, tags it, merges back into `work` and pushes to `origin` if set. | Yes                 |
| `createPreview()` | Tags a pre-release snapshot on `work` (for example `1.1.0-preview.3`) without promoting, pushes the tag to `origin` if set. | No                  |

All three take `{ projectId }`. `prepare()` returns a `ReleaseDiff`. `create()` and `createPreview()` return a `ReleaseResult` (`{ version, diff }`).

## prepare(): the diff and the bump

`prepare()` must be run while the Project is on the `work` branch (otherwise it throws `PreconditionFailed`). It is read-only: it changes nothing, it just reports what a release would do.

It diffs `work` against `production` across six object kinds - the Project file, Collections, their field definitions, Components and their field definitions, Assets, and Entries - and returns a `ReleaseDiff`:

```typescript
const diff = await core.releases.prepare({ projectId: project.id });
// {
//   project,             // the current work ProjectFile
//   bump,                // 'major' | 'minor' | 'patch' | null  (null = no changes)
//   currentVersion,      // e.g. '1.0.0'
//   nextVersion,         // e.g. '1.1.0', or null if nothing changed
//   projectChanges, collectionChanges, fieldChanges,
//   componentChanges, componentFieldChanges, assetChanges, entryChanges,
// }
```

### How the bump is decided

Each change is classified as `major`, `minor` or `patch`, and the highest classification across all changes wins. The classification follows the contract a **consumer of the generated client and types** depends on: anything that can break that contract is major, anything that only adds to it is minor, and cosmetic or content-only edits are patch.

| Bump      | Meaning                                   | Examples                                                                                                                                                                                                                                                                        |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **major** | Breaks an existing consumer's assumptions | Collection / Component / Entry / Asset deleted. Field deleted. A field's `valueType`, `fieldType` or `slug` changed. `min`/`max` tightened. `isRequired` turned off. `isUnique` turned off. `ofCollections` changed. Default language changed, or a supported language removed. |
| **minor** | Adds something without breaking           | Collection / Component / Entry / Asset added. Field added. `isRequired` turned on. `isUnique` turned on. A supported language added.                                                                                                                                            |
| **patch** | Cosmetic or content-only                  | `label`, `description`, `inputWidth`, `isDisabled` or `defaultValue` changed. `min`/`max` loosened. Project `name` / `description` changed. An Asset's binary or metadata changed. An Entry's values modified.                                                                  |

If `work` has commits ahead of `production` but the diff finds no classified change, the bump defaults to `patch`. If there are no changes at all, `bump` and `nextVersion` are `null`. The exhaustive list of change types lives in `src/schema/releaseSchema.ts`.

## create(): cutting a release

`create()` runs `prepare()` first and refuses to proceed if there is nothing to release (`PreconditionFailed`). Otherwise it:

1. switches to `production`,
2. merges `work` into `production`,
3. writes the `nextVersion` into `project.json` and commits it (commit method `release`),
4. creates an annotated git tag carrying `Type: release` and `Version: <nextVersion>`,
5. switches back to `work` and merges `production` back in (so both branches share the version commit),
6. pushes `production` and the new tag to `origin`, if a remote is set.

A Release is the publish moment: the push makes the released content available to consumers that read from the remote, such as CI builds. A Project without a remote releases locally, nothing is pushed. If the push itself fails, the release exists locally and the error surfaces, synchronizing later completes the publish.

```typescript
const result = await core.releases.create({ projectId: project.id });
// result.version -> '1.1.0'
// result.diff    -> the ReleaseDiff that was released
```

After a full release, the Project's `version` field is identical on `work` and `production`.

## createPreview(): pre-release snapshots

`createPreview()` also runs `prepare()` and requires changes, but it never touches `production`. It computes a pre-release version by counting the existing `preview` tags for the same target version since the last full release, then:

1. writes the preview version (for example `1.1.0-preview.3`) into `project.json` on `work` and commits it,
2. creates an annotated tag carrying `Type: preview` and `Version: <previewVersion>`,
3. pushes the tag to `origin`, if a remote is set.

Previews are snapshots of the current `work` state for testing or sharing. Only `create()` promotes content to `production`. Pushing the preview tag uploads the commits it points at, but the `work` branch ref itself is only pushed by `synchronize()`.

## Reading releases

Releases, previews and Core upgrades are git tags, read through `core.git.tags`:

```typescript
const { list } = await core.git.tags.list({
  path: core.util.pathTo.project(project.id),
});
```

Each `GitTag` carries an `id`, an `author`, a `datetime`, and a discriminated `message`:

- `{ type: 'release', version }`
- `{ type: 'preview', version }`
- `{ type: 'upgrade', coreVersion }` (created by the Project upgrade flow, not by `core.releases`)

`core.git.tags` also exposes `read({ ... })` and `count({ ... })`.

## Versioning

The Project's `version` field follows [Semantic Versioning](https://semver.org/) and is the value a release writes. `production` holds the released version. `work` tracks it after a full release and carries pre-release versions (`-preview.N`) in between.

## See Also

- [`git-and-sync.md`](./git-and-sync.md) - the `work` / `production` branch model and tags
- [`schema-changes.md`](./schema-changes.md) - how the field-definition changes a release reports actually transform content- [`concepts.md`](./concepts.md) - Releases in the overall data model
