# Error handling

All services throw `CoreError` on failure. `CoreError` extends `Error` with `type` and `statusCode` fields. The `ElekIoCore` constructor throws a `CoreError` of type `BadRequest` for invalid options too.

## CoreError

A class extending `Error` with 9 typed variants (`src/util/shared.ts`):

| Type | Status Code | Used For |
| --- | --- | --- |
| `NotFound` | 404 | Entity doesn't exist, whether addressed by id or by slug |
| `BadRequest` | 400 | Invalid input, bad UUID, unsupported file type |
| `Unauthorized` | 401 | No user configured |
| `Conflict` | 409 | Sync failed, uncommitted changes, slug clash |
| `PreconditionFailed` | 412 | Remote origin missing (setup required), mutation attempted in read-only mode or on a provisioned copy |
| `UpgradeFailed` | 422 | Project version upgrade failed |
| `VersionSkew` | 422 | Content written by a newer Core than installed |
| `RateLimited` | 429 | elek.io Cloud refused because this client passed its rate limit |
| `Internal` | 500 | Git errors, FS errors, unexpected failures |

Static factory methods:

```typescript
throw CoreError.notFound('Collection "abc" not found');
throw CoreError.badRequest('Invalid UUID format', zodError);
throw CoreError.internal('Git command failed', originalError);
throw CoreError.fromUnknown(caughtException); // wraps any unknown into Internal
```

## Consumer patterns

### Desktop app (direct usage)

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

### CLI commands

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

### Astro integration

Astro content loaders expect errors to be thrown, so service methods work naturally:

```typescript
const { list: assets, total } = await core.assets.list({
  projectId: props.projectId,
  limit: 0,
});
```

## See also

- [`usage.md`](./usage.md) - catching `CoreError` in application code
- [`git-and-sync.md`](./git-and-sync.md) - the errors git operations and synchronizing raise
- [`schema-changes.md`](./schema-changes.md) - the `Conflict` error and the resolutions workflow
- [`local-api.md`](./local-api.md) - how `CoreError` maps to HTTP responses
- [`concepts.md`](./concepts.md) - the objects these errors are raised about
