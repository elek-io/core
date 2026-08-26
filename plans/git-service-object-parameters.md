# GitService object parameters

Every public method on `GitService` takes positional parameters, while every service above it takes one validated props object. `core.git` is documented as a public escape hatch, so these signatures ship and changing them breaks consumers.

The note this plan replaces asked for the parameter types to live "in the shared library". There is no shared library any more. Core exports its own schemas from `src/schema/index.ts` and elek.io Client consumes those, so a props schema declared next to the other git schemas is what that meant.

## Current state

Positional throughout `src/service/GitService.ts`:

- `add(path, files)`
- `merge(path, branch, options?)`
- `rebase(path, onto)`
- `reset(path, mode, commit)`
- `commit(path, message)`
- `log(path, options?)`
- `listTreeAtCommit(path, treePath, commitRef)`

The nested services are mixed rather than uniformly positional. `tags.read({ path, id })` already takes an object, `branches.switch(path, branch, options)` does not, so there is no single convention to point at.

## What to do

1. Give each public method one props object, with a schema next to the others in `src/schema/gitSchema.ts` and a `z.infer` type exported from the package.
2. Do the whole surface in one change rather than method by method, so a consumer gets one break instead of several.
3. Fix the typo in the original note while you are there. It read "recieve".
4. Ship it with a changeset marked breaking, and update the method list under `core.git` in [`../docs/git-and-sync.md`](../docs/git-and-sync.md).

## What it costs

One breaking release for anyone calling `core.git` directly. Nothing inside Core, since every call site is in this repository and the compiler finds them all.

## See also

- [`../contributing/naming.md`](../contributing/naming.md) - the naming a props type has to follow, including the git flag exception
- [`../docs/git-and-sync.md`](../docs/git-and-sync.md) - what `core.git` promises a consumer today
