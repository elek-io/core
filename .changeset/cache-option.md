---
'@elek-io/core': minor
---

The `file.cache` option is now `cache`, and it covers every cache Core keeps, not only parsed files.

**One switch for everything Core keeps in memory.** `cache: false` also stops Core from keeping the index that resolves Collection and Component slugs. With only the file cache off, a Core reading files another application writes, as the Astro loaders do during `astro dev`, kept resolving a Collection under the slug it had before the Desktop app renamed it. Rename `file: { cache }` to `cache`.

**An unknown option throws.** The constructor ignored keys it did not know, so a leftover `file.cache` would have been dropped without a word and caching turned back on. An option Core does not know, at any level, now throws a `BadRequest`.

**The Astro loaders notice a renamed Collection.** Astro names a collection after a Collection's plural slug, so renaming it, or giving its slug to another Collection, needs a restart of `astro dev`. The Entries loader now says so and stops reloading, the way it does for a changed content model, instead of failing the reload or loading the other Collection.

The log attribute `elek.options.file.cache` is now `elek.options.cache`.
