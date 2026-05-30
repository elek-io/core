# Error Handling

All services throw `CoreError` on failure. `CoreError` extends `Error` with `type` and `statusCode` fields.

## CoreError

A class extending `Error` with 7 typed variants (`src/util/shared.ts`):

| Type                 | Status Code | Used For                                       |
| -------------------- | ----------- | ---------------------------------------------- |
| `NotFound`           | 404         | Entity doesn't exist                           |
| `BadRequest`         | 400         | Invalid input, bad UUID, unsupported file type |
| `Unauthorized`       | 401         | No user configured                             |
| `Conflict`           | 409         | Sync failed, uncommitted changes, slug clash   |
| `PreconditionFailed` | 412         | Remote origin missing (setup required)         |
| `UpgradeFailed`      | 422         | Project version upgrade failed                 |
| `Internal`           | 500         | Git errors, FS errors, unexpected failures     |

Static factory methods:

```typescript
throw CoreError.notFound('Collection "abc" not found');
throw CoreError.badRequest('Invalid UUID format', zodError);
throw CoreError.internal('Git command failed', originalError);
throw CoreError.fromUnknown(caughtException); // wraps any unknown into Internal
```

---

## Core Patterns

### `validated()` - Schema Validation + Boundary Logging

Every public service method that validates input uses `this.validated()` (`src/service/AbstractService.ts`). It validates with Zod, runs the body, and logs errors at the service boundary:

```typescript
public async create(props: CreateAssetProps): Promise<Asset> {
  return this.validated('create', createAssetSchema, props, async (validatedProps) => {
    // ... sequential async logic ...
  });
}
```

On failure, errors are logged once (e.g., `[NotFound] (Asset.create) File not found`) and re-thrown. Non-`CoreError` exceptions are wrapped as `CoreError.internal`.

### `withGitRollback` - Transactional Git Operations

Entity create/update/delete operations are wrapped in `withGitRollback` (`src/service/AbstractEntityService.ts`). On failure, it:

1. Removes newly created files (from `cleanupPaths`)
2. Runs `git reset --hard HEAD` to restore the working tree
3. Clears the JSON file cache
4. Re-throws the **original** error (rollback failures are logged but swallowed)

```typescript
return this.withGitRollback(
  projectPath,
  async () => {
    await this.jsonFileService.create(file, filePath, schema);
    await this.gitService.add(projectPath, [filePath]);
    await this.gitService.commit(projectPath, message);
    return this.toAsset(assetFile);
  },
  [filePath] // cleaned up on failure
);
```

### `collectResults` - Partial Failure Tolerance for List Operations

List operations use `collectResults` (`src/service/AbstractEntityService.ts`) with `Promise.allSettled` to tolerate individual read failures without failing the entire list:

```typescript
const assets = await this.collectResults(
  partialAssetReferences.map((ref) =>
    this.read({ projectId: props.projectId, id: ref.id })
  )
);
```

### API Error Handling

The API uses Hono's `onError` handler (`src/api/lib/util.ts`) to catch thrown `CoreError` instances and map them to HTTP responses. The `statusCode` embedded in each `CoreError` maps directly to the HTTP status:

```typescript
// Route handlers are simple:
const data = await c.var.projectService.read({ id });
return c.json(data, 200);
// Thrown CoreErrors automatically produce { error: { type, message, statusCode } }
```

---

## Consumer Patterns

### Desktop App (Direct Usage)

Consumers call service methods with standard `try/catch`:

```typescript
try {
  const project = await core.projects.create({ ... });
} catch (error) {
  if (error instanceof CoreError) {
    showErrorDialog(error.message);
  }
}
```

### CLI Commands

Each CLI action wraps its body in a top-level `try/catch`:

```typescript
export const exportAction = async (props: ExportProps) => {
  try {
    // ... all service calls use plain await ...
  } catch (error) {
    console.error(error instanceof CoreError ? error.message : String(error));
    process.exit(1);
  }
};
```

### Astro Integration

Astro content loaders expect errors to be thrown, so service methods work naturally:

```typescript
const { list: assets, total } = await core.assets.list({
  projectId: props.projectId,
  limit: 0,
});
```

---

## Intentional Design Decisions

### `safeWriteIndex` Swallows Errors

`safeWriteIndex` (`src/service/AbstractIndexedEntityService.ts`) intentionally catches errors. The index file is a performance cache - if the write fails, the cache is invalidated and rebuilt from disk on next access.

### `UserService.get()` Returns `null` for Any Error

A missing user file is the normal state for a fresh installation. Callers expect `User | null`, treating "no user" as a normal condition. `GitService.commit()` checks for `null` and throws `CoreError.unauthorized(...)`.

### Stack Traces in API Error Responses

Error responses include `error.cause.stack` because the local API is used by developers integrating elek.io content into their own apps. The API is never exposed to the internet, and stack traces aid debugging during integration development.
