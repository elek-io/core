# Error handling internals

How Core implements error handling and validation internally. For the consumer-facing `CoreError` reference and how to catch errors in application code, see [`../docs/error-handling.md`](../docs/error-handling.md).

## Core patterns

### `validated()` - schema validation and boundary logging

Every public service method that validates input uses `this.validated()` (`src/service/AbstractService.ts`). It validates with Zod, runs the body, and logs errors at the service boundary:

```typescript
public async create(props: CreateAssetProps): Promise<Asset> {
  return this.validated('create', createAssetSchema, props, async (validatedProps) => {
    // ... sequential async logic ...
  });
}
```

On failure, errors are logged once and re-thrown. Non-`CoreError` exceptions are wrapped as `CoreError.internal`. The log record carries the error message as its message, and the type, the method and the status code as the `error.type`, `code.function.name` and `elek.error.status_code` attributes, rather than packing them into the message string. See [`logging.md`](./logging.md).

### `withGitRollback` - transactional Git operations

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

### `collectResults` - partial failure tolerance for list operations

List operations use `collectResults` (`src/service/AbstractEntityService.ts`) with `Promise.allSettled` to tolerate individual read failures without failing the entire list:

```typescript
const assets = await this.collectResults(
  partialAssetReferences.map((ref) =>
    this.read({ projectId: props.projectId, id: ref.id })
  )
);
```

### API error handling

The API uses Hono's `onError` handler (`src/api/lib/util.ts`) to catch thrown `CoreError` instances and map them to HTTP responses. The `statusCode` embedded in each `CoreError` maps directly to the HTTP status:

```typescript
// Route handlers are simple:
const data = await c.var.projectService.read({ id });
return c.json(data, 200);
// Thrown CoreErrors automatically produce { error: { type, message, statusCode } }
```

## Intentional design decisions

### `safeWriteSlugIndex` swallows errors

`safeWriteSlugIndex` (`src/service/AbstractSlugIndexedEntityService.ts`) intentionally catches errors. The index file is a performance cache - if the write fails, the cache is invalidated and rebuilt from disk on next access.

### `UserService.get()` returns `null` for any error

A missing user file is the normal state for a fresh installation. Callers expect `User | null`, treating "no user" as a normal condition. `GitService.commit()` checks for `null` and throws `CoreError.unauthorized(...)`.

### The offline fallback is scoped by phase, not by error message

`provision()` continues with the copy on disk when a refresh cannot reach the remote (`docs/provisioning.md#building-offline`). Deciding what counts as "cannot reach the remote" from git's stderr would be guesswork:

- dugite's network patterns are incomplete, `HostDown` only matches some clone shapes.
- Its `SSHPermissionDenied` regex is git's generic `Could not read from remote repository.` line, which an unreachable host, a missing repository and a rejected key all print.

So the split is structural instead:

- `provisionFetch` holds everything that talks to the remote, `ls-remote` and the fetches, and touches nothing else.
- `provisionRefresh` moves the working tree afterwards.

Only a failure of the first may fall back, because only then is the copy guaranteed intact. A failure during checkout or LFS materialization may leave it half updated. Answers from a reachable remote stay hard for the same reason they always were: "no Release published", an unknown version, a wrong Project and `VersionSkew` are content states, not outages.

That is also why a branch the remote does not advertise is reported by the working-tree phase, even though `ls-remote` is what discovered it.

Two failures fail hard by decision rather than by structure:

- An `Unauthorized` error is an actionable configuration problem, and a warning nobody reads would let a dead token quietly ship stale content for weeks.
- An exact version pin promises reproducibility, so it falls back onto itself or not at all. The matching case never reaches the network, because `holdsPinnedVersion` short-circuits it.

`classifyAuthError` carries the weight of the `Unauthorized` decision, so it only reports an SSH failure as authentication when git's output actually names a permission problem. Without that, every offline SSH remote would classify as `Unauthorized` and lose the fallback entirely.

### Stack traces in API error responses

Error responses include `error.cause.stack` because the local API is used by developers integrating elek.io content into their own apps. The API is never exposed to the internet, and stack traces aid debugging during integration development.

## See also

- [`../docs/error-handling.md`](../docs/error-handling.md) - the `CoreError` types a consumer catches
- [`git-credentials.md`](./git-credentials.md) - why `classifyAuthError` only reports SSH as authentication on a permission signal
- [`logging.md`](./logging.md) - what a boundary may write into a log file when it records a failure
- [`../docs/provisioning.md`](../docs/provisioning.md) - the offline fallback from the consumer's side
