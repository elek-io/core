# Releases against a remote

Why a clone lands on `draft`, which `main` a Release compares against, and why it pushes atomically. Read it before changing `clone()` in [`ProjectService`](../src/service/ProjectService.ts) or the remote checks and push in [`ReleaseService`](../src/service/ReleaseService.ts). The consumer side is in [`../docs/releases.md`](../docs/releases.md#what-a-release-compares-against).

## The rule

A remote that holds a Project holds both `main` and `draft`, and a Release never leaves them apart. `create()` makes both branches. Every Release pushes `main`, `draft` and its tag together, and every preview Release pushes `draft` and its tag.

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

## Invariants

- With a remote, `origin/draft` is an ancestor of `draft`, or does not exist. Otherwise the atomic push is rejected, after the local Release was already made and has to unwind.
- With a remote, the local `main` is an ancestor of `origin/main`. `create()` force-creates `main` at the released commit, which only fast-forwards because of this check. Without it the force would drop local commits.
- With a remote, the released commit is an ancestor of `draft`. The diff compares two trees, not the merge `create()` makes, so a `draft` missing a Release made elsewhere would report that Release's content as removed. A Release made by hand or by a Core that pushed `main` alone can still cause this, so the check stays.
- Without a remote none of these checks run. A local Release merges `main` back into `draft`, which keeps them by construction.

Merging the remote's `main` into `draft` inside `create()` was rejected. `prepare()` cannot do that and stay read-only, so the two would report different diffs for the same state.

## See also

- [`../docs/releases.md`](../docs/releases.md) - what a Release compares against and pushes, as a consumer sees it
- [`../docs/git-and-sync.md`](../docs/git-and-sync.md#cloning-an-existing-project) - what a clone refuses
- [`naming.md`](./naming.md#branches-and-channels) - why the branches are `main` and `draft`
- [`logging.md`](./logging.md) - why `merge-base` logs at `debug`
