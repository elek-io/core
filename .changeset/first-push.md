---
'@elek-io/core': patch
---

`core.projects.synchronize()` pushes a Project to a new, empty remote. It rebased onto `origin/draft` first, which an empty remote does not have, so it threw `Internal` before anything was pushed. `getChanges()` threw the same way.

**The first push.** Against a remote without `draft`, `synchronize()` sends `main`, `draft` and the Project's Release and preview tags in one `git push --atomic`, after uploading the LFS objects of every ref. The remote takes every ref or none, so it never holds `draft` without `main`. Tags of Releases made before the Project had a remote reach it this way, and upgrade tags stay local. Afterwards `main` tracks `origin/main` and `draft` tracks `origin/draft`, and the next `synchronize()` integrates and pushes as before. A remote without atomic push support throws `PreconditionFailed` and nothing is pushed.

**A remote holding something else is refused.** `synchronize()` throws `PreconditionFailed` and pushes nothing when the remote has refs but no `main` or `draft` that shares history with the Project. That includes a repository a git host created with a README, a license or a `.gitignore`. Core never merges unrelated histories and never force pushes, so connect a Project to an empty repository.

**A remote holding the Project's `main` alone** gets the same first push, which creates `draft`. A git host's instructions for pushing an existing repository leave a remote in that state. When that `main` holds commits the local `main` lacks, `synchronize()` throws `PreconditionFailed` instead.

**`getChanges()` before the first push** reports every commit of the current branch as `ahead` and none as `behind`. A guarded `delete()` therefore throws `Conflict` for the unpushed work rather than `Internal`.

**Synchronize before the first Release on a new remote.** A Release there sends only its own tag, and a preview Release sends `draft` without `main`, so the earlier tags and `main` arrive only through the first push of `synchronize()`.

**New on `core.git`.** `remotes.listOriginRefs()` lists the refs `origin` advertises, `mergeBase()` returns the best common ancestor of two commits or `null` for unrelated histories, and `push()` takes a `setUpstream` option.
