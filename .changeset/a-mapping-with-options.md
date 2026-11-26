---
'@elek-io/core': minor
---

**A Mapping fills each field of a Contract in one of four ways, so a theme's field takes what the Project holds however the two are shaped.** `fill` says which way, and a field filled from one field definition of the Project is one of them.

```typescript
await core.destinations.update({
  projectId: project.id,
  id: website.id,
  mapping: {
    collections: {
      [contractCarsId]: {
        from: {
          collectionId: vehicles.id,
          where: [{ fieldDefinitionId: status.id, equals: ['for-sale'] }],
        },
        fields: {
          [contractTitleId]: {
            fill: 'combined',
            fieldDefinitionIds: [make.id, model.id],
            separator: ' ',
          },
          [contractStatusId]: {
            fill: 'options',
            fieldDefinitionId: status.id,
            options: [{ from: 'for-sale', to: 'available' }],
          },
          [contractBodyId]: {
            fill: 'field',
            fieldDefinitionId: body.id,
            language: { order: ['de', 'en'] },
          },
        },
      },
    },
  },
});
```

- `fixed` takes a Value typed into the Mapping, in every language of the Project, and the field's own rules are read against it. A reference and Component items cannot be fixed, their ids belong to one Project.
- `combined` joins the Values of two field definitions or more into one text per language, leaving out the ones holding nothing there.
- `options` matches each option of a `select` field onto an option of the Contract's own, once in the Mapping rather than per Entry.
- `language` takes the Value of the first language of `order` holding one into every language of the Project, which is how a theme serving one language takes what an editor wrote in another.

**A website takes the Entries its Mapping's conditions let through, such as only the cars for sale.** `from.where` holds the conditions an Entry has to meet, all of them, and a Collection without one gives the website every Entry of it. An Entry the website leaves out raises nothing in a check and reaches no site, and one it takes while pointing at an Entry it leaves out is reported, because a page of it would link to something the website does not hold.

**The check says why a field cannot be filled the way it is mapped, before any Entry is read.** Two issues join the ones a Destination reports, `does_not_fit` for a Value of another kind, a fixed Value the field refuses, fields joined into a field taking no text, a condition on a Value there is nothing to compare and a Single Entry of the Contract filled from a Collection holding a list, and `option_not_matched` for an option of the Project's field that becomes none of the Contract's. `reference_not_taken` joins them for an Entry pointing at one the website does not take.

```typescript
const issues = await core.destinations.checkMapping({
  projectId: project.id,
  id: website.id,
  mapping: edited,
});
const values = await core.destinations.values({
  projectId: project.id,
  id: website.id,
  contractCollectionId: contractCarsId,
  entryId: entry.id,
});
```

`checkMapping()` answers what a Mapping that is not saved yet leaves the Contract without and reads no Entry, so an app checks what an editor is building before it saves it. `values()` answers one Entry's Values keyed by the field slugs of one Collection of the Contract, every way of filling applied, which is the shape a site reads and what an editor mapping a field sees of their own content. `update()` saves whatever a Mapping leaves unfilled, so an editor maps in steps, and the one Mapping it refuses is one filling a Collection its Contract does not hold.

**A website creates the Collection or the field its theme needs and the Project has nothing for, and the Mapping points at it right away.**

```typescript
await core.destinations.createCollection({
  projectId: project.id,
  id: website.id,
  contractCollectionId: contractCarsId,
});
```

- `createCollection()` writes the Collection the theme states with the Components its `dynamic` fields need, and `createFieldDefinition()` adds one field of the theme to the Collection of the Project filling its Collection.
- Every id is the Project's own, and the names, slugs, labels, descriptions, default values and rules are the theme's. A field pointing at another Collection of the Contract points at the Collection of the Project filling it.
- No Collection, Component or field definition the Project already holds is replaced. One the Project already carries under the theme's slug throws `Conflict` naming it, and so does a Collection or field of the Contract something already fills. A Component this website created from its theme before is used again rather than created twice, and it is recorded as this website's the moment it is written, so a create that refuses afterwards leaves a call made again that Component to use.
- `createdCollections()` answers which Collections the website created from its theme, so an app groups them under the website, and leaves out one deleted since.
- Adding a required field of the theme to a Collection that already holds Entries throws `Conflict`, the way a field definition change does, naming every Entry needing the Value. Send that Value per Entry under `resolutions`.

An Astro site reads all of it: the Values the way the Mapping fills them and the Entries its conditions let through. A site whose website leaves an Entry out never renders a page for it, and the build stops naming an Entry it takes that points at one it does not.
