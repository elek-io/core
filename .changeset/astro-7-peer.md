---
'@elek-io/core': minor
---

The `astro` peer dependency range now includes Astro 7, so consumers on Astro 7 no longer get a peer warning. Astro 7 leaves the content layer untouched, so the loaders, the `elek()` integration and programmatic `sync` work unchanged, verified by running the full suite against it. Astro 7 requires the same `zod` range as Astro 6, so the `zod` floor does not move.
