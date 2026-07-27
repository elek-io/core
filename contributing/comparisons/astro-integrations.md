# CMS Astro Integration Comparison

Comparison of how headless CMSs integrate with Astro's content layer, with elek.io Core's `@elek-io/core/astro` entry situated against Storyblok, Hygraph, Sanity and Keystatic. Astro is the first framework Core targets, so this comparison covers Astro integrations. Surveyed July 2026 against Astro 6 (released March 2026) and the then-current official packages.

The doc is structured like [`fields.md`](./fields.md): the [comparison tables](#comparison) put all five platforms side by side, the [per-platform notes](#per-platform-notes) hold detail and warts, and [strengths and gaps](#elekio-core-strengths-and-gaps) closes with where Core leads, what it lacks and the [decided direction](#decided-direction-july-2026).

For the consumer-facing documentation of our integration, see [`docs/usage.md`](../../docs/usage.md#astro-integration), [`docs/provisioning.md`](../../docs/provisioning.md) and [`docs/markdown-content.md`](../../docs/markdown-content.md).

## Summary at a glance

- **elek.io Core** (`@elek-io/core/astro`) - Git-backed. The `elek()` integration provisions Projects from their remotes before content sync runs, the loaders then read from local disk. The only surveyed loader that supplies both a zod schema and generated TypeScript entry types from the content model. Content state is a real model: channels (`production`, `preview`, `draft`) plus exact version pins. Credentials are env-only, one `elek.config.ts` declares every Project the site consumes, the collections are derived from the content model and image Assets arrive as native Astro images.
- **Storyblok** (`@storyblok/astro` v7) - API-based. One untyped collection for the whole space, the token appears in two files. Strong delta sync between builds and the richest visual editing story (bridge, live preview).
- **Hygraph** (`@hygraph/hygraph-astro-loader`, beta) - Pure loader with zero `astro.config` footprint. The model is spelled three times (CMS, `fields` selection, hand-written zod). A neat `richText` option bridges CMS rich text into Astro's native `render()` pipeline.
- **Sanity** (`@sanity/astro`) - No content-layer loader at all, pages fetch GROQ imperatively. The `sanity:client` virtual module is the cleanest single-declaration config pattern surveyed. Types require a separate codegen toolchain.
- **Keystatic** (`@keystatic/core` + `@keystatic/astro`) - Git-backed like Core, but the content lives inside the consumer's own repo in Astro's native formats. Single config file, type inference from the config value without codegen, first-class `astro:assets` integration. Still duplicates the schema between its config and Astro collections.

## Comparison

All tables put **elek.io Core first** so the reader scans rightward to see how each competitor handles the same row.

### Setup and configuration

| Dimension              | elek.io Core                                      | Storyblok                                                | Hygraph                         | Sanity                                           | Keystatic                                                     |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------- | ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| **Config surfaces**    | 2 (elek.config, env), imported by the other files | 3-4 (astro.config, content config, env, component files) | 2 (content config, env)         | 3-5 (astro.config, env.d.ts, sanity.config, env) | 2-3 (astro.config, keystatic.config, optional content config) |
| **Integration needed** | For provisioning in CI                            | Yes                                                      | No (loader only)                | Yes                                              | Yes                                                           |
| **Identity repeated**  | No, one declaration referenced by alias           | Token in astro.config and loader                         | Endpoint in every collection    | projectId in astro.config and sanity.config      | Collection schema in two config languages                     |
| **Credentials**        | Env only, never in a config file                  | Token in two files via `loadEnv`                         | Endpoint option, token optional | `loadEnv` into astro.config                      | None locally, GitHub wizard writes `.env`                     |
| **Content source**     | Local git copy, provisioned from the remote       | REST API                                                 | GraphQL API                     | GROQ API                                         | Files in the consumer's repo                                  |

### Collections and types

| Dimension                  | elek.io Core                                  | Storyblok                     | Hygraph                              | Sanity                   | Keystatic                                     |
| -------------------------- | --------------------------------------------- | ----------------------------- | ------------------------------------ | ------------------------ | --------------------------------------------- |
| **Collection granularity** | One per elek.io Collection, derived           | Whole space in one collection | One per model, declared by hand      | No collections           | One per Keystatic collection, declared twice  |
| **Schema source**          | Loader-supplied, built from field definitions | None                          | Hand-written zod                     | None                     | Hand-written zod copy of the Keystatic schema |
| **TypeScript types**       | Generated per Collection via `createSchema`   | None (`ISbStoryData` cast)    | zod inference from the manual schema | Separate TypeGen codegen | `Entry<typeof config>` inference (Reader API) |
| **Derived from CMS model** | Yes, `elekCollections()` enumerates them      | No                            | No                                   | No                       | No                                            |
| **Store keys**             | Entry UUID, `elekSlugPaths()` routes by slug  | `full_slug`                   | id                                   | Not applicable           | File slug                                     |

No other surveyed provider derives collections or schemas from the CMS content model, and none besides Core uses the content layer's ability for a loader to supply the schema itself. Core can occupy that niche because the full content model sits on local disk at load time, while API-based competitors would need an extra introspection round trip.

### Content state and builds

| Dimension                        | elek.io Core                                 | Storyblok                              | Hygraph               | Sanity                              | Keystatic                              |
| -------------------------------- | -------------------------------------------- | -------------------------------------- | --------------------- | ----------------------------------- | -------------------------------------- |
| **Draft vs published**           | Channels (`production`, `preview`, `draft`)  | `version: DEV ? 'draft' : 'published'` | Undocumented          | `useCdn` + read token + perspective | Storage kind, branches as environments |
| **Deployment-wide switch**       | `ELEK_IO_CHANNEL` env var                    | Manual per option                      | --                    | Manual per option                   | Branch choice                          |
| **Reproducible pins**            | Exact Release version per Project            | --                                     | --                    | --                                  | Implicit via git commit                |
| **Fills an empty CI runner**     | Yes, `elek()` provisions before content sync | API fetch at load                      | API fetch at load     | API fetch at request                | Content is already in the repo         |
| **Incremental sync**             | git fetch increments plus store digests      | Delta fetch via `updated_at_gt` cursor | Content-layer digests | None (no loader)                    | Native (local files)                   |
| **Offline build with warm copy** | Yes, warns and builds with the copy on disk  | No                                     | No                    | No                                  | Yes                                    |

### Assets and rich text

| Dimension                | elek.io Core                                             | Storyblok                                        | Hygraph                                  | Sanity                                  | Keystatic                             |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- | --------------------------------------- | ------------------------------------- |
| **Binaries**             | Downloaded locally, images below `src/`, rest in public  | CDN URLs                                         | CDN URLs                                 | CDN URLs plus URL builder               | Stored in the repo                    |
| **`astro:assets`**       | Yes, images arrive as Astro images                       | --                                               | --                                       | -- (community package)                  | Yes, `image()` helper composes        |
| **Rich text shape**      | mdast tree with first-class reference nodes              | Storyblok rich text JSON                         | HTML or AST                              | Portable Text JSON                      | Real Markdoc/MDX files                |
| **Rendering**            | `mdastRender`, typed and exhaustive, 3 required handlers | `renderRichText` to HTML, or components registry | `richText` option into native `render()` | Community `astro-portabletext` mappings | Native Astro pipeline (`<Content />`) |
| **Renderer type safety** | Compile error on unhandled node types                    | None                                             | None                                     | None                                    | Not applicable                        |

## Astro platform constraints

These Astro 6 facts shape what every integration in this comparison can and cannot do.

- **Integrations cannot inject content collections.** There is no API for it and the roadmap proposal was closed in favor of the content layer without one materializing. Even Starlight, Astro's own docs integration, instructs users to hand-write `src/content.config.ts`. Every provider therefore needs a user-owned content config, and single-declaration DX must come from a shared file or module both sides import.
- **`astro:config:setup` runs before content sync** in dev and build, so an integration can reliably prepare state (like a provisioned Project) that loaders depend on. It also re-runs on every dev restart and config change.
- **Loader-supplied schemas and types go through `createSchema()`**, which returns `{ schema, types }` and is new in Astro 6 (schema-as-function was removed). Core already uses it.
- **Local images reach `astro:assets` through `DataEntry.filePath`** plus a marked path relative to it. `emitImageMetadata()` from `astro/assets/utils/node` is the other route, but it needs a bundler's file emitter, which a loader is never given, so it degrades to dev-server URLs in a build. Absolute path strings do neither and degrade to untransformed public paths. Only Astro's own input formats qualify, everything else has to be served from the public directory instead.
- **The content layer store persists** at `.astro/data-store.json` in dev and `node_modules/.astro/data-store.json` in build, and loaders own their incrementality via digests.
- **Live content collections are stable in Astro 6** but SSR-only with no store and no image optimization, a possible future dev-mode drafts story rather than a build-time tool.

## Per-platform notes

- **Storyblok** - The delta-sync cursor (`lastUpdatedAt` in the store meta, `updated_at_gt` on fetch) is the showcase for content-layer incrementality, with a measured ~90% request reduction. The component registry with `enableFallbackComponent` avoids crashes on unmapped block types. Warts: the token must be wired through Vite's `loadEnv` in astro.config and again in the loader, and the whole space lands in one untyped collection.
- **Hygraph** - The only provider with zero astro.config footprint, the loader is the entire integration. The `fields` selection as a nested JS array avoids writing GraphQL. The `richText` option feeds HTML into the content layer's `rendered` slot, so consumers use Astro's native `render()` and `<Content />` like a local markdown collection. Wart: the model is described three times.
- **Sanity** - The `sanity:client` virtual module (configure once in astro.config, `import { sanityClient } from 'sanity:client'` anywhere) is the cleanest answer surveyed to where a configured client lives. Embedded Studio at a route and the stega-based visual editing stack are unmatched. Warts: no loader means no collections, no store caching and per-page GROQ strings, and TypeGen does not scan `.astro` files by default.
- **Keystatic** - The closest analog to Core, git-backed and file-based. Content is written into the consumer's repo in Astro's own formats, so Astro's entire native pipeline works untouched. `Entry<typeof config>` gives types from a plain config value with no codegen. `fields.image` splits `directory` from `publicPath` and composes with the `image()` schema helper. The GitHub mode onboarding wizard creates the GitHub App and writes `.env` itself. Warts: the Astro collections path still needs a manually synced zod copy of the schema (the community built a generator for it), and the admin UI drags in react and markdoc integrations plus an SSR adapter.

## elek.io Core strengths and gaps

Where Core leads today:

- **Loader-supplied schema and generated types.** No other provider does either. Entries validate against the real field definitions and consumers get a typed `Entry` per Collection with zero codegen setup.
- **A real content state model.** Channels plus exact version pins, overridable deployment-wide through `ELEK_IO_CHANNEL`. Competitors select drafts with an env-conditional option value, and none can pin a content version for reproducible builds.
- **Provisioning.** `elek()` fills an empty CI runner before content sync runs, read-only and without a User. A warm copy also survives an unreachable remote: an exact pin skips the network, any other ref warns and builds with what is on disk. API-based competitors do not have the problem, but they also cannot work offline, cannot pin, and pay per API call. Keystatic sidesteps it by living inside the consumer's repo, which couples content to the site repo in return.
- **Credentials hygiene.** The token exists only as an env var and is handed to git per invocation. Storyblok and Sanity both document pasting tokens into astro.config via `loadEnv`.
- **One declaration, checked by the compiler.** `elek.config.ts` names each Project once and both the integration and the loaders import it. Referencing a Project by an alias the config does not declare is a TypeScript error. Sanity's virtual module is the closest analog but carries a client rather than a checked identity, and Keystatic's single config file does not reach Astro's collections at all.
- **Typed, exhaustive rich text rendering.** `mdastRender` makes an unhandled node type a compile error and forces a documented decision on the three unsafe node types. Every competitor's rich text mapping is stringly typed.
- **Incrementality.** git transfers increments and the loaders skip unchanged entries via digests, structurally equivalent to Storyblok's headline delta sync.

Where Core lags today:

## Decided direction (July 2026)

Settled during the Astro DX exploration (branch `astro-dx`). Items marked **shipped** are implemented, the rest is still open:

- **Shipped.** A single `elek.config.ts` created with `defineElekConfig()`, explicitly imported by both `astro.config.mjs` and `content.config.ts`. No auto-discovery. Projects are referenced by a consumer-chosen alias, which the loaders accept as a literal type, so a typo is a compile error. `astro.config.mjs` importing a sibling `.ts` file through Astro's own config loading was the riskiest assumption of the design and is covered by a dedicated test.
- **Shipped.** `elekCollections()` derives all collections of the declared Projects. Keys are always alias-prefixed (`websitePosts`), in single-Project and multi-Project setups alike. The Assets collection is included by default (`websiteAssets`) with an opt-out, and its binaries default to `src/content/elek/<alias>/assets` so `astro:assets` can reach them. Colliding keys throw naming both sides, see [`../astro-entry.md`](../astro-entry.md).
- **Shipped.** Image Assets are `astro:assets` native: `data.src` is a real Astro image, so `<Image />` optimizes it. Every other Asset is saved below `public/` and carries its URL on `data.href` instead, because Astro serves nothing else. The route runs through Astro's own image marker rather than `emitImageMetadata()`, which needs a bundler file emitter no loader is given, see [`../astro-entry.md`](../astro-entry.md).
- **Shipped.** The Astro store keeps one entry per elek.io Entry, keyed by its UUID. Slug values from a `slug` field stay language-keyed data on the entry rather than becoming per-language store entries, so UUID reference lookups keep working. `elekSlugPaths()` builds the `getStaticPaths` result from a named slug field, one path per language, skipping the languages an Entry has no slug in.
- **Shipped.** The per-loader `core` option is removed. Env vars own the loaders' Core configuration, the integration keeps its own option for the short-lived provisioning instance.
- **Shipped.** Provisioning gained graceful offline behavior: when the fetch fails and a usable provisioned copy exists, it warns loudly and builds with the existing copy instead of failing. An exact version pin the copy already holds skips the network entirely. A missing copy, an authentication failure and a pin the copy does not hold stay hard failures, so a dead token or a broken pin cannot hide behind a warning.
- Naming (decided July 2026): the loaders are renamed to `elekAssetsLoader` and `elekEntriesLoader` alongside the config reshape, following the ecosystem's `Loader` suffix convention and separating them from `elekCollections()`. The integration stays product-named `elek()` and exports use the bare brand, never `elekIo*`. Both rules are recorded in [`../naming.md`](../naming.md).

## See Also

- [`fields.md`](./fields.md) - the cross-CMS field type comparison
- [`../astro-entry.md`](../astro-entry.md) - the design and invariants of Core's own Astro entry
- [`../peer-dependencies.md`](../peer-dependencies.md) - why astro is an optional peer and how its zod requirement feeds the zod floor
- [`../../docs/usage.md`](../../docs/usage.md#astro-integration) - consumer documentation of the loaders and the integration
- [`../../docs/provisioning.md`](../../docs/provisioning.md) - the provisioning story the `elek()` integration builds on
- [`../../docs/markdown-content.md`](../../docs/markdown-content.md) - the mdast model and `mdastRender`
