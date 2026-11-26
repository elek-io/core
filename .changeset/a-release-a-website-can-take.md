---
'@elek-io/core': minor
---

**A Release is refused while a website of the Project cannot take one of its Entries, so a Release never ships content a website cannot take.** Every Destination is checked against what `draft` holds before a Release is tagged, and `prepare()` answers the same items before the editor starts one.

```typescript
const prepared = await core.releases.prepare({ projectId: project.id });
prepared.destinationIssues; // each Entry a website cannot take, and why
```

- `prepare()` returns a `ReleasePreparation`, which is the `ReleaseDiff` it answered before plus `destinationIssues`, empty while nothing stops the Release.
- `create()` and `createPreview()` throw `Conflict` while anything is left, with every item on the `cause` in the shape `core.destinations.checkAll()` answers. Nothing is written first, so the call is retried once the Mapping covers the rest.
- It holds from the moment a website is added. A field definition or a Collection a website needs that is deleted stops the next Release and is named.
- A version of a theme waiting beside the one a website uses never stops a Release, and neither does a Contract no website follows.
- A Project without a Destination releases as it did before, and its `destinationIssues` is an empty array.

**What a Release changes names the websites of the Project and the Contracts it keeps**, beside the Collections, Components, Assets and Entries it named before.

- `destinationChanges` reports a website added, gone or renamed, the version of its theme's Contract it uses, its Mapping, the version waiting beside it and what it created from its theme.
- `contractChanges` reports a Contract the Project keeps, one it keeps no longer, its name and each copy of a version it gained.
- A website or a Contract that is gone, and either of them renamed, is a major bump, because a site naming that website by name, or stating that Contract's old name in its own, can no longer build. Everything else either of them holds is a patch, while either of them added and a copy of a version the Project gained are a minor.
