# A Release on an empty remote

`synchronize()` makes the first push to a remote without `draft`, see [`../contributing/releases.md`](../contributing/releases.md#the-first-push). A Release made on such a remote before any `synchronize()` does not, and `docs/releases.md` only tells the developer to synchronize first.

## Current state

`ReleaseService` in `src/service/ReleaseService.ts` fetches, finds no `origin/main`, compares against the local `main` and pushes its own refs atomically:

| Call on an empty remote | Pushes | What goes wrong |
| --- | --- | --- |
| `create()` | `main`, `draft`, its tag | tags of earlier Releases stay local for good, because the next `synchronize()` takes the usual path |
| `createPreview()` | `draft`, its tag | the remote holds `draft` without `main`, and a git host makes `draft` its default branch for good |

The second row breaks the rule that a Project remote holds both branches. Desktop can reach it by offering a preview before the first sync.

## What to do

1. Decide where the first push lives. `firstPushRefs()` is private to `ProjectService`, and `ReleaseService` already holds a `ProjectService`.
2. On a remote without `draft`, push the first push's refs plus the new tag, for both calls, so a preview never lands `draft` alone.
3. Test both rows with a Project released before it had a remote, then drop the advice in `docs/releases.md`.

## What it costs

No public API changes. A preview on an empty remote starts pushing `main`, which is the fix rather than a break.

## See also

- [`../docs/releases.md`](../docs/releases.md#the-atomic-push) - what a Release pushes today
- [`../docs/git-and-sync.md`](../docs/git-and-sync.md#the-first-push) - what the first push sends
