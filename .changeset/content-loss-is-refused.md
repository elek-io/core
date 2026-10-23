---
'@elek-io/core': minor
---

**A model change that would delete stored content is refused.** `collections.update()` and `components.update()` used to apply three changes that permanently drop content, without asking and without reporting it: removing a field definition, narrowing a `dynamic` field's `ofComponents` and narrowing an `entry` field's `ofCollections`. The values were dropped from every Entry and the change was committed. Both methods now throw `Conflict` before anything is written, and the Project is left byte for byte as it was. See `docs/schema-changes.md`.

**If your script relied on the silent apply, it has to accept the loss.** Catch the `Conflict`, read the `content_loss` issues off `error.cause`, and send the same update again with `acceptedContentLoss`, a list of field definition ids:

```typescript
import { CoreError, type EntryIssue } from '@elek-io/core';

try {
  await core.collections.update({ ...collection, projectId, fieldDefinitions });
} catch (error) {
  if (error instanceof CoreError && error.type === 'Conflict') {
    const issues = error.cause as EntryIssue[];
    await core.collections.update({
      ...collection,
      projectId,
      fieldDefinitions,
      acceptedContentLoss: issues
        .filter((issue) => issue.issue === 'content_loss')
        .map((issue) => issue.fieldDefinitionId),
    });
  }
}
```

- **An id you do not name still refuses**, so an acceptance written for one edit never carries a second one through. There is no default, no constructor option and no Project setting that turns the guard off, and sending the same update again unchanged refuses again.
- **An update that drops no stored value is never refused.** A removed field no Entry holds a value for, a Collection with no Entries, a Component no Collection references, an empty allowlist, a widened or reordered one, a renamed slug and an added field all apply as before.
- **New issue type `content_loss`**, reported in the same list and the same error as the issues you already resolve, so one call reports everything about one update. Each one carries the Collection, the Entry, the field definition's id and slug, the Component item where there is one, the language where the drop is per language, and a `currentValue` holding exactly what would go.
- **New exported types** `EntryIssue`, `EntryIssueType`, `EntryIssueLocation`, `EntryTransformIssue`, `UniqueCollisionIssue`, `ContentLossIssue`, `ContentLossReason`, `ValueLoss`, `FieldRemovedLoss`, `ComponentsNarrowedLoss` and `CollectionsNarrowedLoss`. `EntryIssue` is a discriminated union now, so `issue.currentValue` needs a `switch` on `issue` first and a type added later stops an exhaustive consumer from compiling.
- **Narrowing a Component's own `dynamic` or `entry` field** answered with a `constraint_violation` asking for a corrected Value, which no Value could satisfy. It answers with the same refusal as a Collection's now, and applies once accepted.
- **`projects.upgrade()` accepts the content a migration Core ships deletes**, and nothing else, so a Project whose migration drops a field definition still upgrades. Each accepted loss is written to the log as ids and a count.
