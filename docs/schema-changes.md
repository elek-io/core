# Schema Changes

What happens to existing content when you edit a Collection's or Component's field definitions. Changing a schema in elek.io Core is not just a metadata edit - Core cascades the change into every affected Entry so stored content stays valid against its schema, all in a single commit.

For the field types this operates on, see [`fields.md`](./fields.md). For the data model, see [`concepts.md`](./concepts.md).

## The golden rule: Field definitions are matched by `id`

Every field definition has a stable `id` (UUID). The cascade matches old and new definitions **by `id`, never by `slug`**.

- Keep a field's `id` and you keep its data - even if you rename its `slug` or change its type.
- Give a field a new `id` (even with the same `slug`) and Core treats it as **removing** the old field and **adding** a new one - the old content is dropped.

When you call `core.collections.update()` or `core.components.update()`, always send back the existing field definitions with their original `id`s, changing only what you intend to change.

## What cascades where

- **Collection field definitions** → every Entry in that Collection.
- **Component field definitions** → every Entry whose Collection has a `dynamic` field referencing that Component, transformed at the level of each Component **item**. References are followed transitively (a Component referenced by another Component is still reached), with cycle protection.

## How each change is handled

Core diffs old vs new definitions into three categories - `added`, `removed`, `updated` (any property differs) - and transforms each affected Entry accordingly.

| Change                                      | Effect on existing Entries                                                       | Data loss?            | Needs resolution?                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| **Add** an optional field                   | Value populated with the default (or `null` / empty per language)                | No                    | No                                                             |
| **Add** a required field with a default     | Value populated with the default, replicated to every language                   | No                    | No                                                             |
| **Add** a required field, no default        | -                                                                                | No                    | **Yes** (`missing_required`)                                   |
| **Remove** a field                          | Value is dropped from every Entry                                                | **Yes, permanent**    | No (silent)                                                    |
| **Rename** a field's `slug` (same `id`)     | Value is moved to the new slug, content preserved                                | No                    | No                                                             |
| **Change** a field's type / constraints     | Old value re-validated against the new schema, kept if it passes                 | Only if it can't pass | **Yes** if it fails (`type_mismatch` / `constraint_violation`) |
| **Turn** a field unique (`isUnique` on, or add a `slug` field) | Existing values scanned for cross-Entry duplicates per language | No | **Yes** if duplicates exist (`unique_collision`) |
| **Narrow** `ofComponents` / `ofCollections` | Component items / Entry references no longer allowed are stripped (per language) | **Yes, permanent**    | No (silent)                                                    |

### Deterministic transforms are applied automatically

Renames, removals, additions with a usable default, and allowlist narrowing are unambiguous, so Core applies them without asking. Two of these **discard content silently**:

- **Removing a field** permanently drops its value from every Entry.
- **Narrowing `ofComponents` or `ofCollections`** strips items/references that are no longer allowed. An empty allowlist means "all" (nothing is stripped). Asset references are never stripped.

There is no separate confirmation step for these - the commit is made as part of the update. Treat field removal and allowlist narrowing as destructive operations.

### Default values for added Fields

A newly added field's value is built per its type:

- A configured `defaultValue` is replicated to every Project language.
- Optional `string` / `number` / `mdast` fields get `null` per language. `reference` fields get an empty array per language. `dynamic` fields get an empty array.
- `boolean` (`toggle`) fields always get a value (their default, or `false`) - they are never null.
- A **required** field with **no** default cannot be auto-filled and raises a `missing_required` issue (see below).

## Resolving non-deterministic changes

Some changes can't be resolved automatically - Core can't guess what a value should become. These raise **issues** and the update fails with a `CoreError` of type `Conflict` until you supply resolutions. The four issue types:

- `missing_required` - a required field was added with no default.
- `type_mismatch` - a field's `valueType` changed and an existing value doesn't fit the new type.
- `constraint_violation` - a constraint tightened (e.g. `min`/`max`, or `isRequired` toggled on) and an existing value no longer satisfies it.
- `unique_collision` - a field was made unique (or a `slug` field was added) over a Collection that already holds the same value in more than one Entry for the same language. The first holder is kept and every other Entry is flagged.

The unresolved issues are attached as the **`cause`** of the thrown `Conflict` error - an array where each entry describes one problem:

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

A `unique_collision` issue is shaped a little differently. It sets `transformedValues` to `{}` and has no `currentValue`. Instead it carries `value` (the colliding string), `language` (the slot it collides in), and `conflictingEntryId` (the kept Entry that already holds the value). These are the same fields as the `UniqueValueConflict` thrown on a per-Entry create or update, so an editor renders both the same way.

### The resolution workflow

Retry the update with a `resolutions` map keyed by Entry id, then field slug, to the corrected `Value`. Resolutions are type-checked against the new field's schema, and an invalid one throws `BadRequest`. For a `unique_collision` the corrected `Value` must be unique within the Collection for that `language`, since reusing the colliding value just fails the scan again.

```typescript
import { CoreError } from '@elek-io/core';

const updatedDefinitions = /* the Collection's fieldDefinitions with your edits */;

try {
  await core.collections.update({
    ...collection,
    projectId: project.id,
    fieldDefinitions: updatedDefinitions,
  });
} catch (error) {
  if (error instanceof CoreError && error.type === 'Conflict') {
    const issues = error.cause; // array of issue objects shown above

    // Build a corrected value for each issue
    const resolutions = {};
    for (const issue of issues) {
      resolutions[issue.entryId] ??= {};
      resolutions[issue.entryId][issue.fieldSlug] = /* a valid Value for the new schema */;
    }

    // Retry - deterministic transforms still apply, plus your resolutions
    await core.collections.update({
      ...collection,
      projectId: project.id,
      fieldDefinitions: updatedDefinitions,
      resolutions,
    });
  } else {
    throw error;
  }
}
```

`core.components.update()` takes the same `resolutions` shape. For Component-item issues, use the `componentItemId` on each issue to target the right item.

## Atomicity

The whole cascade is transactional. The Collection (or Component) file and every affected Entry are written, then committed once. The operation is wrapped in Core's git rollback (see [`error-handling.md`](./error-handling.md#withgitrollback---transactional-git-operations)) - if anything fails, including an unresolved issue, the working tree is restored and nothing is committed. Every transformed and resolved value is re-validated against the new schema before it is written.

## Guardrails

- **No circular Components.** Creating or updating a Component whose `dynamic` fields reference back into itself (directly or transitively) throws `BadRequest`.
- **No deleting a referenced Component.** `core.components.delete()` throws `Conflict` if any Collection or Component still references the Component. Remove the references first.
- **Collection / Component slug uniqueness** is enforced per Project. Field-definition slugs need not be globally unique - they are matched by `id`, which is what makes renames safe.

## See Also

- [`fields.md`](./fields.md) - field definition shapes and constraints
- [`migration-and-history-flow.md`](./migration-and-history-flow.md) - version-driven migrations (a different mechanism: upgrading old files to a new Core schema)
- [`error-handling.md`](./error-handling.md) - `CoreError`, `Conflict`, and `withGitRollback`
- [`usage.md`](./usage.md) - creating and updating Collections, Components and Entries
