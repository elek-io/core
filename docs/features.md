# Features

A capability reference for elek.io Core - what the content engine does, grouped by the questions a developer evaluating a CMS tends to ask. Each entry links to the deep-dive doc where relevant.

For the data model these features operate on, see [`concepts.md`](./concepts.md). For a cross-CMS comparison against Strapi, Directus, Payload and TinaCMS, see [`comparisons/fields.md`](./comparisons/fields.md).

## Storage & data ownership

- **Git-backed JSON storage** - every Project is a git repository of plain, human-readable JSON files. Content is diffable, greppable and reviewable like code.
- **No lock-in** - there is no proprietary database. The files on disk are the source of truth. You can read, back up or migrate them without Core.
- **Offline-first** - Core runs fully locally and needs no server to create, edit or read content.
- **Asset storage** - binary Assets are stored via Git LFS (a pointer in history, the bytes in the local LFS store) plus a JSON sidecar holding metadata (size, MIME type, dimensions, etc.). See [`git-and-sync.md`](./git-and-sync.md#git-lfs).

## Content modeling

- **Collections** - typed schemas (field definitions) every Entry must follow.
- **Components** - reusable, named bundles of field definitions shared across Collections. Updating a Component propagates to every Collection that references it.
- **17 field types across 6 value types** (`string`, `number`, `boolean`, `reference`, `component`, `mdast`) - including dedicated validated string types (`email`, `url`, `ipv4`, `telephone`), separate `date` / `time` / `datetime`, `range`, and `select` (string or number). See [`fields.md`](./fields.md).
- **References** - `asset` and `entry` reference fields, polymorphic via `ofCollections`, with cardinality controlled by `min` / `max`.
- **Polymorphic blocks** - the `dynamic` field composes Components into page-builder-style content, restricted by `ofComponents` or fully open.
- **Layout & constraints** - presentational field grouping, a 12-column `inputWidth` grid hint, and per-field `isRequired` / `isUnique` / `isDisabled` / `defaultValue`.

## Internationalization

- **Translatable by default** - every direct value is multilingual out of the box. No plugin, junction table or special configuration.
- **Project-scoped languages** - each Project declares its supported languages, chosen from 24 supported language codes.
- **Language-aware validation** - content must carry a value for every language the Project supports. Missing translations fail validation. See [`language-scoped-validation.md`](./language-scoped-validation.md).
- **Narrowed generated types** - generated clients and types narrow translatable content to the Project's languages (`Record<ProjectLanguage, T>`) rather than the broad superset.

## Type safety & validation

- **Schema-driven validation** - Zod schemas are generated from field definitions and enforce structure, constraints and references at write time.
- **Boundary validation** - every public service method validates its input against a schema before running.
- **Typed errors** - failures throw a `CoreError` carrying a typed variant and HTTP status code. See [`error-handling.md`](./error-handling.md).
- **End-to-end TypeScript** - schemas, services and generated artifacts are fully typed.

## Versioning & history

- **Full git history** - read any object as it existed at any commit, not just the latest version.
- **Migration on read** - historical data is run through the migration chain on read, so it always comes back in the current schema shape. See [`migration-and-history-flow.md`](./migration-and-history-flow.md).
- **Transactional writes** - create / update / delete operations are wrapped in an automatic git rollback that restores the working tree on failure. See [`error-handling.md`](./error-handling.md).
- **Releases** - tagged snapshots of a Project at a point in time, managed through git tags.
- **Branching** - content work happens on a `work` branch, with `production` reserved for released content.

## Schema evolution

- **Version-aware migrations** - each entity type (Project, Asset, Collection, Component, Entry) has its own migration chain that transforms outdated files to the current schema.
- **Project upgrade flow** - `ProjectService.upgrade()` migrates an entire Project and all its objects across Core versions on an isolated branch, then squash-merges the result. See [`migration-and-history-flow.md`](./migration-and-history-flow.md).

## Consuming content

- **Programmatic API** - a Node library (`ElekIoCore`) exposing services with a consistent CRUD shape. See [`usage.md`](./usage.md).
- **Local REST API** - a read-only Hono + OpenAPI server with an interactive Scalar reference UI, for building static sites and apps against local content.
- **Generated API clients** - typed JavaScript / TypeScript clients (ESM or CJS) via `elek generate:client`.
- **Generated TypeScript types** - type definitions emitted directly from Project content models via `elek generate:types`.
- **Astro integration** - `elekAssets()` / `elekEntries()` content loaders plus a `mdastRender` helper, from `@elek-io/core/astro`.
- **JSON export** - export Projects to JSON (nested or separate files) via `elek export`, with a `--watch` mode for automatic re-exports.

## Rich content

- **Structured rich text** - the `markdown` field stores a typed mdast tree, not an HTML blob or markdown string.
- **First-class references** - Asset and Entry references are typed mdast nodes carrying UUIDs, not opaque URLs, so consumers resolve them however they like.
- **Per-field feature allowlist** - each `markdown` field controls exactly which node types (headings, tables, footnotes, raw HTML, links, images, etc.) are accepted. Disallowed nodes are rejected before they reach disk.
- **Safe by construction** - exotic URL schemes (`javascript:`, `data:`, ...) are rejected at the schema layer, and a tree depth limit guards against pathological nesting.
- **Framework-agnostic rendering** - an exhaustively-typed renderer primitive ships with an Astro binding. Other frameworks supply one handler per node type. See [`markdown-content.md`](./markdown-content.md).

## Collaboration & sync

- **Any git provider** - synchronize content by pushing and pulling against GitHub, GitLab, Bitbucket or any git remote.
- **Remote management** - set the remote origin, inspect commits ahead/behind, and synchronize through Core's git service.
- **Offline-first collaboration** - work locally and sync when you choose. There is no always-on server in the loop.

## Extensibility & licensing

- **Code-level extension** - field types and behavior are defined in code (Zod schemas), giving full control without a runtime plugin layer.
- **Source-available and free** - Core is free to use and its source is available on GitHub.
- **Optional Cloud delivery** - pairs with elek.io Cloud for globally distributed content delivery, but Core itself requires no hosted service.

## Limitations

Core tries to keep a relatively small, predictable surface. Some of the items below are deliberate design choices and some are simply not built yet, so they are split accordingly. Note that several not-yet-implemented items are still surfaced in the API (a field option or schema exists) without the behavior behind them, so do not rely on them.

### Not yet implemented

- **`isUnique` is not enforced** - fields accept `isUnique: true`, but no service checks it on write, so duplicate values are not rejected.
- **No full-text search** - a `searchProjectSchema` is defined, but there is no `search()` service method or API route behind it.
- **No cloud authentication** - the `cloud` user type exists, but `UserService.set()` does not actually log a cloud user in (the login branch is a stub).
- **Delete does not protect Assets or Entries** - deleting a referenced Component is blocked, but deleting a referenced Asset or Entry is not, so dangling references can result. Renderers should handle missing references gracefully.
- **No slug / UID field type** - slugs are plain `text` fields you keep correct by hand (and, per above, `isUnique` does not guard them).
- **No conditional fields** - a field's visibility cannot depend on another field's value.
- **`synchronize()` has no conflict handling** - it pulls then pushes with no guard for uncommitted changes. A conflicting rebase surfaces as a generic `Internal` error and can leave the repository mid-rebase.

### Intentional constraints

- **Git LFS requires an LFS-capable remote** - Asset binaries are tracked with Git LFS, so the remote you push to must support it. A remote without LFS (for example a self-hosted server with it disabled) fails the push with a descriptive `PreconditionFailed` error. See [`git-and-sync.md`](./git-and-sync.md#git-lfs).
- **Field-definition `id`s are caller-supplied** - Core generates ids for entities (Collections, Components, Entries, Assets) but deliberately not for the field definitions inside them. You pass a UUID per field definition (for example via `uuid()`) on both create and update. Generating them in Core was considered and rejected: it would require maintaining parallel id-less schema variants and only partly helps, since update must still identify existing field definitions by id, so the convenience does not justify the added machinery. The practical contract on update is that field definitions are matched by `id`: send back the `id` of every field definition you want to keep and Core preserves the entry data stored under it across slug renames or type changes. A field definition whose `id` is missing or changed is treated as new, so the old one, and the entry data keyed to it, is removed. Always round-trip the ids you read.
- **One-way references only** - no many-to-many, back-references, or reverse / virtual joins. The inverse of a reference is not maintained.
- **No computed or virtual fields** - field values are static, with no derive-from-other-fields mechanism.
- **Limited specialized field types** - no arbitrary JSON, color picker, geospatial, code-editor, or password / hash field types.
- **No plugin or marketplace system** - extending the field catalogue means changing code, not installing a package.
- **No nested composition** - groups cannot nest groups, and `dynamic` fields cannot nest `dynamic` fields. Components are the flat, predictable reuse mechanism.

For how these compare to other CMS platforms and where Core leads, see [`comparisons/fields.md`](./comparisons/fields.md).

## See Also

- [`concepts.md`](./concepts.md) - the data model behind these features
- [`usage.md`](./usage.md) - how to use Core programmatically, via the API, CLI and Astro
- [`fields.md`](./fields.md) - full field type reference
- [`schema-changes.md`](./schema-changes.md) - how editing field definitions cascades into existing content
- [`git-and-sync.md`](./git-and-sync.md) - the branch model and synchronizing with a remote
- [`releases.md`](./releases.md) - tagged snapshots and promoting `work` to `production`
- [`asset-management.md`](./asset-management.md) - the two-file Asset model
- [`storage-layout.md`](./storage-layout.md) - where Projects and their files live on disk
- [`local-api.md`](./local-api.md) - the read-only REST API reference
- [`api-clients.md`](./api-clients.md) - generating typed clients and TypeScript types
- [`export.md`](./export.md) - exporting Projects to JSON
- [`markdown-content.md`](./markdown-content.md) - rich `markdown` content storage and rendering
- [`language-scoped-validation.md`](./language-scoped-validation.md) - how Project languages narrow validation
- [`migration-and-history-flow.md`](./migration-and-history-flow.md) - upgrades and reading from git history
- [`error-handling.md`](./error-handling.md) - `CoreError` and error patterns
- [`comparisons/fields.md`](./comparisons/fields.md) - cross-CMS field comparison
