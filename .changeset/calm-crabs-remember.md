---
'@elek-io/core': minor
---

**An Entry's history names the Release that first included each change.** Every commit `core.entries.history()` returns carries a `release` of `{ tagId, version, datetime }`, or `null` while no Release holds that change, so an app can say which changes are published and in which Release. `tagId` and `version` address the same Release `core.releases.list()` returns, so the two join.

**The Release is found by git's ancestry**, which is the oldest Release whose commit descends from the change. A Release commits `project.json` alone and tags that commit, so no commit of an Entry ever carries a Release tag, and a date cannot answer it: a change another working copy committed before a Release reaches this one only after it, and still belongs to the next Release. Core reads local tags and local history, so a Release made elsewhere counts once something fetched, such as `synchronize()`.

A preview Release tags a snapshot of `draft` rather than released content, so it names no change. A Collection update that rewrote the Entry is one of its changes and names its Release like any other. Every commit keeps the fields it carried before, so nothing read from `history()` today changes, and the two git reads this adds run once per history rather than per change or per Release, though both grow with the Project.

**`GitTag` carries the `commitHash` of the commit it points at**, which `core.git.tags.list()`, `core.git.tags.read()` and a commit's own `tag` answer as well.

See `docs/releases.md`.
