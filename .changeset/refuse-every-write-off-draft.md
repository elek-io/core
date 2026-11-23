---
'@elek-io/core': minor
---

**Core refuses every write and every synchronization while a Project is off its `draft` branch.** `draft` is where every change is committed, and a Project that sits on `main` used to take edits and commit them there. The next `synchronize()` then pushed those unreleased edits to the remote's `main`, the released branch, and the next Release was refused because `draft` lacked them. Only raw git got such a Project back.

Off `draft`, each of these throws `PreconditionFailed` before anything is written, with the branch in its message:

- Every content `create()`, `update()` and `delete()` of Collections, Components, Entries and Assets, and `projects.update()`.
- `projects.synchronize()`, so no unreleased edit reaches the remote.
- `projects.upgrade()`, which refuses at its start and then migrates every file on an `upgrade/core-*` branch of its own, as before.
- `releases.prepare()`, `releases.create()` and `releases.createPreview()`, which already refused there.

**One new `CoreErrorReason`, `not_on_draft`**, carried by every one of those refusals, so an app maps that state to a sentence of its own rather than reading a message. Code that maps `CoreErrorReason` exhaustively has one more value to answer. A detached `HEAD`, which has no branch to name, says so instead.

`projects.branches.switch()` is deliberately not guarded, because it is what gets a Project back to `draft`, and neither is `projects.delete()` or `setRemoteOriginUrl()`. `projects.create()` and `clone()` leave a Project on `draft` as they did, and a Project on `draft` edits, synchronizes, upgrades and releases exactly as before.

See `docs/git-and-sync.md`.
