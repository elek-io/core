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

**An older Project has to add the key to every `collection.json` by hand.** There is no migration, so until then Core refuses to read each Collection, and with it the Project. Pick a one-line field definition of that Collection and add its `id`:

```diff
   "icon": "home",
+  "entryTitleFieldDefinitionId": "<the id of one of its one-line field definitions>",
   "fieldDefinitions": [
```

See `docs/fields.md`.
