---
'@elek-io/core': minor
---

**A Collection can be limited to one Entry, a Single Entry, which is where one-off content such as contact details or the logo belongs.** Pass `isSingleEntry: true` to `core.collections.create()`. Left out, the Collection holds a list, and so does every Collection created before this option, whose `collection.json` carries no `isSingleEntry` and needs no migration.

```typescript
const contactDetails = await core.collections.create({
  projectId: project.id,
  isSingleEntry: true,
  icon: 'phone',
  name: {
    singular: { en: 'Contact details', de: 'Kontaktdaten' },
    plural: { en: 'Contact details', de: 'Kontaktdaten' },
  },
  slug: { singular: 'contact-details', plural: 'contact-details' },
  description: { en: 'How to reach us', de: 'Wie man uns erreicht' },
  fieldDefinitions: [/* as on any other Collection */],
});
```

- `core.entries.create()` throws `Conflict` for a second Entry, naming the Entry the Single Entry already holds, and writes nothing.
- Whether a Collection is a Single Entry is decided when it is created. `core.collections.update()` throws `Conflict` for any other value than the one it was created with, and takes that value, so sending back a Collection you read changes nothing.
- A Release diff says of an added or a deleted Collection whether it is a Single Entry, because the state the other side holds has no Collection to read it from.

**An Astro site reads a Single Entry as one item.** `elekCollections()` derives its collection like every other one, and `elekEntriesLoader` stores the one Entry under the id `single`, so no page needs the Entry's own id.

```typescript
const contact = await getEntry('websiteContactDetails', 'single');
const phone = contact?.data.phone.en ?? null;
```

`getEntry` answers `undefined` while the Single Entry holds no Entry yet, so such a site builds and the page decides what an empty one shows. A reference pointing into a Single Entry carries the referenced Entry's own id, which is no store id there, so read it with `single` too. Nothing outside the loaders changes: `core.entries.list()` answers a Single Entry with a list of one, as it does for every other Collection, and so do the local API and the generated client that read through it.
