# Releases

A Release promotes the current `draft` branch into `main` as a tagged, versioned snapshot. Core computes the semantic-version bump for you by diffing the two branches, so the version number reflects what actually changed. Releases are managed through `core.releases`.

With a remote, a Release publishes `main`, `draft` and its tag together, so the remote's `draft` always holds what its `main` released.

For the branch model these build on, see [`git-and-sync.md`](./git-and-sync.md).

## The three operations

| Method | What it does | Touches `main`? |
| --- | --- | --- |
| `prepare()` | Read-only. Diffs `draft` against the released `main` and returns the computed bump and per-object changes. | No |
| `create()` | Fetches `origin` if set, promotes `draft` into the released `main`, bumps the version, tags it, merges back into `draft` and pushes `main`, `draft` and the tag in one atomic push. | Yes |
| `createPreview()` | Fetches `origin` if set, tags a pre-release snapshot on `draft` (for example `1.1.0-preview.3`) without promoting, pushes `draft` and the tag in one atomic push. | No |

All three take `{ projectId }`. `prepare()` returns a `ReleaseDiff`. `create()` and `createPreview()` return a `ReleaseResult` (`{ version, diff }`).

## What a Release compares against

The released state is a `main` branch, and which one depends on the remote:

| The Project has | Released state | `prepare()` | `create()` and `createPreview()` |
| --- | --- | --- | --- |
| no `origin` | the local `main` | reads it | read it, nothing is fetched |
| an `origin` with a `main` | the remote's `main` | reads it as last fetched | fetch first, LFS objects included, then read it |
| an `origin` without a `main` | the local `main` | reads it | fetch first, then read it |

The remote's `main` is read through `origin/main`, so a local `main` that is missing after a clone, or behind after another working copy released, changes nothing. `create()` moves the local `main` to the released commit before merging, and creates it when it is missing.

`prepare()` never fetches, so it stays read-only and works offline. A Release made from another working copy shows up once something fetched, such as `synchronize()`, `getChanges()` or `core.projects.branches.list()`. `create()` fetches anyway, so the version it writes is computed against the remote as of the call.

All three throw `PreconditionFailed` rather than guess when:

- `draft` lacks commits of the remote's `draft`. The push would be rejected, and a Release never rebases, so what `prepare()` showed is what gets released. Synchronize first.
- there is no `main` branch, locally or on the remote,
- the local `main` holds commits the remote's `main` lacks, so either could be the released state,
- `draft` lacks commits of the remote's `main`, which the diff would count as removed content. That happens after a Release reached the remote's `main` without its `draft`, for example one pushed by hand. Synchronize first, and if the remote's `draft` lacks them too, synchronize the working copy that released them.

`prepare()` checks against the remote as last fetched and `create()` against the remote just fetched, so a `prepare()` after any fetch refuses exactly where `create()` would.

A Project's first Release compares against the commit `core.projects.create()` made on `main`, so everything added since counts.

## prepare(): the diff and the bump

`prepare()` must be run while the Project is on the `draft` branch (otherwise it throws `PreconditionFailed`). It is read-only: it changes nothing, it just reports what a release would do.

It diffs `draft` against the released `main` across the Project file, Collections and Components with their field definitions, Assets and Entries, and returns a `ReleaseDiff`:

```typescript
const diff = await core.releases.prepare({ projectId: project.id });
// {
//   project,             // the current draft ProjectFile
//   bump,                // 'major' | 'minor' | 'patch' | null  (null = no changes)
//   currentVersion,      // e.g. '1.0.0'
//   nextVersion,         // e.g. '1.1.0', or null if nothing changed
//   projectChanges, collectionChanges, fieldChanges,
//   componentChanges, componentFieldChanges, assetChanges, entryChanges,
// }
```

### How the bump is decided

Each change is classified as `major`, `minor` or `patch`, and the highest classification across all changes wins. The classification follows the contract a **consumer of the generated client and types** depends on: anything that can break that contract is major, anything that only adds to it is minor, and cosmetic or content-only edits are patch.

| Bump | Meaning | Examples |
| --- | --- | --- |
| **major** | Breaks an existing consumer's assumptions | A Collection, Component, Entry or Asset deleted. A field definition deleted or renamed. A Collection's plural slug or a Component's slug renamed. A field's `valueType` or `fieldType` changed. The default language changed. |
| **minor** | Adds something without breaking | A Collection, Component, Entry or Asset added. A field definition added. A supported language added. |
| **patch** | Cosmetic or content-only | A field's `label`, `description` or `defaultValue` changed. An Entry's values modified. The Project's name changed. |

If `draft` has commits ahead of `main` but the diff finds no classified change, the bump defaults to `patch`. If there are no changes at all, `bump` and `nextVersion` are `null`. [Every change a diff can carry](#every-change-a-diff-can-carry) lists the rest.

### Every change a diff can carry

Every change `prepare()` can report is below, with the bump it contributes. The names are the `*ChangeTypeSchema` enums of `src/schema/releaseSchema.ts`.

| Array | `changeType` | Bump | What changed |
| --- | --- | --- | --- |
| `projectChanges` | `defaultLanguageChanged` | major | The Project's default language |
| `projectChanges` | `supportedLanguageRemoved` | major | The Project supports one language less, so the generated `ProjectLanguage` drops it and with it every key of a translatable value |
| `projectChanges` | `supportedLanguageAdded` | minor | The Project supports one language more, which the generated `ProjectLanguage` gains |
| `projectChanges` | `nameChanged` | patch | The Project's name |
| `projectChanges` | `descriptionChanged` | patch | The Project's description |
| `collectionChanges` | `deleted` | major | The Collection is gone, with every Entry it held |
| `collectionChanges` | `slugChanged` | major | The Collection's plural slug, which its generated type names, its generated client key and its Astro collection name are built from, and which addresses it in the API. A changed singular slug is not reported, because no generated name, key or path is built from it |
| `collectionChanges` | `added` | minor | A Collection the released state does not hold |
| `componentChanges` | `deleted` | major | The Component is gone |
| `componentChanges` | `slugChanged` | major | The Component's slug, which its generated type names are built from, and which addresses it in the API |
| `componentChanges` | `added` | minor | A Component the released state does not hold |
| `fieldChanges` and `componentFieldChanges` | `deleted` | major | The field definition is gone, with its value in every Entry |
| `fieldChanges` and `componentFieldChanges` | `slugChanged` | major | The field definition's slug, which is the key its value arrives under |
| `fieldChanges` and `componentFieldChanges` | `valueTypeChanged` | major | The field definition's `valueType` |
| `fieldChanges` and `componentFieldChanges` | `fieldTypeChanged` | major | The field definition's `fieldType` |
| `fieldChanges` and `componentFieldChanges` | `minMaxTightened` | major | `min` rose, `max` fell, or either gained a bound where there was none, on a `text`, `textarea`, `number`, `range`, `asset` or `entry` field |
| `fieldChanges` and `componentFieldChanges` | `isRequiredToNotRequired` | major | A field definition that was required is optional |
| `fieldChanges` and `componentFieldChanges` | `isUniqueToNotUnique` | major | A field definition that was unique may repeat a value |
| `fieldChanges` and `componentFieldChanges` | `ofCollectionsChanged` | major | An `entry` field's `ofCollections`. A narrowed list strips the Entry references it no longer allows |
| `fieldChanges` and `componentFieldChanges` | `ofComponentsChanged` | major | A `dynamic` field's `ofComponents`. A narrowed list strips the Component items it no longer allows, and an empty list allows every Component |
| `fieldChanges` and `componentFieldChanges` | `slugFormatChanged` | major | A `slug` field's `separator`, `lowercase` or `decamelize`, which re-canonicalises every value it holds |
| `fieldChanges` and `componentFieldChanges` | `added` | minor | A field definition the released state does not hold |
| `fieldChanges` and `componentFieldChanges` | `isNotRequiredToRequired` | minor | A field definition that was optional is required |
| `fieldChanges` and `componentFieldChanges` | `isNotUniqueToUnique` | minor | A field definition that could repeat a value is unique |
| `fieldChanges` and `componentFieldChanges` | `labelChanged` | patch | The field definition's `label` |
| `fieldChanges` and `componentFieldChanges` | `descriptionChanged` | patch | The field definition's `description` |
| `fieldChanges` and `componentFieldChanges` | `defaultValueChanged` | patch | The field definition's `defaultValue`, where both versions carry one |
| `fieldChanges` and `componentFieldChanges` | `inputWidthChanged` | patch | The field definition's `inputWidth` |
| `fieldChanges` and `componentFieldChanges` | `isDisabledChanged` | patch | The field definition's `isDisabled` |
| `fieldChanges` and `componentFieldChanges` | `minMaxLoosened` | patch | `min` fell, `max` rose, or either lost its bound, on the same field types as `minMaxTightened` |
| `fieldChanges` and `componentFieldChanges` | `ofFieldDefinitionsChanged` | patch | A `slug` field's `ofFieldDefinitions`, a generation hint that never rewrites a stored value |
| `assetChanges` | `deleted` | major | The Asset is gone |
| `assetChanges` | `added` | minor | An Asset the released state does not hold |
| `assetChanges` | `binaryChanged` | patch | The Asset's `extension`, `mimeType` or `size` |
| `assetChanges` | `metadataChanged` | patch | The Asset's `name` or `description` |
| `entryChanges` | `deleted` | major | The Entry is gone |
| `entryChanges` | `added` | minor | An Entry the released state does not hold |
| `entryChanges` | `modified` | patch | The Entry's values |

Every row compares the released state against the current `draft`, never the commits in between, so a rename and its undo inside one `draft` is no change at all. A Collection or Component added since the last Release is reported as `added` alone, whatever its slug did afterwards.

A Component's field definition can be neither unique nor a `slug` field, so the four rows that need one of those reach `fieldChanges` alone.

## What a major Release asks of a consumer

A major Release says a name or a shape your build is written against changed. Nothing holds it back from your build, so read it as a warning rather than a gate:

- Provisioning the `release` channel, the default, lands on the newest Release whatever its bump, so the next build takes a major one like any other.
- Pin the exact version you have, in the integration config or through `--ref` on `elek provision`, to decide yourself when to move. See [`provisioning.md`](./provisioning.md#channels-and-pinned-versions).
- Run `elek generate:types` and `elek generate:client` against the new Release and fix what stops compiling.
- `elekCollections()` names each Astro collection after the Project alias and the Collection's plural slug, so a renamed Collection renames the name `getCollection()` takes.

`prepare()` reports every change behind the bump, so whoever cuts the Release sees what it asks of a consumer before publishing it.

## create(): cutting a release

`create()` fetches `origin` if set, computes what `prepare()` would and refuses to proceed if there is nothing to release (`PreconditionFailed`). Otherwise it:

1. switches to `main`, first moving it to the remote's `main` when that is the released state,
2. merges `draft` into `main`,
3. writes the `nextVersion` into `project.json` and commits it (commit method `release`),
4. creates an annotated git tag carrying `Type: release` and `Version: <nextVersion>`,
5. switches back to `draft` and merges `main` back in (so both branches share the version commit),
6. pushes `main`, `draft` and the new tag to `origin` in one atomic push, if a remote is set.

A Release is the publish moment: the push makes the released content available to consumers that read from the remote, such as CI builds. A Project without a remote releases locally, nothing is pushed.

```typescript
const result = await core.releases.create({ projectId: project.id });
// result.version -> '1.1.0'
// result.diff    -> the ReleaseDiff that was released
```

After a full release, the Project's `version` field is identical on `draft` and `main`.

## createPreview(): pre-release snapshots

`createPreview()` also fetches `origin` if set, computes what `prepare()` would and requires changes, but it never touches `main`. It computes a pre-release version by counting the existing `preview` tags for the same target version since the last full release, then:

1. writes the preview version (for example `1.1.0-preview.3`) into `project.json` on `draft` and commits it,
2. creates an annotated tag carrying `Type: preview` and `Version: <previewVersion>`,
3. pushes `draft` and the tag to `origin` in one atomic push, if a remote is set.

Previews are snapshots of the current `draft` state for testing or sharing. Only `create()` promotes content into `main`.

## The atomic push

With a remote, a Release publishes its refs in one `git push --atomic`. The remote takes every ref or none, so a rejected ref leaves it as it was, and the Release unwinds like any failed one. The exception is a ref the remote hides with git's `receive.hideRefs`, which git refuses on its own while the other refs land.

| Case | What Core does |
| --- | --- |
| The remote's `draft` advanced since the fetch | The push is rejected as non-fast-forward, `PreconditionFailed`. Synchronize and release again. |
| The remote declines one ref, for example in a hook | No ref lands, `Internal` carrying git's output. |
| The remote has no `draft` | The push creates it. |
| The remote does not support atomic pushes | git refuses before sending anything, `PreconditionFailed`. |

Core does not fall back to separate pushes on a remote without atomic pushes, because a push that lands `main` without `draft` breaks the rule a Release keeps. Releasing to such a remote needs a git host that supports them.

Connected to a new, empty remote, a Project synchronizes before its first Release there. The first push of `synchronize()` sends `main`, `draft` and the tags of every earlier Release, see [`git-and-sync.md`](./git-and-sync.md#the-first-push). A Release sends only its own tag, and a preview Release sends `draft` without `main`.

## When a release fails partway

A release is a transaction you retry, not a state you resume. There is no public call that finishes a half-made release, so both `create()` and `createPreview()` undo what they already did before the error reaches you:

- a tag they created is deleted,
- every branch they moved is reset to the commit it was on,
- a local `main` that `create()` made for the Release is deleted again,
- the Project is left checked out on `draft`.

A failed push unwinds too, so a release is never left made-but-unpublished. Retry the same call once the remote is reachable and it produces the release the failed attempt would have.

The push is atomic, so a rejected one landed nothing. What recovery cannot reach is a push the remote applied while its answer was lost, for example to a dropped connection. `core.releases.list()` reads local tags, so compare against the remote when a push failed on the network.

Recovery itself is best effort: a step that fails is logged at `warn` and the error you get is still the one that caused the failure, never one raised while undoing it. If those warnings appear, the Project needs a manual `git reset`.

## Reading releases

`core.releases.list()` returns the Releases and preview Releases of a Project, newest first. Each item carries the `version`, its `type` (`release` or `preview`), the `datetime`, and the `tagId` addressing it in git.

```typescript
const { list, total } = await core.releases.list({ projectId: project.id });
// list[0] -> { version: '1.1.0', type: 'release', datetime: '...', tagId: '...' }
```

Underneath, Releases, previews and Core upgrades are git tags, read through `core.git.tags`:

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

The Project's `version` field follows [Semantic Versioning](https://semver.org/) and is the value a release writes. `main` holds the released version. `draft` tracks it after a full release and carries pre-release versions (`-preview.N`) in between.

## See also

- [`git-and-sync.md`](./git-and-sync.md) - the `main` / `draft` branch model and tags
- [`schema-changes.md`](./schema-changes.md) - how the field-definition changes a release reports actually transform content
- [`concepts.md`](./concepts.md) - Releases in the overall data model
