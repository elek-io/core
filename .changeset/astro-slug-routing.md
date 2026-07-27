---
'@elek-io/core': minor
---

The new `elekSlugPaths()` routes Entries by a `slug` field instead of by their UUID. It takes a collection and the field to route by, and returns what `getStaticPaths` expects:

```astro
---
// src/pages/[language]/[slug].astro
export async function getStaticPaths() {
  const posts = await getCollection('websitePosts');
  return elekSlugPaths(posts, { slugField: 'slug' });
}

const { entry } = Astro.props;
---
```

Every language of the Collection gets its own path, so `/en/hello-world` and `/de/hallo-welt` reach the same Entry, and an Entry without a slug in a language simply gets no path there. Pass `language` to route a single one, and the params hold only the slug. A Collection may define several slug fields, which is why the field is named per call.

Nothing about the store changes. Entries stay keyed by their UUID, so `getEntry()` and every reference between Entries keeps working as before, and a Collection without a slug field keeps routing by UUID.
