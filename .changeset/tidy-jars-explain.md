---
'@elek-io/core': minor
---

**A refused synchronization names its cause.** `CoreError` carries a `reason` beside its `type`, from the closed `CoreErrorReason` list Core exports, so an app can tell its user the one thing to fix without reading git's output. A refused `core.projects.synchronize()` names `uncommitted_changes`, `remote_holds_something_else`, `remote_main_without_draft`, `remote_without_atomic_push`, `git_lfs_endpoint_unusable`, `textual_conflict`, `remote_advanced`, `read_only_mode` or `provisioned_copy`. The last two reach every other refused write too, because they name the state Core refused for rather than the call.

**The reason holds no git output, no address and no credential**, so it crosses a process boundary as it is, which `cause` cannot: that one keeps git's own stdout and stderr, where a remote URL can carry a password. A refusal Core has no value for leaves `reason` absent, so branch on the `type` as well.

Every type, message and status code stays as it was, so nothing a consumer reads from a `CoreError` today changes. Core itself stopped telling its own refusals apart by their message's text, the retry of a push the remote outran reads the reason instead.

See `docs/error-handling.md` and `docs/git-and-sync.md`.
