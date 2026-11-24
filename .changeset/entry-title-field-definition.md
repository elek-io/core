---
'@elek-io/core': minor
---

**Every Collection names the field definition whose Value titles its Entries**, in the new required `entryTitleFieldDefinitionId`. Until now every app guessed, usually by taking the first field that held text, so the same Entry was named differently in two apps and reordering a Collection's fields renamed every Entry in it.

```typescript
const nameFieldDefinitionId = uuid();

await core.collections.create({
  projectId: project.id,
  icon: 'package',
  name: {
    singular: { en: 'Product' },
    plural: { en: 'Products' },
  },
  slug: { singular: 'product', plural: 'products' },
  description: { en: 'The products we offer' },
  entryTitleFieldDefinitionId: nameFieldDefinitionId,
  fieldDefinitions: [
    { id: nameFieldDefinitionId, slug: 'name', fieldType: 'text' /* ... */ },
  ],
});
```

What it accepts:

- One of that Collection's own field definitions, at the top level or inside a group. A group's own id is not one, and neither is a field definition of a Component, which is shared between Collections.
- A one-line field type only: `text`, `email`, `url`, `ipv4`, `date`, `time`, `datetime`, `telephone`, `slug`, `select`. `entryTitleFieldTypeSchema` parses that list and `EntryTitleFieldType` is its type, so an app offers exactly those. `textarea` is not one of them.
- `create` and `update` both require it, so a Collection needs at least one one-line field definition. Either call throws `BadRequest` and writes nothing when the id is missing or names something that cannot title an Entry.
- An update that removes the named field definition, or changes it to a type that cannot title an Entry, is refused unless the same call names another one.

**An older Project has to add the key to every `collection.json` by hand.** There is no migration, and nothing is loud until a Collection is read. `projects.read()` still opens the Project, `collections.count()` still counts the Collection, and `collections.list()` answers it in `total` while leaving it out of `list`, so it drops out of a list with no error. Its Entries still list and read. `collections.read()` throws `Internal`, as it does for any `collection.json` Core cannot parse, and `projects.upgrade()` refuses the whole Project with `BadRequest`. Pick a one-line field definition of that Collection and add its `id`:

```diff
   "icon": "home",
+  "entryTitleFieldDefinitionId": "<the id of one of its one-line field definitions>",
   "fieldDefinitions": [
```

A Collection with no one-line field definition at all, such as one holding only `markdown` and `asset` fields, has nothing to pick. Add a one-line field definition to its `fieldDefinitions` too and name that one. Its Entries hold no Value for it until each is updated, so there is nothing to read as their title yet.

A read at a `commitHash` an older Core wrote keeps failing after the edit, because the Project's history still holds the file without the key.

See `docs/fields.md`.
