# References

A reference is a typed pointer from one piece of content to another. Instead of copying
data or hard-coding a URL, an Entry stores the id of the thing it points at, and Core keeps
those pointers honest. This page explains what a reference is, where references can live,
how Core stops them from breaking, and the one case it cannot fully prevent.

elek.io Projects are managed only through Core, either directly or through elek.io Desktop
(which uses Core). Editing a Project's files by hand or running git commands against it
yourself is not supported, so this page describes how integrity holds for changes made
through Core.

If you are looking for the field-definition options (`ofCollections`, `min` / `max`), see
[`fields.md`](./fields.md). For rendering reference nodes inside markdown bodies, see
[`markdown-content.md`](./markdown-content.md). This page is the cross-cutting story that
ties those together.

## What a reference points at

Only Entries hold references, in their field values. A reference can point at:

- an **Asset** (a file in the project's media library),
- another **Entry** (in the same or a different Collection),
- a **Collection** as a whole (representable in the data model but not produced by any field
  type today, see [Edge cases](#edge-cases)).

An Entry reference always carries the target's `collectionId` alongside its `id`, because
Core's storage layout needs both to find the file. An Asset reference carries only an `id`.

## Where references live (the three carriers)

The same reference can sit in three different places inside an Entry's values. Any feature
that reads or protects references has to look in all three.

```
Entry "article-42"
└─ values
   ├─ author     flat reference field          ──► entry  a1c3…  (Collection "authors")
   ├─ hero       flat reference field          ──► asset  9f0b…
   ├─ body       markdown (mdast) field
   │   └─ …/paragraph/entryReference           ──► entry  77de…  (Collection "products")
   └─ blocks     dynamic / component field
       └─ item[0] "media"
           └─ image  flat reference field      ──► asset  4400…   (nested one block deep)
```

1. **Flat reference field** (`valueType: 'reference'`). A per-language array of
   `{ objectType, id }` pointers. The two field types are `asset` and `entry`.
2. **Markdown body** (`valueType: 'mdast'`). References are first-class nodes in the tree,
   `assetReference` and `entryReference`, not opaque URLs.
3. **Nested in a component block** (`valueType: 'component'`, the `dynamic` field type).
   A reference can sit inside a repeatable component item, which can itself nest further
   component items, so a reference can be arbitrarily deep.

## Two gates keep references honest

Core protects reference integrity at two moments. Write time stops you from creating a
broken reference. Delete time stops you from breaking an existing one.

```
   ┌──────────────────────────┐          ┌──────────────────────────┐
   │   WRITE  (create/update) │          │          DELETE          │
   ├──────────────────────────┤          ├──────────────────────────┤
   │ Does the target exist?   │          │ Is anything still        │
   │ Is the Asset MIME ok?    │          │ pointing at me?          │
   │ Is ofCollections ok?     │          │                          │
   │                          │          │                          │
   │  fail ─► rejected        │          │  yes  ─► blocked         │
   │  ok   ─► written         │          │  no   ─► removed         │
   └──────────────────────────┘          └──────────────────────────┘
```

Both gates run before anything touches disk, so a rejected write or a blocked delete leaves
the working tree and git history exactly as they were.

## Write-time validation

When you create or update an Entry, Core validates every reference in its values, including
those nested in markdown bodies and component blocks. A write is rejected with a
`BadRequest` error (`"Entry contains invalid references"`) if any reference is broken. The
two problems it reports are:

- **`reference_not_found`** the referenced Asset or Entry file does not exist on disk.
- **`asset_mime_mismatch`** the referenced Asset's MIME type is not in the field's
  `ofAssetMimeTypes` allowlist.

The error carries one issue per problem, each pinpointing the field, language, and position
(including the component path for nested references) so an editor can highlight it.

`ofCollections` (which Collections an `entry` reference may target) is checked one layer up,
by the generated field schema, before this step runs.

## Delete protection

Removing content that something still points at would leave a dangling reference behind. To
prevent that, Asset, Entry, Collection, and Component deletes are all blocked while they are
still referenced. The first three share one mechanism (they are pointed at by Entry values).
Component delete is a separate case (see [Component delete](#component-delete)).

The rule for the value-level deletes is one on-demand scan:

```
delete an Asset / Entry / Collection
            │
            ▼
   scan every Entry in the Project
   that is NOT itself being deleted
            │
            ▼
   does any surviving Entry still
   point at what I am deleting?
            │
       ┌────┴─────┐
      yes         no
       │           │
       ▼           ▼
    BLOCK        DELETE
  Conflict +    remove it
  list of       (and commit)
  referrers
```

"Not itself being deleted" is the important part, and it is what makes deleting one Entry
different from deleting a whole Collection.

### Deleting an Asset or an Entry

Core scans every Entry in the Project. If a surviving Entry still references the target, the
delete is blocked. An Entry that references only itself does not block its own deletion,
because that reference disappears together with the Entry.

### Deleting a Collection

A Collection delete removes the Collection and every Entry inside it at once. The hazard is
only the references that point **into** the Collection from Entries that **survive**.
References between Entries that are all being deleted together vanish cleanly and must not
block. This is the same idea as the self-reference rule, widened from one Entry to the whole
Collection.

```
        Collection C  (being deleted)            other Collections  (surviving)

        ┌───────────────────────────┐            ┌──────────────────────────┐
        │  entryA ───────► entryB   │            │  entryX ────────────────┐│
        │     ▲              │      │            │                         ││
        │     └──────────────┘      │            └─────────────────────────┼┘
        │            (internal)     │                                      │
        │  entryB ──────────────────┼──► out to a survivor                 │
        └───────────────────────────┘                                      │
                       ▲                                                   │
                       └───────────────────────────────────────────────────┘
                                          into C  (external)

   internal  (A ─► B, both deleted)      vanishes cleanly      ─►  does NOT block
   out of C  (B ─► survivor)             source is deleted     ─►  does NOT block
   into  C   (X ─► something in C)       survivor left dangling ─► BLOCKS
```

Core finds the "into C" case cheaply. Every Entry reference already carries the `collectionId`
of its target, so a reference points into Collection C exactly when its `collectionId` is C.
Core never has to enumerate the doomed Entries. It scans the Entries outside C in a single
pass and blocks if any of them references in.

### Component delete

A Component is referenced by Collections and other Components through their field
definitions (a `dynamic` field listing the Component in `ofComponents`), not through Entry
values. So Component delete is protected by a different check: it is blocked while any
Collection or Component field definition still uses it. Its `Conflict` names the referring
entities in the message text rather than carrying the structured `ReferencingEntry` list
described below.

## The Conflict contract (for consumers)

When an Asset, Entry, or Collection delete is blocked, Core throws a `Conflict` error whose
`cause` is a plain array of `ReferencingEntry` records, one per referring Entry. An editor
can use these to link the user straight to the content they need to fix first.

```ts
interface ReferencingEntry {
  collectionId: string; // the Collection the REFERRING Entry lives in
  entryId: string; // the REFERRING Entry
  fieldSlug: string; // the field that holds the reference
  via: 'reference' | 'mdast'; // flat field or markdown node
  componentPath: ReferenceComponentPathSegment[]; // hops through dynamic blocks, empty if top-level
}
```

The same shape is used for all three value-level deletes, so a consumer handles one contract
everywhere: catch a `Conflict`, read `cause` as `ReferencingEntry[]`, and link to each
`(collectionId, entryId)`. Note that `collectionId` and `entryId` always describe the
referrer (the surviving Entry to edit), not the thing being deleted.

## Scope and guarantees

- **On-demand, no index.** Detection scans the live working tree on every delete rather than
  keeping a stored reverse index. This costs one read per existing Entry per delete, so it
  scales poorly for very large Projects, but it stays correct against content brought in by a
  sync (a merge of another machine's changes) that never passed through a create or update
  call.
- **Work tree only.** Only the current `work` tree is considered, not content preserved in
  released (`production`) history. A `work` delete does not touch the `production` copies, so
  a reference that lives only in a past release is not affected by it.

### The one case Core cannot fully prevent

Every change made through Core goes through the two gates above, so no single create, update,
or delete leaves a dangling reference behind. The exception is a sync that merges concurrent
changes.

Core (and Desktop) sync a Project by pulling and merging, which is what lets people work
offline and across machines. A merge reconciles two independently valid histories, so it can
combine a delete made on one side with a new reference added on the other into a result that
neither change produced alone. No per-operation check can catch this, because each side was
valid on its own. It is inherent to a distributed, git-backed model and is the reason
detection is an on-demand scan rather than a stored index. In practice it stays rare.

One smaller nuance: a field `defaultValue` is not counted as a reference. A reference embedded
in a Collection or Component field's `defaultValue` only becomes live once it is stamped into
an Entry, so it is not protected until then.

## Edge cases

A reference whose `objectType` is `collection` (pointing at a Collection itself rather than
at one of its Entries) is representable in the data model, but no field type produces one and
no supported workflow creates one. Collection delete still checks for it and blocks, as a
defensive measure so that a future format or field type cannot quietly reintroduce the gap.
Asset and Entry deletes never encounter it, because their targets are not Collections.

## See Also

- [`fields.md`](./fields.md) - the `asset` and `entry` reference field definitions and their options
- [`markdown-content.md`](./markdown-content.md) - `assetReference` / `entryReference` nodes and how to render them
- [`error-handling.md`](./error-handling.md) - the `CoreError` types, including `Conflict` and `BadRequest`
- [`concepts.md`](./concepts.md) - Values and the overall data model
- [`storage-layout.md`](./storage-layout.md) - why an Entry reference carries both `collectionId` and `id`
