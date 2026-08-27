# Open code fixes

Eighteen verified code bugs, and the ten JSDoc blocks that cannot be written until each is settled. Found by the JSDoc review, which is otherwise finished: every other finding is written and its plan is gone.

Every item below reproduced against `HEAD` when it was triaged. Four `safety` items found alongside them are already fixed, each with a test that failed first.

**Sizes.** **One line** is a single expression. **Contained** is one file plus its test. **Decision** means the answer changes a public shape or a promise a doc makes, and is not the implementer's to pick.

## The order to fix them in

The five decisions are settled, so this is all implementation. Work it in stages and commit each one.

1. ~~**The six one line fixes.**~~ Done.
2. ~~**The contained changes.**~~ Done.
3. ~~**The settled decisions.**~~ Done.
4. **The ten blocks**, written as the item each waits on lands, rather than saved for the end. A block written next to the fix is a block written by somebody who just read the code.
5. **Finish.** `src/documentation-baseline.json` empties as `GitService.status` and `refNameToTagName` get theirs, so delete it and this plan.

Tests first, as ever. Every item here reproduced against `HEAD`, so each one starts as a failing test.

`pnpm test`, `pnpm lint`, `pnpm check-types` and `pnpm check-format` all pass today and are expected to at every commit. Anything changing behavior a consumer sees needs a changeset, and `GitService.status` definitely does.

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

## What to escalate

Do not resolve these alone, collect them and report them back to Nils:

- A settled decision that turns out to cost something the conversation did not anticipate. They were decided from the triage's evidence, not from writing the code.
- Any fix that reaches further than its bucket says, in particular a contained change that turns out to need a public shape change.
- A rule gap below that blocks a fix, rather than merely sitting next to it.

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
