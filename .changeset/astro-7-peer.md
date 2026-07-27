---
'@elek-io/core': minor
---

The `astro` peer dependency range now includes Astro 7 (`^6.0.0 || ^7.0.0`), so consumers on Astro 7 no longer get a peer warning. Astro 7 leaves the content layer untouched, so the loaders, the `elek()` integration and programmatic `sync` work unchanged, verified by running the full suite against it. The supported floor stays at Astro 6.0.0, and Astro 7 requires the same `zod` range as Astro 6, so the `zod` floor does not move either.
