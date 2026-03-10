---
'@elek-io/core': minor
---

- Access entry values by meaningful names: `entry.values.title` instead of `entry.values.find(v => v.fieldDefinitionId === '550e8400-...')`
- Reference collections by slug in API routes: `/collections/blog-posts/entries` instead of `/collections/550e8400-.../entries` and the astro integration
