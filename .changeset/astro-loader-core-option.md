---
'@elek-io/core': minor
---

The Astro content loaders no longer accept a `core` property. Their shared `ElekIoCore` instance is configured through the `ELEK_IO_*` environment variables of the build instead, so `ELEK_IO_DATA_DIR` reads from another data directory. This removes the footgun that only the first loader to run decided the options for every loader. The `elek()` integration keeps its own `core` option for the short-lived Core it provisions with.

The Astro rendering example in the markdown content docs now routes by Entry UUID, which is what the content layer store is keyed by, instead of a `slug` property that entry data never carried.
