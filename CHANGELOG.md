# @elek-io/core

## 0.19.1

### Patch Changes

- b02e71a: Ship the consumer documentation inside the published package

  The package now includes its consumer documentation under `docs/`, available offline and matched to the installed version at `node_modules/@elek-io/core/docs/` with no network lookup. This lets developers and AI coding agents work from accurate, version-matched references. Start at `docs/index.md`, and see the README's "Using Core with AI agents" section for how to point an agent at them.

  Documentation is now split by audience. Consumer docs live in `docs/` and ship with the package. Contributor and design docs live in `contributing/` and are not published, so a few docs moved there (testing, language-scoped validation, migration and history flow, how to add a field type, error-handling internals, and the cross-CMS comparison).

- 76ab883: Fix Asset binary loss when replacing a file with one of the same extension

  Replacing an Asset's file through `update` with a `newFilePath` of the same extension deleted the binary it had just written, because the previous and new paths in `lfs/` were identical. The previous binary is now removed only when the extension actually changes. Listing and counting Assets also enumerate the JSON metadata in `assets/` instead of the `lfs/` binaries, so an Asset whose binary is missing or not yet fetched stays listed and recoverable rather than disappearing.

- 1ffe2d2: Update dependencies to their latest versions

  All runtime and development dependencies are updated to their latest published versions and pinned to exact versions. `@types/node` stays on the Node 24 LTS line (24.13.2) to match the supported runtime rather than moving to a non-LTS release. The `dugite` peer dependency moves to 3.2.2.

## 0.19.0

### Minor Changes

- 15676fa: Store Asset binaries with Git LFS so the repository no longer grows by the full file size on every version
- 5671f5c: Protect Assets and Entries from deletion while still referenced

  Deleting an Asset or Entry that is still referenced by another Entry's values now fails with a `Conflict` error instead of silently leaving dangling references, mirroring the existing Component delete protection. References are detected in flat `reference` fields, in `assetReference` / `entryReference` nodes inside `mdast` fields, and nested inside `dynamic` / component items. The error's `cause` carries the list of referring Entries, each annotated with the offending field and, for nested cases, the component path.

  As part of the same fix, write-time reference validation now also descends into `dynamic` / component items, so a broken reference stored inside a component block is caught on Entry create and update rather than slipping through.

- 5671f5c: Protect Collections from deletion while their Entries are still referenced

  Deleting a Collection that still has Entries referenced by another surviving Entry now fails with a `Conflict` error instead of silently leaving dangling references, mirroring the Asset, Entry and Component delete protection. Detection is a single on-demand scan over the Entries outside the Collection, matching any reference that points into it (every Entry reference carries its Collection id), across flat `reference` fields, `entryReference` nodes inside `mdast` fields, and references nested inside `dynamic` / component blocks. References between Entries that are all being deleted together, including an Entry that references only itself, do not block, since they vanish cleanly. The `Conflict` carries the same `ReferencingEntry` list as the single-entity guards, so consumers get one error contract across all deletes.

  A direct reference to a Collection as a whole is also detected and blocked as a defensive measure, even though no field type produces one. Only the current `work` tree is considered, not entities preserved in released (`production`) history.

- 2f5399b: Block synchronize from pushing dangling references, and never leave the repository mid-rebase

  `ProjectService.synchronize` now integrates the remote with a controlled rebase and validates the whole integrated `work` tree before pushing. If a rebase combined two individually valid changes (a delete on one side, a new reference to that target on the other) into a dangling reference, the sync stops with a `Conflict` listing the dangling references and does not push, so the shared remote never receives a dangling state. The integrated commits stay in the local tree to repair through Core's own delete or update, then sync again. This closes the one reference-integrity case the per-operation write and delete gates cannot catch, and holds because Projects are reconciled only through Core's `synchronize`, run locally.

  Detection is a new forward scan, `EntryService.findDanglingReferences`, reusing the same on-demand reference walker as delete protection across flat `reference` fields, `assetReference` / `entryReference` nodes inside `mdast` fields, references nested in `dynamic` / component blocks, and whole-collection references. A `Conflict` carries a plain `DanglingReference[]` cause, mirroring the delete guards' `ReferencingEntry[]`.

  The surrounding transaction is hardened too: a textual rebase conflict aborts cleanly and surfaces a descriptive `PreconditionFailed` instead of leaving the repository mid-rebase, a sync refuses to run against an uncommitted working tree, and the push is retried on a non-fast-forward rejection. Conflict and rejection states are classified with dugite's own `GitError` codes rather than bespoke output parsing. Only the current `work` tree is considered, not released (`production`) history.

## 0.18.1

### Patch Changes

- 372cef1: Upgraded to pnpm 11. Migrated build script approval from the removed `onlyBuiltDependencies` and `ignoredBuiltDependencies` fields to the new `allowBuilds` map, keeping dugite's build enabled and esbuild and sharp disabled.

## 0.18.0

### Minor Changes

- e63f583: Richer content modeling and a typed client workflow:
  - **Markdown fields** (`markdown` field type) store structured content (mdast) instead of raw strings, with per-field toggles for which features are allowed (headings, lists, tables, emphasis, links, images, and references to Assets/Entries). New framework-agnostic `mdastRender` and `extractText` helpers, plus an Astro renderer (`@elek-io/core/astro`), turn that content into your own markup.
  - **Components** are reusable, separately-defined sets of field definitions that you embed in Collections (or other Components) through `dynamic` fields, so a single field can hold an ordered list of mixed component blocks. Replaces the previous shared-value approach.
  - **Select fields** (`select` field type) let editors pick from predefined string or number options with translatable labels.
  - **Field definition groups** organise fields into named fieldsets for display in the UI without affecting stored data.
  - **Type generation**: a new `elek generate:types` CLI command emits project-scoped TypeScript types, and the generated API client now accesses Collections by slug and understands nested Component values.
  - **Language-scoped validation**: translatable content (names, labels, entry values) is validated against the Project's supported languages, and generated types narrow to `Record<ProjectLanguage, T>`.
  - **Automatic Entry migration**: changing a Collection's or Component's field definitions migrates existing Entries automatically where the change is unambiguous, and otherwise returns a list of issues for you to resolve and re-apply.
  - **Safer writes**: a failed operation now rolls back to a clean git working tree.

## 0.17.0

### Minor Changes

- 82c88f7: - Git commit messages now use human-readable subject lines with git trailers (Method:, Object-Type:, Object-Id:, Collection-Id:) instead of JSON.stringify
  - Git tag messages use a typed GitTagMessage discriminated union (release, preview, upgrade) serialized as git trailers (Type:, Version:, Core-Version:)
  - Removed releaseTypeSchema and releaseTagMessageSchema from releaseSchema.ts — tag message typing now lives in gitSchema.ts
  - Tightened Zod schemas: commit hash uses z.hash('sha1'), datetimes use z.iso.datetime(), migrateProjectSchema uses z.looseObject()
  - Fixed email truncation bug in GitTagService.list() caused by a redundant slice(0, -1)
  - Added pipe-character validation on gitSignatureSchema.name to prevent delimiter collision in parsed output
  - Changed parseTagTrailers to return null and log a warning for unrecognized tag types instead of throwing
- d2ea641: Separated git history from CRUD return values for improved performance. `history` and `fullHistory` are no longer included on `Project`, `Collection`, `Entry`, and `Asset` objects. Use the new `history()` method on each service instead (e.g. `core.projects.history({ id })`, `core.entries.history({ projectId, collectionId, id })`).
- cf284a4: - Access entry values by meaningful names: `entry.values.title` instead of `entry.values.find(v => v.fieldDefinitionId === '550e8400-...')`
  - Reference collections by slug in API routes: `/collections/blog-posts/entries` instead of `/collections/550e8400-.../entries` and the astro integration
- 4b88413: New `ReleaseService` that diffs the `work` branch against `production` to detect collection and field definition changes, computes the appropriate semver bump (major/minor/patch), and supports creating full releases and preview releases with git tags.
- 3bcda72: - Added a migration chain for outdated files (reading from git history and upgrading to the latest schema version)
  - Added documentation for the migration and history-reading flow in `docs/migration-and-history-flow.md`

## 0.16.2

### Patch Changes

- 7d76c26: Support Astro v6, dropped support for astro v5 since astro v5 zod v3 is not compatible with our zod v4 codebase

## 0.16.1

### Patch Changes

- 514a682: fix: do not bundle dugite CJS into Core

## 0.16.0

### Minor Changes

- 06fc63a: Added Astro loader & changed export CLI command

## 0.15.3

### Patch Changes

- 9046c56: fix: no partial project updates and creates

## 0.15.2

### Patch Changes

- dbdbd98: All tests are now run sequentially to ensure git working as expected. Also fixed rogue Project after test run not getting deleted.
- 2539cf9: Core can now export one or multiple projects in one or multiple JSON files
- 3bb661a: Refactored local API using Scalar and added CLI commands for generating an TS/JS API Client and exporting Projects to a JSON file. Switched from tsup to tsdown.

## 0.15.1

### Patch Changes

- 1f83621: Fix: OpenApi function usage on schemas
- 350388e: Fix: Refactor schema imports to use @hono/zod-openapi

## 0.15.0

### Minor Changes

- 418faa4: Refactored existing schema generation via fieldDefinition and added schema generation for create and update methods of the Entry service

## 0.14.4

### Patch Changes

- 17a51df: Upgraded to zod v4

## 0.14.3

### Patch Changes

- 401906f: Fix: same export for Node and Browser

## 0.14.2

### Patch Changes

- b0df691: Upgraded dependencies
- db8f71b: Git pull now tries to rebase first to reduce merge commits

## 0.14.1

### Patch Changes

- b28ba2d: Updated GitHub action runner

## 0.14.0

### Minor Changes

- 62bb27e: Made all API methods async to return Promisses for easier use in IPC. Git signature type now expects the email to actually be one instead of any string. Removed window object inside the Users config file.

## 0.13.0

### Minor Changes

- 1b1c0ce: Added local API endpoints for Projects, Assets, Collections and Entries. Also added custom logger middleware that uses our LogService.
  Removed the ability to directly resolve Entry reference Values - this needs to now be handled Client-side.

## 0.12.0

### Minor Changes

- 6e283f3: Added first local API routes to test inside elek.io Client

## 0.11.1

### Patch Changes

- 609cd30: fix: reading multiple Assets with the same ID but different commit hashes from history, do not overwrite each other anymore

## 0.11.0

### Minor Changes

- 9b3afaa: Git messages are now stringified JSON containing more information about the operation like the object type and ID.
  Git commits now contain the tag objects directly, instead of just the reference.
  Projects now have a "production" and a "work" branch.
  Returned Projects now contain remoteOriginUrl without the need of calling this method separately.
  Projects now have a protection against deletion if there is no remote yet or the local Project has changes not present on the remote yet.
  If Projets have to be deleted anyway, there now is a "force" option to do so.
  Changed Project upgrade to work with an additional upgrade branch and then squash merge it back into work branch.
  Removed old file based upgrade.
  Added git merge and branch delete method.
  Added support for most file types to be used as Assets.
  Added more tests and converted clone related tests from using a remote Github repository to a local one.
  Removed return for logging methods and added timestamp to CLI output.

## 0.10.0

### Minor Changes

- cc6a1a4: Removed unused options and added file cache option
- 2b3f3b5: Added history key to all objects (Project, Asset, Collection and Entry) and the `read` method of their services now support reading from history by providing a commit hash. Also added `save` method for Assets to let the user copy given file somewhere to his filesystem. This also works for Assets from history.
- 9b79cac: Changed the way the `upgrade` method for Projects work by migrating objects on disk directly. Reading from history also applies this migration step to comply with the current schema.

### Patch Changes

- 938c0a1: Added logging
- 17dbf20: Added matrix testing on all supported platforms and fixed EOL and path seperation issues with git commands in windows.
- 2605542: Removed usage of LFS and improved git command logging

## 0.9.1

### Patch Changes

- fa234b7: Removed displayId from user file

## 0.9.0

### Minor Changes

- a2a7b7a: Assets do not have a language anymore
- 5dec07b: The Users window position and size is saved between application launches

## 0.8.0

### Minor Changes

- a8db4a5: Value input types are now called Field types. Value definitions are now called Field definitions

## 0.7.0

### Minor Changes

- d5fc359: Switched to a different slug generating dependency and updated all dependencies
- 27e16e9: Using datetime instead of timestamp for created and updated fields as well as git log and git tags --list results

### Patch Changes

- 13b4626: Fixed import for browser environments and added ElekIoCore type export to it

## 0.6.0

### Minor Changes

- dd365e3: Now only exports ESM - electron and the browser should now be able to handle it and it resolves issues with dependencies while exporting CJS

## 0.5.4

### Patch Changes

- daf5f50: fix: EXPORT_TYPES_INVALID_FORMAT

## 0.5.3

### Patch Changes

- 03dd60a: Removed unused code

## 0.5.2

### Patch Changes

- 8114ca1: fix: properly export for node and browser environments

## 0.5.1

### Patch Changes

- 45d5de4: Optimized imports

## 0.5.0

### Minor Changes

- a923ef7: Separated entry points for node and browser. Simplified imports by providing exports via index.ts for errors and services

## 0.4.2

### Patch Changes

- b56c625: Added missing export of shared functions

## 0.4.1

### Patch Changes

- a0293cd: Added missing export of schema files

## 0.4.0

### Minor Changes

- 7c56031: Added git methods for working with branches, remotes, pull, fetch and push. The ProjectService can now determine changes between the local Project and it's remote origin and synchonize (pull & push) between them.
- 71efc35: Removed search, filter and sort
- 7c56031: Updated shared lib to 0.6.2 - moving from optional keys that could be undefined to nullable values and changing the structure of Entry Value references and their resolved counterparts

## 0.3.1

### Patch Changes

- a2be0a5: Updated shared lib to 5.0.1

## 0.3.0

### Minor Changes

- e691b5d: Updated shared lib to 0.5.0. Added Entry references and removed sharedValues for now.

## 0.2.1

### Patch Changes

- b0bd8c1: Updated shared lib to 0.4.7

## 0.2.0

### Minor Changes

- c517e48: Entries now have Values directly attached which is the default now. Additionally it's possible to use shared Values between n Entries, which are referenced by ID and language inside the Entry. Also Entries resolve shared Values now automatically
- 7a93e5c: Entries now have direct Values and referenced Values (Assets and shared Values) that are resolved when the Entry is requested

## 0.1.1

### Patch Changes

- db49cc6: Environment is now based on passed param instead of NODE_ENV
