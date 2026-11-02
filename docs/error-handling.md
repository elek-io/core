# Error handling

All services throw `CoreError` on failure. `CoreError` extends `Error` with a `type`, a `statusCode` and, where Core has a value for what it refused, a `reason`. The `ElekIoCore` constructor throws a `CoreError` of type `BadRequest` for invalid options too.

## CoreError

A class extending `Error` with 9 typed variants (`src/util/shared.ts`):

| Type | Status Code | Used For |
| --- | --- | --- |
| `NotFound` | 404 | Entity doesn't exist, whether addressed by id or by slug |
| `BadRequest` | 400 | Invalid input, bad UUID, unsupported file type |
| `Unauthorized` | 401 | No user configured, or the remote refused the credentials |
| `Conflict` | 409 | Sync failed, uncommitted changes, slug clash, a field definition change that needs a resolution or would delete stored content |
| `PreconditionFailed` | 412 | Remote origin missing (setup required), mutation attempted in read-only mode or on a provisioned copy |
| `UpgradeFailed` | 422 | Project version upgrade failed |
| `VersionSkew` | 422 | Content written by a newer Core than installed |
| `RateLimited` | 429 | elek.io Cloud refused a call because this client passed its rate limit |
| `Internal` | 500 | Git errors, FS errors, unexpected failures |

Static factory methods:

```typescript
throw CoreError.notFound('Collection "abc" not found');
throw CoreError.badRequest('Invalid UUID format', zodError);
throw CoreError.internal('Git command failed', originalError);
throw CoreError.fromUnknown(caughtException); // wraps any unknown into Internal
```

## The message, the reason and the cause

Three fields say what happened, and each is read differently:

| Field | Holds | What to do with it |
| --- | --- | --- |
| `message` | one sentence for a person, never a string the caller sent and never text Core did not author | show it, and write it into a log file |
| `reason` | one value of `CoreErrorReason` where Core has one for what it refused, absent otherwise | branch on it, and pass it anywhere |
| `cause` | whatever was originally thrown, which is where the text the message leaves out lives | read it while debugging, and keep it out of what you pass on |

`error.cause` carries git's own stdout and stderr for a failed git command, while the message keeps the redacted command line and the exit code. A file that will not parse puts `JSON.parse`'s own failure there, and the message names the file.

Keep a `cause` out of anything you send elsewhere: git echoes its arguments back, so it can hold a User's name and email, and a parse failure quotes part of the file. The local API is the one exception, and answers with the cause's stack on purpose, because it is a developer tool that never leaves the computer, see [`local-api.md`](./local-api.md#responses-and-errors).

## The reason a call was refused

`error.reason` is a value to branch on rather than text to show, so an app maps each one to a sentence of its own. It is a plain lowercase token holding no git output, no address and no credential, which is what lets it cross a process boundary as it is.

| Reason | Core refused because |
| --- | --- |
| `uncommitted_changes` | the working tree holds changes that are not committed |
| `remote_holds_something_else` | the Git repository holds something other than this Project |
| `remote_main_without_draft` | the remote holds a `main` without `draft` that the local `main` does not contain |
| `remote_without_atomic_push` | the remote takes no atomic push, which the first push and a Release need |
| `git_lfs_endpoint_unusable` | the remote will not take the Assets over Git LFS |
| `textual_conflict` | a rebase stopped on a conflict between the local changes and the remote's |
| `remote_advanced` | the remote moved on, so the push was rejected as non-fast-forward |
| `read_only_mode` | Core runs read-only |
| `provisioned_copy` | the Project is a provisioned copy, which the next provision run overwrites |
| `git_library_missing` | git could not load a shared library it needs |
| `remote_names_no_project` | the remote on elek.io Cloud's git host names no Project |
| `project_on_another_host` | elek.io Cloud keeps the Project on another git host than the remote names |
| `cloud_unreachable` | elek.io Cloud could not be reached, or did not answer in time |
| `git_host_unreachable` | elek.io Cloud could not reach its git host |

Every `PreconditionFailed` of `core.projects.synchronize()` names its cause, one for each state [`git-and-sync.md`](./git-and-sync.md#a-refused-sync-names-its-cause) lists.

Each value names the state rather than the call, so a read-only Core, a provisioned copy, a loader that fails and a Cloud or git host that refuses name theirs wherever they are met. A refusal Core has no value for leaves `reason` absent, so branch on the `type` as well.

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

`elek` presents every failure in one place. The actions throw, and the binary prints the message and exits non-zero:

```typescript
try {
  await program.parseAsync();
} catch (error) {
  console.error(error instanceof CoreError ? error.message : String(error));
  process.exit(1);
}
```

So a command prints the actionable message rather than a stack trace, and its exit code says whether it worked. In watch mode a failed re-run prints the same message and the command goes on watching, because the process outlives the run that failed.

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
