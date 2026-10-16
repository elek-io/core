---
'@elek-io/core': minor
---

The `production` branch is now `main`, the `work` branch is now `draft`, and the `production` channel is now `release`. The channels are `release`, `preview` and `draft`.

**Why the new names.** Every git host points a new repository's default branch at `main`, and a plain `git clone` checks out the default branch, so released content is what the host and such a clone show. `draft` matches the channel that reads that branch, so you no longer translate between the `work` branch and the `draft` channel. `release` matches the word Desktop uses, Release, and the type of the tag the channel resolves to.

**What Core does now.** `core.projects.create()` makes its first commit on `main`, then creates and switches to `draft`. `core.releases` diffs `draft` against the released `main` and promotes `draft` into it. Provisioning defaults to the `release` channel, and the `draft` channel follows the `draft` branch.

**A clone lands on `draft`.** `core.projects.clone()` checks out a local `draft` tracking `origin/draft`, whatever the remote's default branch, so edits and `core.releases` work right after a clone. A Project remote holds both `main` and `draft`, so a remote without `draft` throws `PreconditionFailed` and leaves nothing behind.

**A Release never leaves `main` and `draft` apart.** With a remote, a full Release pushes `main`, `draft` and its tag in one `git push --atomic`, and a preview Release pushes `draft` and its tag the same way. The remote takes every ref or none, so another working copy that synchronizes holds the released content on `draft`. A remote without `draft` gets it from the push. A remote that does not support atomic pushes throws `PreconditionFailed` and nothing is pushed, Core does not fall back to separate pushes. A rejected push unwinds the Release as before.

**With a remote, a Release compares against the remote's `main`.** `core.releases.prepare()` reads the remote as last fetched and never fetches. `create()` and `createPreview()` fetch first, LFS objects included, and `create()` builds on the remote's `main`. A local `main` that is missing after a clone, or behind after another working copy released, no longer changes the bump. All three throw `PreconditionFailed` before changing anything when `draft` lacks commits of the remote's `draft`, which needs a `synchronize()` first, and when `draft` lacks commits of the remote's `main`, the local `main` holds commits the remote's lacks, or there is no `main` anywhere. Without a remote, Releases compare against the local `main` and push nothing, as before.

**Nothing is migrated, and the old names are not accepted.** A channel or ref of `production` is refused like any unknown value. `ELEK_IO_CHANNEL=production` throws a `BadRequest`, and so does a `ref` of `production` in `core.projects.provision()`, `elek provision --ref` or `defineElekConfig()`. Rename the branches before this version of Core works on a Project: on one that still has `production` and `work`, `core.releases` throws `PreconditionFailed`, `core.projects.upgrade()` fails switching to `draft` and `core.projects.clone()` of its remote throws `PreconditionFailed`. Release tags are untouched, so exact version pins keep resolving.

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
