# Open code fixes

Eighteen verified code bugs, and the ten JSDoc blocks that cannot be written until each is settled. Found by the JSDoc review, which is otherwise finished: every other finding is written and its plan is gone.

Every item below reproduced against `HEAD` when it was triaged. Four `safety` items found alongside them are already fixed, each with a test that failed first.

**Sizes.** **One line** is a single expression. **Contained** is one file plus its test. **Decision** means the answer changes a public shape or a promise a doc makes, and is not the implementer's to pick.

## The order to fix them in

1. **The one line fixes.** Each is independent and each unblocks something.
2. **The contained changes.**
3. **The five decisions, last.** Those are worth a conversation rather than a commit.

## One line

| Item | Where |
| --- | --- |
| `GitService.refNameToTagName` returns null for a decorated commit. `%D` on a tagged tip is `HEAD -> master, tag: 550e8400-...`, so stripping `tag: ` leaves a string that is not a UUID and `log()` reports `tag: null` on exactly the commit a Release just tagged | `src/service/GitService.ts` |
| `getValueSchemaFromFieldDefinition` throws a plain `Error` for a missing resolver, so it escapes the `CoreError` promise | `src/schema/schemaFromFieldDefinition.ts` |
| `getNumberValueContentSchemaFromFieldDefinition` guards with `if (fieldDefinition.min)`, so a range declared `0` to `100` enforces its ceiling and not its floor. Only the `number` and `range` field types can hold a `0` bound, every string length is `z.int().min(1).nullable()` | `src/schema/schemaFromFieldDefinition.ts` |
| `watchProjects` filters with `path.includes('/.git/')`, a POSIX separator only | `src/cli/util.ts` |
| `GitTagService.delete` has neither the read-only nor the provisioned-copy guard `create` carries | `src/service/GitTagService.ts` |
| `elek()` constructs its Core without `log.hasProcessErrorHandlers: false`, while `docs/usage.md` says the Astro entry does that for you. Bounded: the Core is disposed in a `finally`, so the handlers are live only for the `astro:config:setup` hook, and `src/astro/core.ts` does pass the option | `src/index.astro.ts` |
| `datetime()` branches on `!value`, so `datetime(0)` returns now rather than the epoch. Reachable through the public `datetime` export | `src/util/shared.ts` |

## Contained

| Item | Where |
| --- | --- |
| `LogService.close()` never resolves on a second call, so `dispose()` hangs on a double dispose. Reproduced against the installed winston: the first `end()` resolves, the second never emits `finish` | `src/service/LogService.ts` |
| `ProjectService.isProject` narrows to `Project` while validating `projectFileSchema`. `projectSchema` extends the file schema with `remoteOriginUrl` and `isProvisioned`, so a value holding neither passes the guard | `src/service/ProjectService.ts` |
| `ComponentService.validateNoCircularReferences` expands an unconstrained `component` field to every id in the slug index, the target's own included, so `update` reports the Component as its own cycle. Once one such Component exists, creating a second with an unconstrained `component` field fails too, because the walk reaches the existing one twice | `src/service/ComponentService.ts` |
| Neither cascade passes a `componentResolver`, so an updated dynamic field reaches `getValueSchemaFromFieldDefinition` without one and throws, ending as `Internal` instead of the strip-and-`Conflict` `docs/schema-changes.md` promises. Both call sites stop at the `languages` argument | `src/service/ComponentService.ts`, `src/service/CollectionService.ts` |
| The mdast depth guard is a root-level `.refine`, so zod recurses through the tree before it runs. Reproduced on the installed zod: depth 500 returns the issue, depth 2000 throws `RangeError` out of `safeParse` | `src/schema/buildMdAstSchema.ts` |
| The CLI actions have no `try/catch` at all, while `docs/error-handling.md` shows every one of them wrapping its body in one with `process.exit(1)` | `src/cli/` |

## Decisions

| Question | What hangs on it |
| --- | --- |
| **What `GitService.status` returns.** It reads field index 8 of every porcelain v2 line: `undefined` for an untracked entry, `R100` for a rename, truncated at the first space for `a file with spaces.txt`. Only the dirty-or-clean count `ProjectService.synchronize` uses is sound, and that call puts the `{ filePath: undefined }` objects into a `PreconditionFailed` as its details | The return shape is public |
| **Whether `ProjectService` writes roll back.** `update`, `create` and `delete` are not wrapped in `withGitRollback`, while `contributing/error-handling-internals.md` claims every entity create, update and delete is. `update` writes `project.json`, stages it and commits, so a failure in between leaves the tree modified | Either the code gains the wrapper or the doc loses the claim |
| **What an unmatched resolution slug does.** `ComponentService.applyEntryResolutions` assigns `finalValues[fieldSlug]` outside the `if (fieldDef)` guard, so a slug matching no new field definition is written into the Entry's top-level values with no validation at all | Whether it is dropped, rejected or kept |
| **Whether the slug index file is an export or a cache.** It is written and never read back, while `docs/storage-layout.md` tells a consumer it saves the folder scan. Nothing invalidates the in-memory index after a git operation either | `invalidateSlugIndex` has exactly one caller, the failed-write path in `safeWriteSlugIndex` |
| **What a release that fails partway leaves behind.** `ReleaseService.create` merges, commits and tags before pushing, and recovery only switches back to `work`. `createPreview` never leaves `work`, so its identical recovery undoes nothing, leaving a committed version bump and possibly an unpushed tag | The half-finished release cannot be completed through the public API |

## The ten blocks waiting on them

Each row is a JSDoc block the review left unwritten, because writing today's behavior would enshrine the bug or contradict a doc. Write it once the item above is settled.

| Block | Waiting on |
| --- | --- |
| `GitService.status`, `src/service/GitService.ts` | the return shape decision. This is also the last entry in `src/documentation-baseline.json` |
| `GitService.refNameToTagName`, `src/service/GitService.ts` | the one line fix. Also in the baseline |
| `AbstractEntityService.withGitRollback`, plus a `withGitRollback` section in `contributing/error-handling-internals.md` saying the reset is repository wide and keeps what was already committed inside the wrapper | the rollback scope decision |
| `ProjectService.update` | the rollback scope decision |
| `ProjectService.isProject` | the guard fix, `projectSchema` or a narrower promise |
| `AbstractSlugIndexedEntityService.writeSlugIndex`, plus the Index files section of `docs/storage-layout.md`, which claims the opposite of what the code does | the export-or-cache decision |
| `ComponentService.applyEntryResolutions` | the unmatched slug decision |
| `LogService.close` | the double-close fix, which decides whether the block says "calling it twice is safe" or "a second call never resolves" |
| `ElekIoCore.dispose`, `src/index.node.ts` | the same fix. The block currently reads as a safe teardown and claims the local API is stopped on return, which it is not, `LocalApi.stop()` is not awaited |
| `ReleaseService.create` and `createPreview`, plus a section in `docs/releases.md` on a release failing partway | the partial-release decision |

## Rule gaps

Documentation checks that should have caught something and did not. `prose/punctuation` was the fourth and is fixed, it now reads source comments as well as markdown.

- `jsdoc/symbol-reference` runs on `sourceFiles`, so a wrong `Class.member` inside a `contributing/` doc is unchecked. `contributing/markdown-internals.md` puts `validateValueReferences` on `EntryService`. It lives on `ReferenceService`, the same misattribution `16cda50` fixed in the source.
- `jsdoc/documented-export` skips any exported const whose initializer is not a function, so `astroDefaults` is re-exported from `@elek-io/core/astro` and would never have reached the baseline. It carries a block now, but nothing holds it there.
- `boundaryMessage` strips a `ZodError`'s issue messages only inside `logBoundaryError`. Eleven direct `logService.warn` and `logService.error` calls interpolate a raw `error.message` with no such guard, among them `AbstractSlugIndexedEntityService.ts` and `AbstractEntityService.ts`. None can carry a User's string today, because the entity file schemas produce zod defaults and Core's own static messages, but nothing asserts that and `logSweep.test.ts` drives service calls rather than these failure paths. Either route them through `boundaryMessage` or extend the sweep.

## Not a bug

Claims from the review that did not reproduce, kept so nobody re-files them.

- **`NotFound` is documented and not thrown.** Fixed by `bfd111c`. `JsonFileService.readFile` answers a missing file with `CoreError.notFound` and `notFoundIfMissing` does the same for a missing directory, and `errorContract.test.ts` asserts it.
- **`datetime()` reachable from `GitTagService`'s parsing of git output.** It is not. A tag whose `%(*authordate)` is empty is a lightweight tag, which carries no `Type` trailer and is dropped by `isGitTag` before the value is returned. The falsy-guard defect is real and stays above, reached through the public export instead.
- **The direct reads in `checkAsset` and `checkEntry` see the raw ENOENT.** They do not. Both go through `jsonFileService.read`, so the `ENOENT` branch of `isNotFoundError` is dead for its own callers.

## See also

- [`../contributing/documentation.md`](../contributing/documentation.md) - the rules the ten blocks have to satisfy once they are written
- [`../contributing/error-handling-internals.md`](../contributing/error-handling-internals.md) - the rollback claim two of the decisions test
- [`../docs/error-handling.md`](../docs/error-handling.md) - the `CoreError` promise the plain `Error` throws break
