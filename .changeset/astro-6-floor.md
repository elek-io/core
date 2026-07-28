---
'@elek-io/core': minor
---

The `astro` peer dependency floor moved from 6.0.0 to 6.1.3, making the range `^6.1.3 || ^7.0.0`. On Astro 6.0.0 through 6.1.2 only the first `astro build` of a site emits its image Assets. Every build after it fails with `LocalImageUsedWrongly` until `.astro` is deleted, because those versions do not rebuild their image imports from a restored content store and the Assets loader skips Assets that have not changed. Astro fixed it in 6.1.3. Consumers on `^6.0.0` who install today already resolve above the floor, only an exact pin below 6.1.3 has to move.
