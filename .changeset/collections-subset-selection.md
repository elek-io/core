---
'@elek-io/core': minor
---

`elekCollections()` takes a second argument saying exactly what the site reads, so a Project with twenty Collections no longer syncs twenty to render two. An unread Collection costs a file read and a schema validation per Entry on every sync, and an unread Assets collection copies every binary of its Project into the site each time.

```typescript
export const collections = {
  ...(await elekCollections(config, {
    collections: { website: ['pages'], shop: ['products'], blog: ['posts'] },
    assets: { website: { imageDir: './src/media' }, shop: true },
  })),
};
```

That derives `websitePages`, `shopProducts`, `blogPosts`, `websiteAssets` and `shopAssets`, and nothing else. One rule covers both keys: **a key you leave out contributes nothing, and so does an alias you leave out of a key.** So `{ collections: { website: ['pages'] } }` derives one collection and no Assets at all. Name Collections by their plural slug or their id, the same two a loader's `collectionIdOrSlug` takes. Under `assets`, `true` takes the default directories and an object sets `imageDir` and `publicDir`.

`elekCollections(config)` with no second argument still derives everything, for finding your way around a Project before you know what it holds. It now warns that it did, naming the count, since it is not the shape to ship. `ELEK_IO_LOG_LEVEL=error` silences that for anyone who means it.

Three mistakes now fail the build instead of passing quietly, because each would otherwise produce exactly what success produces and send you looking for a broken loader: a name matching no Collection of the Project it is listed under, a selection deriving nothing at all, and a derived Collection that can reference Assets from a Project whose Assets were left out. The last one is a content-model check, so it fires while the config is read rather than when a page renders a reference it cannot resolve.

Because the options are now a complete list, `assets: false` is gone, as is the per-alias `false`. Leaving the key or the alias out says the same thing.
