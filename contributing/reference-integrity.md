# Reference integrity internals

How Core stops a reference from pointing at content that is gone. For the consumer facing model, the `Conflict` contract and what a blocked delete answers with, see [`../docs/references.md`](../docs/references.md).

## The three gates

[`ReferenceService`](../src/service/ReferenceService.ts) owns all three, so the entity services depend on one place through their constructor rather than each carrying its own walk.

| Gate | Direction | Runs on | Method |
| --- | --- | --- | --- |
| Delete protection | reverse, per target | delete | `findEntriesReferencing` |
| Write validation | forward, per Entry | create and update | `validateValueReferences` |
| Sync integrity | forward, whole tree | synchronize | `findDanglingReferences` |

## No persisted reverse index

Detection scans the live working tree on every delete rather than reading a stored index.

An index would go stale the moment a pull or a rebase brings in Entries that never passed through a create or update call, and those are exactly the Entries the sync gate exists for. The cost is one read per existing Entry per delete, which scales poorly for a very large Project and is recorded as a limitation in [`../docs/features.md`](../docs/features.md).

Entry files an older Core wrote are read through `readEntryFileMigrating`, so a file brought in by a pull is upgraded through the migration chain instead of throwing.

## Two walkers, three gates

Direction and walker are separate axes. The table above gives the direction, and it does not decide the walker:

- `validateValueReferences` walks the value tree driven by `fieldDefinitions`, because it also enforces rules the other two have no use for, `ofAssetMimeTypes` and descent through the `ComponentResolver`.
- `findEntriesReferencing` and `findDanglingReferences` walk the same tree value-only, through `collectReferencesInValue`, to extract reference ids. They already share the mdast carrier `collectMdAstRefs`.

So the value-only walker serves a reverse gate and a forward one. Asking which Entries point at a doomed target and asking which of a reference's targets are gone both need the ids and nothing else, which is what makes the field definitions dispensable there.

`findEntriesReferencing` reports the first match per referring Entry, because one link is enough to block a delete. `findDanglingReferences` reports every one, because each broken reference is a separate thing to repair.

## Why the forward gate reads files directly

`validateValueReferences` calls `jsonFileService.read` rather than `assetService.read` or `entryService.read`:

- `AbstractService.validated` logs every `CoreError` before re-throwing. Ten references with one missing would emit a misleading `[NotFound] (Entry.read)` line at the service boundary for an expected validator outcome.
- The input UUIDs were already validated by the outer create or update schema, so a second Zod run has nothing left to catch.
- It avoids nesting `validated()` inside `validated()`.

The path-keyed cache on `JsonFileService` absorbs the duplicate read case, so one Asset referenced ten times is one disk hit plus nine cache reads.

## Invariants

- A self-reference never blocks. For an Entry target that Entry is skipped, for a Collection target every Entry inside it is, because the whole doomed set is going away and references between its Entries vanish cleanly.
- A field `defaultValue` is not a reference. It becomes one once it is stamped into an Entry, not before.
- The forward gate runs after the per-field Zod schema accepted the structural shape, as the first step inside the create and update callbacks. Tree shape and `ofCollections` are the schema's job and are not re-checked.

## See also

- [`../docs/references.md`](../docs/references.md) - the consumer facing model and the `Conflict` contract
- [`error-handling-internals.md`](./error-handling-internals.md) - how `validated()` logs and wraps a `CoreError`
- [`migration-and-history-flow.md`](./migration-and-history-flow.md) - the migration chain `readEntryFileMigrating` runs
- [`markdown-internals.md`](./markdown-internals.md) - the mdast carrier both walkers share
