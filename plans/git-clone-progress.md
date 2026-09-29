# Git clone progress

`GitService.clone` asks git for progress and then throws it away. A consumer cloning a large Project has nothing to show for however long it takes.

## Current state

`src/service/GitService.ts` builds `['clone', '--progress', ...]` and awaits the result. Nothing reads stderr, which is where git writes its progress lines, so the flag currently produces output that no one consumes.

dugite's `processCallback` is the hook for it, and Core already uses it twice, in `lfs.smudge` and in `getFileContentAtCommit`. Both only set an encoding, so no progress plumbing exists yet.

## What to do

1. Add an optional progress callback to the clone options and wire it to `processCallback`, reading `stderr`.
2. Parse git's counting, compressing and receiving lines into a small typed shape. Handing a consumer raw git output would make every later change to that output a breaking change.
3. Decide whether the same hook belongs on `fetch`, `pull` and the LFS transfers. Those are the other operations long enough to be worth reporting, and picking a shape that fits only clone means doing this twice.
4. Surface it through `ProjectService.clone` and `ProjectService.provision`, because a consumer calls those rather than `GitService` directly.

Step 4 is what makes this more than an afternoon. Those methods run inside `validated()`, which resolves a promise, so a callback has to be threaded through the props rather than returned.

## What it costs

Additive, nothing breaks. The work is in choosing a progress shape that also fits fetch and LFS, and in deciding how much of git's output is worth promising to keep parsing.

## See also

- [`../contributing/testing.md`](../contributing/testing.md) - why a progress stream is awkward to assert against in this suite
- [`../docs/git-and-sync.md`](../docs/git-and-sync.md) - what a consumer sees of clone today
