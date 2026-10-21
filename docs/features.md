# Features

A capability reference for elek.io Core - what the content engine does, grouped by the questions a developer evaluating a CMS tends to ask. Each entry links to the deep-dive doc where relevant.

For the data model these features operate on, see [`concepts.md`](./concepts.md).

## Storage & data ownership

- **Git-backed JSON storage** - every Project is a git repository of plain, human-readable JSON files. Content is diffable, greppable and reviewable like code.
- **No lock-in** - there is no proprietary database. The files on disk are the source of truth. You can read, back up or migrate them without Core.
- **Offline-first** - Core runs fully locally and needs no server to create, edit or read content.
- **Asset storage** - binary Assets are stored via Git LFS (a pointer in history, the bytes in the local LFS store) plus a JSON sidecar holding metadata (size, MIME type, dimensions, etc.). See [`git-and-sync.md`](./git-and-sync.md#git-lfs).

## Content modeling

- **Collections** - typed schemas (field definitions) every Entry must follow.
- **Components** - reusable, named bundles of field definitions shared across Collections. Updating a Component propagates to every Collection that references it.
- **18 field types across 6 value types** (`string`, `number`, `boolean`, `reference`, `component`, `mdast`) - including dedicated validated string types (`email`, `url`, `ipv4`, `telephone`), separate `date` / `time` / `datetime`, `range`, `select` (string or number), and a `slug` type that stores an always-unique, URL-friendly value. See [`fields.md`](./fields.md).
- **References** - `asset` and `entry` reference fields, polymorphic via `ofCollections`, with cardinality controlled by `min` / `max`.
- **Polymorphic blocks** - the `dynamic` field composes Components into page-builder-style content, restricted by `ofComponents` or fully open.
- **Layout & constraints** - presentational field grouping, a 12-column `inputWidth` grid hint, and per-field `isRequired` / `isUnique` / `isDisabled` / `defaultValue`. `isUnique` is enforced per language within a Collection on every write (see [`fields.md`](./fields.md#uniqueness)).

## Internationalization

- **Translatable by default** - every direct value is multilingual out of the box. No plugin, junction table or special configuration.
- **Project-scoped languages** - each Project declares its supported languages, chosen from 24 supported language codes.
- **Language-aware validation** - content must carry a value for every language the Project supports. Missing translations fail validation.
- **Narrowed generated types** - generated clients and types narrow translatable content to the Project's languages (`Record<ProjectLanguage, T>`) rather than the broad superset.

## Type safety & validation

- **Schema-driven validation** - Zod schemas are generated from field definitions and enforce structure, constraints and references at write time.
- **Boundary validation** - every public service method validates its input against a schema before running.
- **Typed errors** - failures throw a `CoreError` carrying a typed variant and HTTP status code. See [`error-handling.md`](./error-handling.md).
- **End-to-end TypeScript** - schemas, services and generated artifacts are fully typed.

## Versioning & history

- **Full git history** - read any object as it existed at any commit, not just the latest version.
- **Migration on read** - historical data is run through the migration chain on read, so it always comes back in the current schema shape. See [`usage.md`](./usage.md#reading-from-history).
- **Transactional writes** - create / update / delete operations are wrapped in an automatic git rollback that restores the working tree on failure. See [`error-handling.md`](./error-handling.md).
- **Releases** - tagged snapshots of a Project at a point in time, managed through git tags.
- **A version computed from the content** - a Release diffs the draft against the released state and takes its semver bump from what changed, so a renamed Collection or Component arrives as a major. See [`releases.md`](./releases.md#how-the-bump-is-decided).
- **Branching** - content edits happen on a `draft` branch, with `main` reserved for released content.

## Schema evolution

- **Version-aware migrations** - each entity type (Project, Asset, Collection, Component, Entry) has its own migration chain that transforms outdated files to the current schema.
- **Project upgrade flow** - `ProjectService.upgrade()` migrates an entire Project and all its objects across Core versions on an isolated branch, then squash-merges the result.

## Consuming content

- **Programmatic API** - a Node library (`ElekIoCore`) exposing services with a consistent CRUD shape. See [`usage.md`](./usage.md).
- **Local REST API** - a read-only Hono + OpenAPI server with an interactive Scalar reference UI, for building static sites and apps against local content.
- **Generated API clients** - typed JavaScript / TypeScript clients (ESM or CJS) via `elek generate:client`.
- **Generated TypeScript types** - type definitions emitted directly from Project content models via `elek generate:types`.
- **Astro integration** - one `defineElekConfig()` declaration names every Project a site consumes, `elekCollections()` derives an Astro collection per elek.io Collection from it, and `elekAssetsLoader()` / `elekEntriesLoader()` stay available for declaring collections by hand. Plus a `mdastRender` helper, all from `@elek-io/core/astro`.
- **Provisioning** - the `elek()` Astro integration and `elek provision` provision Projects from their remotes into build environments, e.g. CI runners. See [`provisioning.md`](./provisioning.md).
- **JSON export** - export Projects to JSON (nested or separate files) via `elek export`, with a `--watch` mode for automatic re-exports.

## Rich content

- **Structured rich text** - the `markdown` field stores a typed mdast tree, not an HTML blob or markdown string.
- **First-class references** - Asset and Entry references are typed mdast nodes carrying UUIDs, not opaque URLs, so consumers resolve them however they like.
- **Per-field feature allowlist** - each `markdown` field controls exactly which node types (headings, tables, footnotes, raw HTML, links, images, etc.) are accepted. Disallowed nodes are rejected before they reach disk.
- **Safe by construction** - exotic URL schemes (`javascript:`, `data:`, ...) are rejected at the schema layer, and a tree depth limit guards against pathological nesting.
- **Framework-agnostic rendering** - an exhaustively-typed renderer primitive ships with an Astro binding. Other frameworks supply one handler per node type. See [`markdown-content.md`](./markdown-content.md).

## Collaboration & sync

- **Any git provider** - synchronize content by pushing and pulling against GitHub, GitLab, Bitbucket or any git remote that supports LFS.
- **Remote management** - set the remote origin, inspect commits ahead/behind, and synchronize through Core's git service.
- **Offline-first collaboration** - work locally and sync when you choose. There is no always-on server in the loop.

## Limitations

Core tries to keep a relatively small, predictable surface. Some of the items below are deliberate design choices and some are simply not built yet, so they are split accordingly.

### Not yet implemented

- **No full-text search** - a `searchProjectSchema` is defined, but there is no `search()` service method or API route behind it.
- **No conditional fields** - a field's visibility cannot depend on another field's value.
- **Limited specialized field types** - no arbitrary JSON, color picker, geospatial, code-editor, or password / hash field types.
- **Not every field property reaches a Release diff** - eight property and field type pairs are unclassified, so changing one of them alone leaves the bump at the patch default. See [`releases.md`](./releases.md#every-change-a-diff-can-carry) for what a diff does carry.
  - The pairs are a `markdown` field's `ofCollections`, `ofAssetMimeTypes`, `features`, `min` and `max`, a `dynamic` field's `min` and `max`, an `asset` field's `ofAssetMimeTypes`, and a `numberSelect` or `stringSelect` field's `options`.
  - A `numberSelect` field declares `min` and `max` as `null` and can never hold a bound, so a diff that reports no bound change for it is right rather than a ninth gap.
  - A `dynamic` field's `ofComponents` is compared as declared, so replacing an empty list with an explicit one is reported, even though an empty list already allows every Component.

### Intentional constraints

- **A Project is changed through Core only** - git run by hand, another git client or an editor writing a Project's files is not supported, and Core does not guard against it. Reading the files with any tool is safe. See [`git-and-sync.md`](./git-and-sync.md#change-a-project-only-through-core).
- **Git LFS requires an LFS-capable remote** - Asset binaries are tracked with Git LFS, so the remote you push to must support it. A remote without LFS (for example a self-hosted server with it disabled) fails the push with a descriptive `PreconditionFailed` error. See [`git-and-sync.md`](./git-and-sync.md#git-lfs).
- **Field-definition `id`s are caller-supplied** - Core generates ids for entities (Collections, Components, Entries, Assets) but deliberately not for the field definitions inside them. You pass a UUID per field definition (for example via `uuid()`) on both create and update.
  - Generating them in Core was considered and rejected. It would need parallel id-less schema variants and only partly helps, because update must still identify existing field definitions by id.
  - On update, field definitions are matched by `id`. Send back the `id` of every field definition you want to keep and Core preserves the Entry data stored under it across slug renames and type changes.
  - A field definition whose `id` is missing or changed counts as new, so the old one, and the Entry data keyed to it, is removed. Always round-trip the ids you read.
- **One-way references only** - no many-to-many, back-references, or reverse / virtual joins. The inverse of a reference is not maintained.
- **Reference protection ignores field `defaultValue`s** - an Asset or Entry reference embedded in a Collection or Component field's markdown `defaultValue` is not counted as a reference, because it only becomes a live reference once stamped into an Entry.
- **No computed or virtual fields** - field values are static, with no derive-from-other-fields mechanism. The `slug` field's `ofFieldDefinitions` is the one nuance: it is a soft generation hint the editor uses to pre-fill the slug from other fields, but the stored value stays static and user-editable, so Core never derives or binds it.
- **Uniqueness is single-field and Collection-scoped** - `isUnique` (and the always-unique `slug` type) enforce that one field's value is unique within a Collection, per language. There is no compound uniqueness such as "unique slug per category", the per-language pairing is the only built-in composite.
  - Enforcement scans the Collection's Entries on each write rather than reading a persisted index. That keeps it correct against Entries brought in by a pull or merge, but costs one read per existing Entry per write, so it scales poorly for very large Collections.
- **No uniqueness inside Components** - `isUnique` and the `slug` type are rejected on Component field definitions. A Component is reused across Collections and can repeat within an Entry, so the scope of "unique" there is ambiguous; it is deliberately deferred rather than shipped with surprising semantics.
- **The data directory has to stay short on Windows** - Windows resolves paths against a 260 character limit unless long paths are enabled. Core stores an Entry at `projects/<uuid>/collections/<uuid>/<uuid>.json` and Git LFS stores its objects at a comparable depth, so it needs about 137 characters below the data directory.
  - A data directory beyond roughly 120 characters runs out of room, and file operations fail with `ENAMETOOLONG`.
  - Core does not validate this. The limit depends on the platform and on whether long paths are enabled, so a fixed cap would reject setups that work. Keep `ELEK_IO_DATA_DIR` short instead, see [`usage.md`](./usage.md#environment-variables).
  - macOS and Linux allow 1024 and 4096 characters and are not affected.
- **Astro dev picks up content changes but not model changes** - the loaders reload Entries and Assets while `astro dev` runs, so editing content in the Desktop app updates the open page.
  - Editing the content model itself, a Collection's field definitions, a Component or a Project's languages, needs a dev server restart. Astro builds a collection's schema and TypeScript types once when it loads the content config and offers no way to rebuild them in place.
  - The loaders detect it and log what to do rather than reloading against a stale schema. See [`usage.md`](./usage.md#local-development).
- **Astro's `render()` does not apply to Entries** - a `markdown` field arrives on `entry.data` as an mdast tree, not as the rendered HTML `render(entry)` and `<Content />` read, so the loaders leave Astro's rendered slot empty.
  - Filling it would flatten `entryReference` and `assetReference` nodes into finished markup and lose the UUIDs a page resolves them by, which is the reason to store a tree in the first place.
  - Calling `render()` on an Entry is not an error and renders nothing at all, so reach for `mdastRender` instead. See [`markdown-content.md`](./markdown-content.md#rendering-markdown-content-in-astro).
- **A major Release warns, it does not gate** - a build that provisions the `release` channel lands on the newest Release of a Project whatever its bump, so a major one reaches it like any other. A channel that stays within a major is not built yet. Pin an exact version to decide yourself when to move. See [`releases.md`](./releases.md#what-a-major-release-asks-of-a-consumer).
- **No plugin or marketplace system** - extending the field catalogue means changing code, not installing a package.
- **No nested composition** - groups cannot nest groups, and `dynamic` fields cannot nest `dynamic` fields. Components are the flat, predictable reuse mechanism.
- **A log tail can be truncated** - `core.logger.tail()` stops collecting at a size ceiling and sets `isTruncated`, dropping the oldest records first. Collapsing repeated records is what keeps a tail small, and it is worth far more than a bigger cap, so the ceiling is a safety valve rather than a working limit. See [`usage.md`](./usage.md#the-log-tail) for the ceiling and what `isTruncated` means.
- **A log tail can be missing its last lines** - winston hands a record to a write stream and offers no per transport flush, so a tail collected right after a crash can stop short of the lines it was collected for, which are usually the interesting ones.
  - `tail()` writes a marker and yields before reading to give the stream a chance to drain. That is a hedge rather than a fix, and the residual gap is documented instead of engineered around.

## See also

- [`concepts.md`](./concepts.md) - the data model behind these features
- [`usage.md`](./usage.md) - how to use Core programmatically, via the API, CLI and Astro
- [`fields.md`](./fields.md) - full field type reference
- [`references.md`](./references.md) - how references work end to end, including write-time and delete-time integrity
- [`schema-changes.md`](./schema-changes.md) - how editing field definitions cascades into existing content
- [`git-and-sync.md`](./git-and-sync.md) - the branch model and synchronizing with a remote
- [`releases.md`](./releases.md) - tagged snapshots and promoting `draft` into `main`
- [`asset-management.md`](./asset-management.md) - the two-file Asset model
- [`storage-layout.md`](./storage-layout.md) - where Projects and their files live on disk
- [`local-api.md`](./local-api.md) - the read-only REST API reference
- [`api-clients.md`](./api-clients.md) - generating typed clients and TypeScript types
- [`export.md`](./export.md) - exporting Projects to JSON
- [`markdown-content.md`](./markdown-content.md) - rich `markdown` content storage and rendering
- [`error-handling.md`](./error-handling.md) - `CoreError` and error patterns
