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

## One Core, configured by the environment

The loaders share one lazily created `ElekIoCore` and take no options of their own. They used to accept a `core` prop, which only the first loader to run actually applied while every later one was silently ignored. The `ELEK_IO_*` variables configure that instance instead, and they reach it wherever it is constructed.

`elek()` keeps its own `core` option because it runs a second, short-lived, read-only Core for provisioning, in a different module graph, before the loaders exist. Nothing about `file.cache` or `log.level` is exposed to the loaders today. If that is ever needed, it is a new `ELEK_IO_` variable read at construction, not a prop.

## The elek config

`defineElekConfig` returns the very object it was handed, it never returns the parse result. That is what preserves the alias keys as literal types, which the loaders then constrain their `project` against (`keyof T['projects'] & string`). Returning `schema.parse(config)` would widen everything back to `Record<string, ...>` and lose the compile-time alias check, and getting the literal type back would need a cast.

`assertElekConfig` therefore validates without transforming, and every entry point calls it on the config it receives, so a hand-built config fails the same way a declared one does.

Alias keys are `^[a-z][a-zA-Z0-9]*$` because they are concatenated into collection keys. The schema is strict, since a silently stripped `remotUrl` would surface much later as "this Project was never provisioned".

`ref` stays a plain `string` on the declaration rather than a channel union, because `contentRefSchema` validates it anyway and `ELEK_IO_CHANNEL` can override it at runtime, so a narrower type would promise a precision the value does not have.

The config is found by import, never by discovery. `elek.config.ts` is a convention the docs state, and the imports are what connect `astro.config.mjs` and the content config. That astro.config can import a sibling `.ts` file at all was the design's riskiest assumption and is covered by [`src/index.astro.config.test.ts`](../src/index.astro.config.test.ts).

## Derived collection keys

`elekCollections` derives `${alias}${toPascalCase(collection.slug.plural)}`. Keys are always alias-prefixed, so adding a second Project never renames the collections of the first.

Collisions throw rather than overwrite, naming both sources. Two classes are reachable:

- **Digit boundary.** `toPascalCase` only uppercases after a hyphen, and a digit cannot be uppercased, so the plural slugs `a-1b` and `a1b` both derive `A1b`.
- **Alias boundary.** An alias may contain uppercase letters after the first character, so alias `web` with a `site-posts` Collection and alias `webSite` with a `posts` Collection both derive `webSitePosts`.

One class that looks reachable is not: a Collection can never take the `${alias}Assets` key, because `assets` is in `reservedSlugs` ([`src/schema/baseSchema.ts`](../src/schema/baseSchema.ts)) and no other plural slug derives `Assets`. If that reservation is ever lifted, this collision becomes real and needs a test.

The keys a consumer autocompletes against come from the types Astro generates after a sync, not from what `elekCollections` returns. Its return type is honestly string-keyed, and making it more precise would not help, Astro reads the collection object at sync time either way.

## What the mdast renderers return

`astroDefaults` builds every default with `renderTemplate` and `addAttribute` from `astro/runtime/server/index.js`, never with `jsx()` from `astro/jsx-runtime`. Keep it that way.

An `astro/jsx-runtime` vnode is only unwrapped by `renderStreaming`, which runs on the top-level result of a page. A nested `.astro` component renders its template through `renderChild`, which handles strings, promises, arrays, functions, `RenderInstance`, `RenderTemplateResult` and iterables, and writes anything else straight to the destination. A vnode therefore renders correctly on a page and stringifies to `[object Object]` one component deep, which is exactly where a site puts its markdown rendering. `renderTemplate` returns a `RenderTemplateResult`, one of the shapes `renderChild` knows, so the same element renders in a page, in a component and through a slot alike.

The two functions are what the Astro compiler emits into every compiled `.astro` file, so this is the compiler's own contract rather than a private constant. It is still an internal import and is recorded as one in [`peer-dependencies.md`](./peer-dependencies.md).

Two consequences for the code:

- A heading tag cannot be interpolated, since the static parts of a tagged template are the markup. The six depths are spelled out in `renderHeading` rather than built as a string.
- Attributes go through `addAttribute`, which returns an empty string for `null` and `undefined`, so an absent `title` emits no attribute at all.

`src/astro/mdastRender.test.ts` renders every default by interpolating it into a `renderTemplate`, which puts it through the same `renderChild` dispatch an `.astro` file uses. A default that regressed to a vnode would show up as `[object Object]` in those assertions rather than passing and failing in a consumer's component.

A consumer writing handlers as JSX inside an `.astro` template needs none of this: the compiler emits render-safe values for them. It only matters for what Core itself constructs.

## The `astro/content/config` subpath

`elekCollections` imports `defineCollection` from `astro/content/config`, not from the `astro:content` virtual module, which only exists inside a consumer's build and cannot be imported from package code.

That subpath is a real export map entry in astro 6.0.0, 6.4.8 and 7.1.3, but it is not documented public API, so treat it as a pinned assumption. `src/index.astro.collections.test.ts` exercises it through a real `sync()`, which is what would catch its removal.

If it ever disappears, the fallback is cheap: `defineCollection` is a validating passthrough that sets `type` to `content_layer` and returns its argument, so `{ type: 'content_layer', loader }` is equivalent. The only thing lost is astro's own validation of that object.

## Asset binaries

Assets are split by kind, because a single location cannot serve both. Images go to `src/content/elek/<alias>/assets`, below `src/` where Astro's image pipeline can reach them. Everything else goes to `public/elek/<alias>/assets`, because Astro copies only the public directory into the build verbatim and ignores unrecognized formats under `src/` entirely. Without the split, a Project holding both photos and PDFs would have to choose which half works. The per-alias segment keeps two Projects from writing into one directory.

Both paths resolve against `context.config.root` (a `URL`, so it goes through `fileURLToPath`), not against `process.cwd()`. In a normal `astro build` the two are the same, but they diverge when the build is started from elsewhere, and the root is the only one the consumer wrote down. A path that lands outside the root, or outside the public directory, is warned about and its Asset loses `src` or `href` accordingly rather than silently producing a URL that 404s.

Writing into `src/` during `astro dev` was checked for a watcher loop, since a write under `src/` is exactly what vite watches. It settles: the loader skips an Asset whose digest matches and whose file is still on disk, so a resync writes nothing and no further sync is triggered. Measured as one content sync across 20 seconds of idle dev. Keep that skip intact, dropping it would turn dev into a rebuild loop.

The binaries are derived artifacts and the docs tell consumers to gitignore `src/content/elek/` and `public/elek/`.

## Handing images to astro:assets

An image Asset gets `data.src` set to `__ASTRO_IMAGE_./<id>.<ext>` and the entry gets a root-relative `filePath`. Astro's content store scans stored data for that prefix, records the hit as an asset import anchored at `filePath`, and its runtime replaces the value with the resolved `ImageMetadata` when a page reads the entry. So `<Image src={asset.data.src} />` works in dev and in build, with Astro doing the emitting and hashing.

This is the same path Astro's own `image()` schema helper takes for content layer collections, but the prefix is an internal constant rather than public API. Three routes were compared before settling on it:

- **`image()` in the schema**, which the docs present as the way. Unavailable to us: astro passes the `SchemaContext` only to a schema that is a _function_, and astro 6 removed function schemas for loaders in favour of `createSchema`. Only a consumer-written schema can use it, which would cost the loader-supplied schema and its generated types.
- **`filePath` plus the public `assetImports` field**. Fully documented, and it does get the file emitted, but it does not substitute the data value. The consumer is left with a relative string and no way to reach the content-hashed output. Verified, not assumed.
- **The marker**, which does both. Chosen.

`IMAGE_IMPORT_PREFIX` is byte-identical in astro 6.0.0 and 7.1.3. If it ever changes, images degrade to a bare relative string rather than crashing, which is why `src/index.astro.assets.test.ts` asserts that Astro collected the image as an import of its own. That is the only observable proof the handover still works, since the substitution itself needs a rendered page.

Only extensions in Astro's `VALID_INPUT_FORMATS` may carry the marker. For anything else Astro strips the prefix and hands the consumer an unanchored relative path, which is why `src` is `null` for non-images and they take the `href` route instead. `imageExtensions` in `loaders.ts` mirrors that list and is tied to Astro's public `ImageInputFormat` with `satisfies`, so a format added or removed there is a compile error here.

The parse-time schema declares `src` as a nullable string, because a marker string is what is stored and validated. The type consumers see is declared separately through `createSchema`'s `types`, as `ImageMetadata | null`. That split looks odd but is exactly what Astro does with its own `ImageFunction`, which is typed as returning an object schema while the runtime schema for content layer collections is a string transform.

## See Also

- [`../docs/usage.md`](../docs/usage.md#astro-integration) - the consumer documentation
- [`comparisons/astro-integrations.md`](./comparisons/astro-integrations.md) - Astro platform constraints and how other CMSs solve the same problems
- [`peer-dependencies.md`](./peer-dependencies.md) - why astro is an optional peer and how its majors are verified
