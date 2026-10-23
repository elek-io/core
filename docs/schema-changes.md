# Schema changes

What happens to existing content when you edit a Collection's or Component's field definitions. Changing a schema in elek.io Core is not just a metadata edit - Core cascades the change into every affected Entry so stored content stays valid against its schema, all in a single commit.

For the field types this operates on, see [`fields.md`](./fields.md). For the data model, see [`concepts.md`](./concepts.md).

## The golden rule: field definitions are matched by `id`

Every field definition has a stable `id` (UUID). The cascade matches old and new definitions **by `id`, never by `slug`**.

- Keep a field's `id` and you keep its data - even if you rename its `slug` or change its type.
- Give a field a new `id` (even with the same `slug`) and Core treats it as **removing** the old field and **adding** a new one - the old content is dropped.

When you call `core.collections.update()` or `core.components.update()`, always send back the existing field definitions with their original `id`s, changing only what you intend to change.

## What cascades where

- **Collection field definitions** → every Entry in that Collection.
- **Component field definitions** → every Entry whose Collection has a `dynamic` field referencing that Component, transformed at the level of each Component **item**. References are followed transitively (a Component referenced by another Component is still reached), with cycle protection.

## How each change is handled

Core diffs old vs new definitions into three categories - `added`, `removed`, `updated` (any property differs) - and transforms each affected Entry accordingly.

| Change | Effect on existing Entries | Data loss? | Needs an answer? |
| --- | --- | --- | --- |
| **Add** an optional field | Value populated with the default (or `null` / empty per language) | No | No |
| **Add** a required field with a default | Value populated with the default, replicated to every language | No | No |
| **Add** a required field, no default | - | No | **Yes**, a resolution (`missing_required`) |
| **Remove** a field | Value is dropped from every Entry | **Yes, permanent** | **Yes**, an acceptance (`content_loss`) |
| **Rename** a field's `slug` (same `id`) | Value is moved to the new slug, content preserved | No | No |
| **Change** a field's type / constraints | Old value re-validated against the new schema, kept if it passes | Only if it can't pass | **Yes** if it fails, a resolution (`type_mismatch` / `constraint_violation`) |
| **Turn** a field unique (`isUnique` on, or add a `slug` field) | Existing values scanned for cross-Entry duplicates per language | No | **Yes** if duplicates exist, a resolution (`unique_collision`) |
| **Narrow** `ofComponents` / `ofCollections` | Component items / Entry references no longer allowed are stripped (per language) | **Yes, permanent** | **Yes**, an acceptance (`content_loss`) |

### Deterministic transforms are applied automatically

Renames and additions with a usable default are unambiguous and carry no loss, so Core applies them without asking.

Two changes are just as unambiguous and **delete stored content**, so Core refuses the update until you accept the loss:

- **Removing a field** drops its value from every Entry, and from every Component item when the field belongs to a Component.
- **Narrowing `ofComponents` or `ofCollections`** strips Component items and Entry references that are no longer allowed. An empty allowlist means "all" (nothing is stripped). Asset references are never stripped.

A field whose Value holds nothing in any language is no loss, so removing it applies straight away. The same goes for a Collection with no Entries, and for a Component no Collection references.

Removing a field, narrowing a `dynamic` field's `ofComponents` and narrowing an `entry` field's `ofCollections` each make the next Release a major one, see [`releases.md`](./releases.md#every-change-a-diff-can-carry).

### Default values for added fields

A newly added field's value is built per its type:

- A configured `defaultValue` is replicated to every Project language.
- Optional `string` / `number` / `mdast` fields get `null` per language. `reference` fields get an empty array per language. `dynamic` fields get an empty array.
- `boolean` (`toggle`) fields always get a value (their default, or `false`) - they are never null.
- A **required** field with **no** default cannot be auto-filled and raises a `missing_required` issue (see below).

## The issues an update reports

An update Core cannot carry out as sent fails with a `CoreError` of type `Conflict`. Its `cause` lists every issue of that one call, so you see everything about one update at once. The five issue types:

- `missing_required` - a required field was added with no default.
- `type_mismatch` - a field's `valueType` changed and an existing value doesn't fit the new type.
- `constraint_violation` - a constraint tightened (e.g. `min`/`max`, or `isRequired` toggled on) and an existing value no longer satisfies it.
- `unique_collision` - a field was made unique (or a `slug` field was added) over a Collection that already holds the same value in more than one Entry for the same language. The first holder is kept and every other Entry is flagged.
- `content_loss` - the change would delete stored content. You accept it rather than resolving it, see [accepting content loss](#accepting-content-loss).

The first four need a **resolution**, a corrected `Value`. Branch on `issue` to tell them apart, never on the message. `EntryIssue`, `ContentLossIssue` and `EntryIssueType` are exported, so a `switch` over `issue` is exhaustive and a type added later fails to compile.

The issues are attached as the **`cause`** of the thrown `Conflict` error - an array where each entry describes one problem:

```typescript
{
  entryId: '...',           // the Entry that needs attention
  collectionId: '...',
  fieldDefinitionId: '...',
  fieldSlug: 'price',       // the Field, by its new slug
  issue: 'type_mismatch',   // why it can't be auto-resolved
  currentValue: { /* ... */ },        // the existing value, if any
  componentItemId: '...',             // present for Component-item issues
  transformedValues: { /* ... */ },   // the Entry's values after deterministic transforms
}
```

A `unique_collision` issue is shaped a little differently. It sets `transformedValues` to `{}`, has no `currentValue`, and carries three fields of its own:

- `value`, the colliding string
- `language`, the slot it collides in
- `conflictingEntryId`, the kept Entry that already holds the value

These are the same fields as the `UniqueValueConflict` thrown on a per-Entry create or update, so an editor renders both the same way.

A `content_loss` issue adds `reason`, which says what about the change deletes the content, `currentValue`, which holds exactly what would go, and `itemCount` and `language` where the drop is partial:

| `reason` | `currentValue` holds | Also carries |
| --- | --- | --- |
| `field_removed` | the whole Value of the removed field | - |
| `components_narrowed` | a Component Value holding only the items that would be stripped | `itemCount` |
| `collections_narrowed` | a reference Value holding only the Entry references that would be stripped | `itemCount`, `language` |

### The resolution workflow

Retry the update with a `resolutions` map keyed by Entry id, then field slug, to the corrected `Value`. Resolutions are type-checked against the new field's schema, and an invalid one throws `BadRequest`.

A field slug the new definitions do not declare throws `BadRequest` too, naming the Entry and the slug. It is checked before anything is written, so a stale resolution fails the whole update rather than reaching one Entry. For a `unique_collision` the corrected `Value` must be unique within the Collection for that `language`, since reusing the colliding value just fails the scan again.

**Skip the `content_loss` issues when you build the map.** A removed field's slug is one the new definitions do not declare, so resolving it is the `BadRequest` above. They are accepted instead, in the same retry, see [accepting content loss](#accepting-content-loss).

```typescript
import { CoreError, type EntryIssue } from '@elek-io/core';

const updatedDefinitions = /* the Collection's fieldDefinitions with your edits */;

try {
  await core.collections.update({
    ...collection,
    projectId: project.id,
    fieldDefinitions: updatedDefinitions,
  });
} catch (error) {
  if (error instanceof CoreError && error.type === 'Conflict') {
    const issues = error.cause as EntryIssue[];

    // Build a corrected value for each issue that asks for one
    const resolutions = {};
    for (const issue of issues) {
      if (issue.issue === 'content_loss') continue;
      resolutions[issue.entryId] ??= {};
      resolutions[issue.entryId][issue.fieldSlug] = /* a valid Value for the new schema */;
    }

    // Retry - deterministic transforms still apply, plus your resolutions
    // and your acceptance of whatever the change deletes
    await core.collections.update({
      ...collection,
      projectId: project.id,
      fieldDefinitions: updatedDefinitions,
      resolutions,
      acceptedContentLoss: issues
        .filter((issue) => issue.issue === 'content_loss')
        .map((issue) => issue.fieldDefinitionId),
    });
  } else {
    throw error;
  }
}
```

`core.components.update()` takes the same `resolutions` shape. For Component-item issues, use the `componentItemId` on each issue to target the right item.

## Accepting content loss

A `content_loss` issue has no resolution. There is no corrected `Value` for content a change deletes, so you say that you accept the loss instead:

- Send the same update again with `acceptedContentLoss`, a list of field definition ids.
- Core applies the loss for the ids you name and refuses for every id you do not, so an acceptance written for one edit never carries a second one through.
- Nothing else accepts it. There is no default, no constructor option and no Project setting, and sending the same update again unchanged refuses again.

```typescript
import { CoreError, type EntryIssue } from '@elek-io/core';

try {
  await core.collections.update({
    ...collection,
    projectId: project.id,
    fieldDefinitions: updatedDefinitions,
  });
} catch (error) {
  if (error instanceof CoreError && error.type === 'Conflict') {
    const issues = error.cause as EntryIssue[];
    const losses = issues.filter((issue) => issue.issue === 'content_loss');

    // Show the person what goes, then send the ids back to accept it
    await core.collections.update({
      ...collection,
      projectId: project.id,
      fieldDefinitions: updatedDefinitions,
      acceptedContentLoss: losses.map((loss) => loss.fieldDefinitionId),
    });
  } else {
    throw error;
  }
}
```

`core.components.update()` takes the same `acceptedContentLoss` shape and answers a destructive change with the same error and the same wording.

### What the upgrade does

`core.projects.upgrade()` accepts the content a migration Core ships deletes, and nothing else. A Project stays unreadable until its migrations have run, so a refusal there would leave a Project nobody can upgrade. Each accepted loss is written to the log as ids and a count.

## Atomicity

The whole cascade is transactional. The Collection (or Component) file and every affected Entry are written, then committed once. Every transformed and resolved value is re-validated against the new schema before it is written.

A refused update writes nothing at all. Core transforms every affected Entry in memory and collects the issues first, so a refusal leaves the Project byte for byte as it was rather than relying on the rollback to put it back. The rollback is still there for a failure that happens during the writes, and restores the working tree without committing.

## Guardrails

- **No content a field definition still declares is deleted without an acceptance.** A change that would drop such a stored Value throws `Conflict` until `acceptedContentLoss` names the field definition, see [accepting content loss](#accepting-content-loss).
- **An orphaned Value is outside that guarantee.** A Value whose slug none of the Collection's or Component's current field definitions declares is dropped by the next field definition change, with no refusal and no issue, because there is no field definition to name in the acceptance. Core wrote such slugs into Entries unvalidated before 0.24.0, so an older Project can still hold one.
- **No circular Components.** Creating or updating a Component whose `dynamic` fields reference back into itself (directly or transitively) throws `BadRequest`.
- **No deleting a referenced Component.** `core.components.delete()` throws `Conflict` if any Collection or Component still references the Component. Remove the references first.
- **Collection / Component slug uniqueness** is enforced per Project. Field-definition slugs need not be globally unique - they are matched by `id`, which is what makes renames safe.

## See also

- [`fields.md`](./fields.md) - field definition shapes and constraints- [`error-handling.md`](./error-handling.md) - `CoreError`, `Conflict`, and `withGitRollback`
- [`usage.md`](./usage.md) - creating and updating Collections, Components and Entries
