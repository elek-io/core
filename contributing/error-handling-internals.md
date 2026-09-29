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

On failure, errors are logged once and re-thrown. Non-`CoreError` exceptions are wrapped as `CoreError.internal`, so anything arriving here that has not already decided what it is becomes an `Internal`.

That is why a failure mode belongs at the site that knows it. Node reports a missing file with an `ENOENT` code and no type, and until `JsonFileService` turned that into a `CoreError.notFound`, a missing Entry arrived here as an unknown and answered 500.

The log record carries the type, the method and the status code as the `error.type`, `code.function.name` and `elek.error.status_code` attributes, rather than packing them into the message string. Its message is the error's, except for a validation failure, which is logged as the shape of its issues. See [`logging.md`](./logging.md).

### `mutating()` - the envelope a write goes through

A method that changes a Project, its content or its remote uses `this.mutating()` rather than `validated()`. It is `validated()` with one thing in front: `assertNotReadOnly()`, called before the input is parsed, because a write is refused in read-only mode whatever its input says.

Two guards sit around it, both raising a logged `CoreError.preconditionFailed`:

- `assertNotReadOnly(context)` refuses every write while `isReadOnly` is set. `mutating()` calls it, and a method that has to read before it can validate calls it directly at its entry point, so nothing touches disk first.
- `assertNotProvisioned(context, projectId)` refuses a write to a provisioned copy, which the next provision run would overwrite. It needs the Project id, so it is called at the point that id is first known, not at the entry point. Deleting a Project is exempt, it is the escape hatch that removes a copy.

So a write can refuse before it validates, and the order is deliberate: read-only, then the id parse, then provisioned, then the real validation.

### The two-stage parse

Some schemas cannot exist until Core has read from disk. An Entry is validated against a schema built from its Collection's field definitions and its Project's languages, and reaching those needs the ids, which are inside the unvalidated props.

`parseOrThrow()` covers that gap. It parses a small schema at the boundary, raising the same logged `CoreError.badRequest` a full validation would, so the ids are trustworthy before they are used to build the strict schema:

```typescript
this.assertNotReadOnly('create');
const { projectId, collectionId } = this.parseOrThrow(
  'create',
  z.object({ projectId: uuidSchema, collectionId: uuidSchema }),
  props
);
await this.assertNotProvisioned('create', projectId);
// ... read the Project's languages and the Collection, build the schema ...
return this.mutating(
  'create',
  schemaFromFieldDefinitions,
  props,
  async (validatedProps) => {
    // ... the write ...
  }
);
```

`assertNotReadOnly` runs twice on this path, once directly and once inside `mutating()`. That is intended rather than redundant, the direct call is what stops a read-only Core from reading a Collection it is never allowed to write to.

**Nothing wraps the reads between the two stages.** They run after `parseOrThrow` and before `mutating()`, so they sit outside every `try` and whatever they throw reaches the caller as it is. That is how `entries.create` against a Project that does not exist used to throw a raw `Error`.

The promise in [`../docs/error-handling.md`](../docs/error-handling.md) holds today because those reads go through `JsonFileService`, which raises a `CoreError` for a missing file, and `CollectionService.read`, which has its own boundary. It is not structural, so a read added here that raises something else escapes the same way. `errorContract.test.ts` is what notices.

### `withGitRollback` - transactional Git operations

Every entity create, update and delete is wrapped in `withGitRollback` (`src/service/AbstractEntityService.ts`). On failure it:

1. Removes newly created files (from `cleanupPaths`)
2. Runs `git reset --hard HEAD` to restore the working tree
3. Clears every cache that mirrors the working tree, through `CacheService`
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

Two things about the reset decide what may go inside the wrapper:

- **It is repository wide.** `git reset --hard HEAD` restores the whole working tree rather than the paths the operation touched, so it also discards an uncommitted change made outside the call. Core's own writes always commit, so losing something means a caller edited a Project folder by hand while a write was in flight.
- **It resets to `HEAD`, not to where the call started.** A body that commits twice keeps the first commit, because `HEAD` has already moved. An operation that has to be all-or-nothing therefore makes exactly one commit, which is why the cascades collect `filesToGitAdd` and stage them together.

Two `ProjectService` methods cannot use it:

- `create` runs `ensureDir`, then `git init`, then the first commit, so for most of its window there is no `HEAD` to reach. It removes the folder it made instead.
- `delete` wraps only the removal. Its guards run first, so a refused delete never resets a working tree it was not allowed to touch in the first place.

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

### The slug index has no failure path

`AbstractSlugIndexedEntityService` keeps its UUID-to-slug map in memory and writes nothing, so a mutation cannot fail on it. It used to mirror the map into `slug.index.json` and swallow a failed write, which was correct handling of a write that bought nothing, because nothing ever read the file back.

See [`../docs/storage-layout.md`](../docs/storage-layout.md) for why reading it back is not a free optimisation.

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
