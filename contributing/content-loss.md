# Content loss

Why a field definition change that deletes stored content is refused rather than applied, why the acceptance is a list of field definition ids rather than a flag, and what has to stay true of the rule. The consumer side is in [`../docs/schema-changes.md`](../docs/schema-changes.md#accepting-content-loss).

Read this before changing [`contentLoss.ts`](../src/util/contentLoss.ts), either transform, or the cascade in [`CollectionService`](../src/service/CollectionService.ts) and [`ComponentService`](../src/service/ComponentService.ts).

## The decision

Three field definition changes delete stored content: removing a definition, narrowing `ofComponents` and narrowing `ofCollections`. All three used to apply and commit without telling the caller.

The content is gone from every Entry before any Release exists, so a Release cannot protect against it either. Git history still holds the old Entry files, and nothing inside elek.io reads them back.

The guard is Core's, not a UI's, because guard code belongs where it always runs. The `elek` CLI, the local API, elek.io Desktop and a setup script all reach the same two methods.

## Invariants

- **One rule, asked by both transforms.** [`contentLoss.ts`](../src/util/contentLoss.ts) decides what a change deletes. `transformEntryValues` asks it per Entry and `transformComponentValues` per Component item, so both answer alike. A second copy is how the two drifted apart, leaving the Component side answering `constraint_violation` for a narrowed allowlist.
- **The rule is driven by the Value, not by the diff of the two allowlists.** It asks what the new allowlist excludes of what is stored, so a swapped, a reordered and a widened list all come out right without a case each.
- **Nothing is written before the refusal.** Both cascades transform every affected Entry in memory, collect the issues, and only then write. The git rollback is the backstop for a failure during the writes, not the mechanism that undoes a refusal.
- **A refusal reports in the same list as a resolution.** One call answers everything about one update, so a caller never fixes one kind of issue only to meet the next.
- **The message carries no Value.** It is logged at the service boundary, and [`logging.md`](./logging.md) keeps authored content out of a log file. What would go rides on the error's `cause`, which is never logged.

## Rejected alternatives

| Alternative | Why not |
| --- | --- |
| Reuse `resolutions` | `assertResolutionSlugsAreKnown` rejects a slug the new definitions do not declare, and a removed field's slug never is. A removal could not be consented to through that channel at all. |
| A boolean such as `acceptContentLoss: true` | A setup script sets it once and from then on authorizes whatever loss exists at the next run, which re-creates the defect one call later. Keying by field definition id means an edit nobody looked at still refuses. |
| A constructor option or a Project setting | Same failure, one scope wider: it would be set once and forgotten, and the person losing the content is never the person who set it. |
| Report the loss after applying it | The caller writes the Entry files as part of the update, so "after" is after the content is gone. |
| Let a migration refuse too | A Project stays unreadable until its migrations have run, so the refusal would be a Project nobody can upgrade. `ProjectService` accepts what its own migration deletes, reading the ids out of the refusal, and logs the ids and the count. |

## What counts as content

`holdsContent` decides, and it reads any stored slot as content. A `string`, `number` or `mdast` Value that is `null` in every language holds nothing, an empty reference or Component Value holds nothing, and removing either applies straight away.

A `boolean` is the one judgement call. It is never null, so every Entry carries one from the moment the field exists, and Core cannot tell a `false` somebody chose from a `false` nobody touched. It counts as content, which is the same answer a `string` field with a configured default gets.

## See also

- [`../docs/schema-changes.md`](../docs/schema-changes.md) - the cascade and the acceptance from the consumer's side
- [`logging.md`](./logging.md) - why the refusal's message carries ids and counts only
- [`migration-and-history-flow.md`](./migration-and-history-flow.md) - the upgrade path that accepts its own migration's loss
- [`error-handling-internals.md`](./error-handling-internals.md) - `withGitRollback` and the envelope an update throws through
