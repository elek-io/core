# Releases against a remote

Why a clone lands on `draft`, which `main` a Release compares against, why it pushes atomically, and what the first `synchronize()` sends to a new remote. The consumer side is in [`../docs/releases.md`](../docs/releases.md#what-a-release-compares-against) and [`../docs/git-and-sync.md`](../docs/git-and-sync.md#the-first-push).

Read it before changing `clone()` or `synchronize()` in [`ProjectService`](../src/service/ProjectService.ts), or the remote checks and push in [`ReleaseService`](../src/service/ReleaseService.ts).

## The rule

A remote that holds a Project holds both `main` and `draft`, and a Release never leaves them apart. `create()` makes both branches. The first push sends them together. Every Release pushes `main`, `draft` and its tag together, and every preview Release pushes `draft` and its tag.

Pushing `main` and the tag alone was rejected. The remote's `main` then holds released content its `draft` lacks, other editors do not see it after synchronizing, and their next Release refuses or miscounts.

## Where a clone lands

A git host points `HEAD` at `main`, so a plain clone lands on the released branch and every edit would commit there. `clone()` asks the remote with `git ls-remote` first, then clones with `--branch draft`.

Clone then switch was the alternative, and it was rejected:

- It checks out the LFS binaries of `main` only to replace them with those of `draft`.
- It leaves a local `main` that is stale as soon as another working copy releases.
- It depends on what the remote's `HEAD` names, which can be a branch that does not exist, leaving nothing checked out.

The `ls-remote` round trip buys a typed refusal. A remote without `draft` is not a valid Project remote, and `git clone --branch draft` would fail on it with an untyped git error. Branching a local `draft` off `main` was rejected with the rule above: such a remote only arises outside it.

## The released side

`releasedSide()` picks the commit a Release compares against: `origin/main` when it exists, the local `main` otherwise. The diff reads that commit, and `create()` builds on that same commit rather than on whatever the branch name resolves to later.

Inferring the released side from a failed read was rejected, because a missing local `main` then diffs against nothing and gives a wrong bump with no error. Every `main` holds the commit `create()` made, so a missing `main` anywhere is refused, and a failed read of the released project file throws.

`prepare()` does not fetch. It is documented as read-only, a UI calls it to preview, and Core is offline first. `create()` and `createPreview()` fetch before they compute, since they push anyway, so the version they write is computed against the remote as of the call. Both read the same remote-tracking refs through the same checks, so they agree once nothing new arrived in between.

## The atomic push

`git push --atomic` lands every ref or none. Measured with dugite's git 2.53.0 against local bare remotes, and with git 2.54.0 against Forgejo 15.0.10:

- A remote `update` hook declining `draft` left `main` and the tag unpushed.
- A `draft` behind the remote's made git refuse the whole push before sending.
- A remote with `receive.advertiseAtomic` off made git refuse before sending, `fatal: the receiving end does not support --atomic push`. `push()` turns that into `PreconditionFailed`.
- A ref refused by `receive.hideRefs` is the one exception measured. git rejects it outside the transaction, so the other refs still land.

Falling back to separate pushes on a host without atomic support was rejected. It is the partial publish the rule forbids, and a failed Release unwinds locally but cannot take back refs that already landed.

Rebasing inside a Release was rejected too. `draft` behind `origin/draft` is refused up front with advice to synchronize, so what `prepare()` showed is what gets released and a rebase conflict never surfaces halfway through a Release.

## The first push

A remote without `draft` gets the first push from `synchronize()`: `main`, `draft` and every Release and preview tag in one `git push --atomic --set-upstream`. Upgrade tags stay local, as they do for a Release. A git host makes the first branch pushed to an empty repository its default branch. Measured on one host with git 2.54.0:

| First push | Default branch afterwards |
| --- | --- |
| `draft` alone, with `main` later | `draft`, for good |
| `main` and `draft` in one push, in either order, or `main` first | `main` |
| `draft` alone, with the default preset to `main` | `draft` |

Rejected alternatives:

- Pushing the current branch alone, as every later `synchronize()` does. That is the first row, and it leaves a remote that holds `draft` without `main`.
- Separate pushes on a host without atomic pushes, for the reason a Release rejects them. A first push that lands `main` without `draft` breaks the rule. `push()` throws `PreconditionFailed` instead.
- Leaving the tags to the next Release. A Project released before it had a remote holds its Release and preview tags only locally, and nothing else ever pushes an earlier tag.

### Telling remotes apart

`synchronize()` asks the remote with `git ls-remote` before it fetches. The remote-tracking refs cannot answer that. A fetch never prunes them, so a Project pointed at a new URL still shows the old remote's branches, and a remote holding only tags leaves no trace in them at all.

A branch of the remote holds this Project when it shares a merge base with the local `draft`. Every Project descends from the commit `create()` made, so any other history is unrelated, a README a git host committed included.

Such a remote is refused with advice to create an empty repository. Rebasing onto it would merge two unrelated histories into one tree, and force pushing would destroy what the remote held.

### A remote with `main` but no `draft`

Core never makes one. Following a git host's instructions for an existing repository does, because they push `main` alone. `synchronize()` treats it as a first push not yet finished and sends the same refs, which creates `draft` and fast-forwards `main` or leaves it as it is.

That needs the local `main` to contain the remote's. It is checked up front, so a `main` pushed from elsewhere is refused with a typed error rather than retried five times as a non-fast-forward.

Refusing the remote was the alternative, and it was rejected. `clone()` refuses such a remote, and the only other call that repairs it is a Release, which needs a change to release. Pushing `draft` alone was rejected too, because it leaves earlier Release tags stranded on a working copy whose `main` is ahead of the remote's.

## Invariants

- With a remote, `origin/draft` is an ancestor of `draft`, or does not exist. Otherwise the atomic push is rejected, after the local Release was already made and has to unwind.
- With a remote, the local `main` is an ancestor of `origin/main`. `create()` force-creates `main` at the released commit, which only fast-forwards because of this check. Without it the force would drop local commits.
- With a remote, the released commit is an ancestor of `draft`. The diff compares two trees, not the merge `create()` makes, so a `draft` missing a Release made elsewhere would report that Release's content as removed. A Release made by hand or by a Core that pushed `main` alone can still cause this, so the check stays.
- Without a remote none of these checks run. A local Release merges `main` back into `draft`, which keeps them by construction.
- `synchronize()` never pushes to a remote whose `main` or `draft` shares no history with the local `draft`. Without that check a rebase onto an unrelated `draft` that shares no file with the Project succeeds, and the push publishes the two histories as one.

Merging the remote's `main` into `draft` inside `create()` was rejected. `prepare()` cannot do that and stay read-only, so the two would report different diffs for the same state.

## See also

- [`../docs/releases.md`](../docs/releases.md) - what a Release compares against and pushes, as a consumer sees it
- [`../docs/git-and-sync.md`](../docs/git-and-sync.md#cloning-an-existing-project) - what a clone refuses
- [`naming.md`](./naming.md#branches-and-channels) - why the branches are `main` and `draft`
- [`logging.md`](./logging.md) - why `merge-base` logs at `debug`
