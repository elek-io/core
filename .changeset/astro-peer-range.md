---
'@elek-io/core': patch
---

Narrow the optional `astro` peer dependency from `>=6.0.0` to `^6.0.0`.

The `/astro` entry requires astro 6: it uses the `Loader.createSchema` method (added in
astro 6.0.0) and astro 6's zod v4 Loader schema typing, both of which are absent in astro
5.x. The Content Layer `Loader` API changes across astro majors, so `>=6.0.0` would
optimistically (and untested) allow a future astro 7. Capping at `^6.0.0` keeps the range
to the verified major. No current consumer is affected, since the latest astro is 6.x.
