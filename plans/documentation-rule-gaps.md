# Documentation rule gaps

Three checks in [`../src/test/documentation.ts`](../src/test/documentation.ts) that should have caught something and did not. Found by the JSDoc review, whose code findings are all fixed and whose plan is gone. `prose/punctuation` was a fourth and is fixed, it reads source comments as well as markdown now.

Each is a gap in a rule rather than a bug in the source, so each is worth closing before the next area is documented against it.

## The gaps

- `jsdoc/symbol-reference` runs on `sourceFiles`, so a wrong `Class.member` inside a `contributing/` doc is unchecked. [`../contributing/markdown-internals.md`](../contributing/markdown-internals.md) puts `validateValueReferences` on `EntryService`. It lives on `ReferenceService`, the same misattribution `16cda50` fixed in the source.
- `jsdoc/documented-export` skips any exported const whose initializer is not a function, so `astroDefaults` is re-exported from `@elek-io/core/astro` with nothing requiring a block. It carries one now, but nothing holds it there.
- `boundaryMessage` strips a `ZodError`'s issue messages only inside `logBoundaryError`. Direct `logService.warn` and `logService.error` calls interpolate a raw `error.message` with no such guard, among them [`../src/service/AbstractSlugIndexedEntityService.ts`](../src/service/AbstractSlugIndexedEntityService.ts) and [`../src/service/AbstractEntityService.ts`](../src/service/AbstractEntityService.ts). None can carry a User's string today, because the entity file schemas produce zod defaults and Core's own static messages, but nothing asserts that and `logSweep.test.ts` drives service calls rather than these failure paths. Either route them through `boundaryMessage` or extend the sweep.

## Widening a rule needs a baseline again

`src/documentation-baseline.json` is gone, because every file satisfies every rule. Widening `jsdoc/documented-export` to exported consts will surface violations across the source, so bring the file back for that change rather than exempting anything by hand, and shrink it from there.

## Not a bug

Claims from the same review that did not reproduce, kept so nobody re-files them.

- **`NotFound` is documented and not thrown.** Fixed by `bfd111c`. `JsonFileService.readFile` answers a missing file with `CoreError.notFound` and `notFoundIfMissing` does the same for a missing directory, and `errorContract.test.ts` asserts it.
- **The direct reads in `checkAsset` and `checkEntry` see the raw ENOENT.** They do not. Both go through `jsonFileService.read`, so the `ENOENT` branch of `isNotFoundError` is dead for its own callers.

## See also

- [`../contributing/documentation.md`](../contributing/documentation.md) - what each rule is for and what the tools already enforce
- [`../contributing/logging.md`](../contributing/logging.md) - the invariant the third gap protects
