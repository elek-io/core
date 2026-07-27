# The Astro entry

Design notes and invariants behind `@elek-io/core/astro`. The consumer-facing documentation is the Astro section of [`../docs/usage.md`](../docs/usage.md#astro-integration), the cross-CMS context is [`comparisons/astro-integrations.md`](./comparisons/astro-integrations.md).

## Module layout

[`src/index.astro.ts`](../src/index.astro.ts) is a thin entry: it re-exports and holds the `elek()` integration. Everything else lives in `src/astro/`:

| Module           | Holds                                                      |
| ---------------- | ---------------------------------------------------------- |
| `core.ts`        | the shared `ElekIoCore`, `ensureProjectAvailable`, logging |
| `elekConfig.ts`  | `defineElekConfig`, the config schema, alias resolution    |
| `loaders.ts`     | `elekAssetsLoader`, `elekEntriesLoader`                    |
| `collections.ts` | `elekCollections`                                          |
| `mdastRender.ts` | the Astro binding of the mdast renderer                    |

The split is not cosmetic. `collections.ts` builds its collections from the loaders, so leaving the loaders in the entry would make the entry and `collections.ts` import each other. Keeping `getCore()` in its own module also keeps the "one Core per process" promise honest, a second copy of that module would mean a second Core.

## The elek config

`defineElekConfig` returns the very object it was handed, it never returns the parse result. That is what preserves the alias keys as literal types, which the loaders then constrain their `project` against (`keyof T['projects'] & string`). Returning `schema.parse(config)` would widen everything back to `Record<string, ...>` and lose the compile-time alias check, and getting the literal type back would need a cast.

`assertElekConfig` therefore validates without transforming, and every entry point calls it on the config it receives, so a hand-built config fails the same way a declared one does.

Alias keys are `^[a-z][a-zA-Z0-9]*$` because they are concatenated into collection keys. The schema is strict, since a silently stripped `remotUrl` would surface much later as "this Project was never provisioned".

## Derived collection keys

`elekCollections` derives `${alias}${toPascalCase(collection.slug.plural)}`. Keys are always alias-prefixed, so adding a second Project never renames the collections of the first.

Collisions throw rather than overwrite, naming both sources. Two classes are reachable:

- **Digit boundary.** `toPascalCase` only uppercases after a hyphen, and a digit cannot be uppercased, so the plural slugs `a-1b` and `a1b` both derive `A1b`.
- **Alias boundary.** An alias may contain uppercase letters after the first character, so alias `web` with a `site-posts` Collection and alias `webSite` with a `posts` Collection both derive `webSitePosts`.

One class that looks reachable is not: a Collection can never take the `${alias}Assets` key, because `assets` is in `reservedSlugs` ([`src/schema/baseSchema.ts`](../src/schema/baseSchema.ts)) and no other plural slug derives `Assets`. If that reservation is ever lifted, this collision becomes real and needs a test.

## The `astro/content/config` subpath

`elekCollections` imports `defineCollection` from `astro/content/config`, not from the `astro:content` virtual module, which only exists inside a consumer's build and cannot be imported from package code.

That subpath is a real export map entry in astro 6.0.0, 6.4.8 and 7.1.3, but it is not documented public API, so treat it as a pinned assumption. `src/index.astro.collections.test.ts` exercises it through a real `sync()`, which is what would catch its removal.

If it ever disappears, the fallback is cheap: `defineCollection` is a validating passthrough that sets `type` to `content_layer` and returns its argument, so `{ type: 'content_layer', loader }` is equivalent. The only thing lost is astro's own validation of that object.

## Asset binaries

`elekAssetsLoader` writes to `src/content/elek/<alias>/assets` unless told otherwise, resolved against `context.config.root` (a `URL`, so it goes through `fileURLToPath`). Two reasons for that location: below `src/` is where Astro can process images, and the per-alias segment keeps two Projects from writing into one directory.

A relative `outDir` resolves against the Astro root as well, not against `process.cwd()`. In a normal `astro build` the two are the same, but they diverge when the build is started from elsewhere, and the root is the only one the consumer wrote down.

Writing into `src/` during `astro dev` was checked for a watcher loop, since a write under `src/` is exactly what vite watches. It settles: the loader skips an Asset whose digest matches and whose file is still on disk, so a resync writes nothing and no further sync is triggered. Measured as one content sync across 20 seconds of idle dev. Keep that skip intact, dropping it would turn dev into a rebuild loop.

The binaries are derived artifacts and the docs tell consumers to gitignore `src/content/elek/`.

## See Also

- [`../docs/usage.md`](../docs/usage.md#astro-integration) - the consumer documentation
- [`comparisons/astro-integrations.md`](./comparisons/astro-integrations.md) - Astro platform constraints and how other CMSs solve the same problems
- [`peer-dependencies.md`](./peer-dependencies.md) - why astro is an optional peer and how its majors are verified
