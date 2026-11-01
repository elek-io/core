---
'@elek-io/core': minor
---

**A resolution for a Component field definition change lands in the Component item it answers for.** `core.components.update()` wrote it at the Entry's top level instead, reported success and committed. The item stayed without the Value it needed, so `core.projects.upgrade()` refused the Project from then on, and where the Component field shared its slug with one of the Entry's own fields, the Value somebody had written there was replaced with no error at all.

**The `resolutions` of `core.components.update()` take the Component item's id as a key of its own**, between the Entry's id and the field's slug. Every issue such an update raises carries a `componentItemId`, which is the key to read it from:

```typescript
// Before
resolutions[issue.entryId][issue.fieldSlug] = correctedValue;

// Now
resolutions[issue.entryId][issue.componentItemId][issue.fieldSlug] =
  correctedValue;
```

What that buys you:

- Two items of the same Component in one Entry each take their own corrected Value, and an item you leave out keeps the update refused with its own issue.
- An item nested inside another item's `dynamic` field is reached at any depth.
- Every other Value of the Entry stays as it is, its own fields included.
- An item id the Entry does not hold, an item belonging to another Component and a field slug the new definitions do not declare each throw `BadRequest` before anything is written, naming ids and slugs only.

**There is no compatibility path and no migration.** The former shape throws `BadRequest`, because its middle key is read as an item id now. Nothing repairs a Project an earlier version already wrote a top-level key into.

`core.collections.update()` is unchanged and keeps its two keys, the Entry's id and the field's slug, because no Collection issue belongs to a Component item. See `docs/schema-changes.md`.
