---
'@elek-io/core': minor
---

The `production` branch is now `main`, the `work` branch is now `draft`, and the `production` channel is now `release`. The channels are `release`, `preview` and `draft`.

**Why the new names.** Every git host points a new repository's default branch at `main`, and a clone checks out the default branch, so released content is what a clone shows. `draft` matches the channel that reads that branch, so you no longer translate between the `work` branch and the `draft` channel. `release` matches the word Desktop uses, Release, and the type of the tag the channel resolves to.

**What Core does now.** `core.projects.create()` makes its first commit on `main`, then creates and switches to `draft`. `core.releases` diffs `draft` against `main` and promotes `draft` into `main`, and a full Release pushes `main` and its tag. Provisioning defaults to the `release` channel, and the `draft` channel follows the `draft` branch.

**Nothing is migrated, and the old names are not accepted.** A channel or ref of `production` is refused like any unknown value. `ELEK_IO_CHANNEL=production` throws a `BadRequest`, and so does a `ref` of `production` in `core.projects.provision()`, `elek provision --ref` or `defineElekConfig()`. Rename the branches before this version of Core works on a Project: on one that still has `production` and `work`, `core.releases` throws `PreconditionFailed` and `core.projects.upgrade()` fails switching to `draft`. Release tags are untouched, so exact version pins keep resolving.

What to change by hand:

1. Replace `ELEK_IO_CHANNEL=production` and every `ref` of `production` with `release`. A ref you never set needs nothing. Code that names a branch, such as `core.projects.branches.switch()`, uses `main` and `draft`.
2. Rename the branches in each existing Project:

   ```bash
   git branch -m production main
   git branch -m work draft
   ```

3. Do the same on its remote, and set the default branch to `main` at your git host before deleting the old branches:

   ```bash
   git push --set-upstream origin main draft
   # set the default branch to main at your git host, then
   git push origin --delete production work
   ```

   Every other working copy of the Project runs step 2, then `git fetch --prune`, `git branch --set-upstream-to=origin/main main` and `git branch --set-upstream-to=origin/draft draft`.
