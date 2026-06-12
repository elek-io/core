---
'@elek-io/core': minor
---

Block synchronize from pushing dangling references, and never leave the repository mid-rebase

`ProjectService.synchronize` now integrates the remote with a controlled rebase and validates the whole integrated `work` tree before pushing. If a rebase combined two individually valid changes (a delete on one side, a new reference to that target on the other) into a dangling reference, the sync stops with a `Conflict` listing the dangling references and does not push, so the shared remote never receives a dangling state. The integrated commits stay in the local tree to repair through Core's own delete or update, then sync again. This closes the one reference-integrity case the per-operation write and delete gates cannot catch, and holds because Projects are reconciled only through Core's `synchronize`, run locally.

Detection is a new forward scan, `EntryService.findDanglingReferences`, reusing the same on-demand reference walker as delete protection across flat `reference` fields, `assetReference` / `entryReference` nodes inside `mdast` fields, references nested in `dynamic` / component blocks, and whole-collection references. A `Conflict` carries a plain `DanglingReference[]` cause, mirroring the delete guards' `ReferencingEntry[]`.

The surrounding transaction is hardened too: a textual rebase conflict aborts cleanly and surfaces a descriptive `PreconditionFailed` instead of leaving the repository mid-rebase, a sync refuses to run against an uncommitted working tree, and the push is retried on a non-fast-forward rejection. Conflict and rejection states are classified with dugite's own `GitError` codes rather than bespoke output parsing. Only the current `work` tree is considered, not released (`production`) history.
