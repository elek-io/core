# Error Handling with neverthrow

This document describes the error handling architecture, core patterns, and intentional design decisions made during the migration from exception-based to Result-based error handling using [neverthrow](https://github.com/supermacro/neverthrow).

## Overview

All public service methods return `CoreResult<T>` instead of `Promise<T>`. Errors are values, not exceptions - they flow through the type system and must be handled explicitly by callers.

```typescript
import type { ResultAsync } from 'neverthrow';
import type { CoreError } from './util/shared.js';

// The universal return type for all service methods
type CoreResult<T> = ResultAsync<T, CoreError>;
```

### CoreError

A discriminated union with 7 types. Each variant carries a `type`, `message`, `statusCode`, and optional `cause`:

| Type                 | Status Code | Used For                                       |
| -------------------- | ----------- | ---------------------------------------------- |
| `NotFound`           | 404         | Entity doesn't exist                           |
| `BadRequest`         | 400         | Invalid input, bad UUID, unsupported file type |
| `Unauthorized`       | 401         | No user configured                             |
| `Conflict`           | 409         | Sync failed, uncommitted changes, slug clash   |
| `PreconditionFailed` | 412         | Remote origin missing (setup required)         |
| `UpgradeFailed`      | 422         | Project version upgrade failed                 |
| `Internal`           | 500         | Git errors, FS errors, unexpected failures     |

Factory helpers are in `CoreErrors` (`src/util/shared.ts`):

```typescript
CoreErrors.notFound('Collection "abc" not found');
CoreErrors.badRequest('Invalid UUID format', zodError);
CoreErrors.internal('Git command failed', originalError);
CoreErrors.fromUnknown(caughtException); // wraps any unknown into Internal
```

### Key Utility: `parseSchema`

Wraps Zod's `.safeParse()` into a sync Result (`src/util/shared.ts`):

```typescript
const validated = parseSchema(createAssetSchema, props);
if (validated.isErr()) return errAsync(validated.error);
const validatedProps = validated.value;
```

This replaces `schema.parse(props)` (which throws) at every service method boundary.

---

## Core Patterns

### `logged()` - Error Logging at Service Boundaries

Every public service method wraps its return with `this.logged()` (`src/service/AbstractService.ts`). This logs errors once at the service boundary and passes them through unchanged:

```typescript
protected logged<T>(context: string, result: CoreResult<T>): CoreResult<T> {
  return result.mapErr((e) => {
    this.logService.error({
      source: 'core',
      message: `[${e.type}] (${this.type}.${context}) ${e.message}`,
      meta: e,
    });
    return e;
  });
}
```

Internal/private methods do **not** log errors via `logged()` - error logging happens exactly once, at the public boundary. Internal methods may still use `logService` directly for debug/info level messages (e.g., cache hits, operation progress).

### `withGitRollback` - Transactional Git Operations

Entity create/update/delete operations are wrapped in `withGitRollback` (`src/service/AbstractEntityService.ts`). On failure, it:

1. Removes newly created files (from `cleanupPaths`)
2. Runs `git reset --hard HEAD` to restore the working tree
3. Clears the JSON file cache
4. Returns the **original** error (rollback failures are logged but swallowed)

```typescript
return this.withGitRollback(
  projectPath,
  () =>
    this.jsonFileService
      .create(file, filePath, schema)
      .andThen(() => this.gitService.add(projectPath, [filePath]))
      .andThen(() => this.gitService.commit(projectPath, message)),
  [filePath] // cleaned up on failure
);
```

The rollback uses `.orElse()` internally - no try/catch.

### `collectResults` - Partial Failure Tolerance for List Operations

List operations (e.g., listing all entries of a collection) may have individual reads that fail. For example, `listReferences` returns all files matching the expected format, but some may fail schema validation when read (e.g., a file written by an older Core version that wasn't migrated yet). Rather than failing the entire list, `collectResults` (`src/service/AbstractEntityService.ts`) collects successful values and logs failures:

```typescript
const assets = await this.collectResults(
  partialAssetReferences.map((ref) =>
    this.read({ projectId: props.projectId, id: ref.id })
  )
);
```

This replaces the old `settleAndWarn` pattern.

### `handleResult` - API Error Mapping

The API layer uses `handleResult` (`src/api/lib/util.ts`) to convert Results into HTTP responses. The `statusCode` embedded in each `CoreError` maps directly to the HTTP status:

```typescript
// In route handlers:
const result = await c.var.projectService.list({ limit, offset });
return handleResult(c, result);
```

Error responses have the shape `{ error: { type, message, statusCode, stack? } }`. Stack traces are included because the local API is used by developers integrating elek.io content into their own apps, not by the Desktop app. The stack traces aid debugging during integration development.

---

## Consumer-Specific Patterns

### Desktop App (Direct Usage)

Consumers call service methods and use `.match()` or `.isErr()`:

```typescript
const result = await core.projects.create({ ... });
if (result.isErr()) {
  showErrorDialog(result.error.message);
  return;
}
const project = result.value;
```

Consumers add `neverthrow` as their own dependency for `ok`, `err`, `Result`, `ResultAsync`. Core only exports `CoreError`, `CoreErrors`, `CoreResult`, and `CoreResultSync`.

### CLI Commands

Each command uses `.match()` with stderr output and exit codes:

```typescript
const result = await core.projects.list({ limit, offset });
if (result.isErr()) {
  console.error(result.error.message);
  process.exit(1);
}
```

### Astro Integration - `_unsafeUnwrap()`

> **Do not refactor this.** The Astro integration intentionally uses `._unsafeUnwrap()`.

Astro content loaders expect errors to be thrown so Astro can surface them in its build output. Since service methods return Results, `._unsafeUnwrap()` converts back to throwing:

```typescript
// src/index.astro.ts
const { list: assets, total } = (
  await core.assets.list({
    projectId: props.projectId,
    limit: 0,
  })
)._unsafeUnwrap();
```

This is the only production code that uses `._unsafeUnwrap()`. It is correct and intentional - Astro's loader API has no concept of Result types.

### Test Code - `_unsafeUnwrap()`

> **Do not refactor this.** Tests use `._unsafeUnwrap()` for setup/helper code where failures should immediately crash the test.

```typescript
// src/test/util.ts
const project = (await core.projects.create({ ... }))._unsafeUnwrap();
```

Tests that explicitly test error paths use the Result API directly:

```typescript
const result = await core.projects.delete({ id: project.id });
expect(result.isErr()).toBe(true);
if (result.isErr()) {
  expect(result.error.type).toBe('PreconditionFailed');
}
```

---

## Intentional Throws - Do Not Convert

Several places deliberately use throwing (`schema.parse()` or `throw new Error()`) instead of returning Results. These are **not bugs** - they were intentionally kept during the migration.

### Schema Utilities (`src/schema/schemaFromFieldDefinition.ts`)

Three throws in `getValueSchemaFromFieldDefinition()`:

1. **Missing `componentResolver`** - programmer error; `buildComponentResolver()` should always provide one
2. **Circular component reference** - invariant violation; the BFS in `ComponentService.validateNoCircularReferences()` should prevent this
3. **Unsupported `ValueType`** - exhaustiveness guard; adding a new ValueType without updating this function would reach this branch

These execute during **synchronous Zod schema construction**. Converting them to return Result would cascade through the entire schema generation pipeline with no user benefit.

### `migrate()` Methods (All Entity Services)

Every service has a `migrate()` method that uses `schema.parse()`:

```typescript
// src/service/AssetService.ts (and similarly in all entity services)
public migrate(potentiallyOutdatedAssetFile: unknown) {
  const loose = migrateAssetSchema.parse(potentiallyOutdatedAssetFile);
  const migrated = applyMigrations(loose, assetMigrations, this.coreVersion);
  return assetFileSchema.parse(migrated);
}
```

These throw because:

- They are called inside `.map()` or `.andThen()` on a `ResultAsync`, where thrown errors are caught by neverthrow
- A parse failure indicates either data corruption in git history or a missing/incorrect migration step for a new Core version - not invalid user input
- The calling context already handles the error via the Result chain

### `ComponentResolver` (`src/service/EntryService.ts`)

The `buildComponentResolver()` method returns a synchronous `ComponentResolver` function. This function throws if a component wasn't pre-loaded:

```typescript
resolver: (id: string) => {
  const fds = componentMap.get(id);
  if (!fds) {
    throw new Error(
      `Component "${id}" was not pre-loaded. This is an internal error.`
    );
  }
  return fds;
};
```

This is an invariant violation - the BFS pre-loading pass should load every referenced component. The `ComponentResolver` type signature is `(id: string) => FieldDefinition[]` (synchronous, defined in the schema layer), so it cannot return a Result without cascading changes through Zod schema generation.

### `LogService` (`src/service/LogService.ts`)

LogService methods use `logSchema.parse(props)` which throws. This is intentional:

- LogService is foundational infrastructure
- A misconfigured log call is a programmer error
- Wrapping LogService in Results would require every error-logging path to handle logging failures, creating circular complexity

---

## Intentional Design Decisions

### `safeWriteIndex` Returns `Promise<void>`, Not `CoreResult`

> **Do not change this return type.**

`safeWriteIndex` (`src/service/AbstractIndexedEntityService.ts`) intentionally swallows errors. The index file is a performance cache for UUID-to-slug mapping. When an entity is created/updated:

1. The entity data is committed to git (the source of truth)
2. The index file is updated as a convenience cache
3. If the index write fails, the cache is invalidated and rebuilt from disk on next access

Returning `CoreResult` would force callers to handle an error that doesn't affect data integrity.

### `UserService.get()` Returns `null` for Any Error

`UserService.get()` uses `.orElse()` to return `null` for any read failure - including file-not-found, corrupt JSON, or permission errors. This is intentional:

- A missing user file is the normal state for a fresh installation
- Callers expect `User | null`, treating "no user" as a normal condition, not an error
- `GitService.commit()` and `GitService.init()` check for `null` and return `CoreErrors.unauthorized(...)` when no user is set

### Two Validation Patterns: IIFE vs Early-Return

Two patterns coexist across services:

**IIFE pattern** (CollectionService, ComponentService, GitTagService):

```typescript
public create(props): CoreResult<T> {
  return this.logged('create', (() => {
    const validated = parseSchema(schema, props);
    if (validated.isErr()) return errAsync(validated.error);
    // ...rest of logic
  })());
}
```

**Early-return pattern** (AssetService, EntryService, ProjectService):

```typescript
public create(props): CoreResult<T> {
  const validated = parseSchema(schema, props);
  if (validated.isErr()) return this.logged('create', errAsync(validated.error));
  // ...rest of logic
  return this.logged('create', result);
}
```

Both are correct. The IIFE pattern calls `logged()` in exactly one place. The early-return pattern calls it at each return point. Neither should be "unified" - the IIFE is better for complex methods with many branches, early-return is cleaner for simple methods.

### Stack Traces in API Error Responses

`handleResult` includes `error.cause.stack` in error responses. This is intentional because the local API is used by developers integrating elek.io content into their own apps (not by the Desktop app, which uses Core directly). The API is never exposed to the internet, and stack traces aid debugging during integration development.
