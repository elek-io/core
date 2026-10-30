# The Astro entry

Design notes and invariants behind `@elek-io/core/astro`. The consumer-facing documentation is the Astro section of [`../docs/usage.md`](../docs/usage.md#astro-integration), the cross-CMS context is [`comparisons/astro-integrations.md`](./comparisons/astro-integrations.md).

## Module layout

[`src/index.astro.ts`](../src/index.astro.ts) is a thin entry: it re-exports and holds the `elek()` integration. Everything else lives in `src/astro/`:

| Module | Holds |
| --- | --- |
| `core.ts` | the shared `ElekIoCore`, `ensureProjectAvailable`, logging |
| `elekConfig.ts` | `defineElekConfig`, the config schema, alias resolution |
| `loaders.ts` | `elekAssetsLoader`, `elekEntriesLoader` |
| `collections.ts` | `elekCollections` |
| `mdastRender.ts` | the Astro binding of the mdast renderer |

The split is not cosmetic. `collections.ts` builds its collections from the loaders, so leaving the loaders in the entry would make the entry and `collections.ts` import each other. Keeping `getCore()` in its own module also keeps the "one Core per process" promise honest, a second copy of that module would mean a second Core.

## One Core, configured by the environment

The loaders share one lazily created `ElekIoCore` and take no options of their own. They used to accept a `core` prop, which only the first loader to run actually applied while every later one was silently ignored. The `ELEK_IO_*` variables configure that instance instead, and they reach it wherever it is constructed.

`elek()` keeps its own `core` option because it runs a second, short-lived, read-only Core for provisioning, in a different module graph, before the loaders exist.

- `log.level` reaches the loaders' Core through `ELEK_IO_LOG_LEVEL`, and the integration's with it, since both read the environment at construction. It governs `core.logger` alone, so at `error` a build keeps every loader line and loses Core's own.
  - That list is open: the line each Core writes when it starts, the one the integration's writes when it is disposed, the line per slug index rebuild, every git command provisioning runs, and every warning Core raises.
- A loader reports through `context.logger`, which is Astro's and carries its labels and timings. Leave it there. Routing those lines through `core.logger` would change what every build prints, and all it would buy is a Core setting silencing output it does not own. `astro build --silent` already silences them on Astro's side.
  - `loaders.test.ts` pins which logger each kind of line takes and the level it takes there, so moving one of them fails the suite rather than quietly making `usage.md` wrong.
- `cache` is deliberately not exposed, the loaders pin it off (see below).
- Anything else that is ever needed is a new `ELEK_IO_` variable read at construction, not a prop.

## Watching content in dev

Astro hands a loader a `watcher` in dev and nothing in a build, which is exactly the condition the loaders reload under. There is no `refreshContent` on `LoaderContext`, so a loader cannot ask Astro to re-run it.

What it can do is what astro's own `glob` loader does: register handlers on the watcher and write the store again from inside them. `src/astro/watch.ts` holds that wiring, and `load()` calls the same sync function the watcher does.

The watcher is vite's and covers the whole Astro project, so every handler fires for every file the site has. Filtering the changed path against the watched directories is what keeps an edit in `src/` from reloading Project content, and what is watched is deliberately narrow:

- The Entries loader watches `pathTo.entries(projectId, collectionId)`, so one Collection's Entries do not reload another's.
- The Assets loader watches `pathTo.assets(projectId)`.

Watching the Project directory instead would pull in `.git`, which a Desktop app commit rewrites on every save, and every write there would trigger a reload of everything.

Reloads are debounced and never overlap. Saving one Entry writes more than one file, and a reload per file would read the Collection several times for a single edit. A change arriving during a run queues exactly one more run rather than stacking.

## Why a model change stops the reload

A reload writes the store. It cannot rebuild the schema, because `createSchema()` runs only when Astro loads the content config, and it cannot rebuild the generated types at all:

- astro's type generator caches `createSchema()` results in a module-level map it never invalidates, so the types a dev server writes are the types it dies with.
- Not even `refreshContent`, which does re-run `createSchema` through `contentLayer.sync()`, gets the types back.

So a model change has no good outcome. Reloading against the previous schema silently drops a field that was added and fails validation on one that was removed, and in both cases the generated types disagree with what the page renders.

`buildModelDigest` ([`schema.ts`](../src/astro/schema.ts)) fingerprints exactly the inputs of `buildEntryValuesSchema`, the field definitions, the languages and the Components. `createSchema` records it, every reload compares it, and a mismatch logs the restart and returns without touching the store.

Two consequences for what is watched:

- The Entries loader watches `pathTo.components(projectId)` even though it never reloads a Component. Without it, editing a Component that no Entry embeds yet changes nothing on disk that anyone watches, and the developer gets silence instead of the message.
- `pathTo.entries()` is the Collection directory itself, so `collection.json` needs no separate watch.

Two changes touch the set of collections itself:

- **Adding or removing a Collection** cannot be detected at all, because the set is decided before any loader runs. The consumer documentation lists it as a restart case alongside the rest.
- **Renaming one** can. Astro names a collection after the plural slug, so the loader remembers the Collection it built the schema for, and a reload whose slug resolves to another Collection, or to none, stops with a restart message. The model digest cannot catch this, because the Collection taking over the slug may carry identical field definitions.

The loaders' Core runs with `cache: false` ([`core.ts`](../src/astro/core.ts)) because of this feature. Core clears its caches for changes it makes itself, and here another application owns the files, so a cached Project would keep serving content one edit behind and the watcher would look broken. That covers the slug index too, so a renamed Collection resolves under its new slug right away.

Each file is read once per sync either way. This was found the hard way: the first working version of the watcher reloaded on every edit and still rendered the old content.

## The elek config

`defineElekConfig` returns the very object it was handed, it never returns the parse result. That is what preserves the alias keys as literal types, which the loaders then constrain their `project` against (`keyof T['projects'] & string`).

Returning `schema.parse(config)` would widen everything back to `Record<string, ...>` and lose the compile-time alias check, and getting the literal type back would need a cast. `assertElekConfig` therefore validates without transforming, and every entry point calls it on the config it receives, so a hand-built config fails the same way a declared one does.

Two details of the schema:

- Alias keys are `^[a-z][a-zA-Z0-9]*$` because they are concatenated into collection keys. The schema is strict, since a silently stripped `remotUrl` would surface much later as "this Project was never provisioned".
- `ref` stays a plain `string` on the declaration rather than a channel union, because `contentRefSchema` validates it anyway and `ELEK_IO_CHANNEL` can override it at runtime, so a narrower type would promise a precision the value does not have.

The config is found by import, never by discovery. `elek.config.ts` is a convention the docs state, and the imports are what connect `astro.config.mjs` and the content config. That astro.config can import a sibling `.ts` file at all was the design's riskiest assumption and is covered by [`src/index.astro.config.test.ts`](../src/index.astro.config.test.ts).

## Derived collection keys

`elekCollections` derives `${alias}${toPascalCase(collection.slug.plural)}`. Keys are always alias-prefixed, so adding a second Project never renames the collections of the first.

Collisions throw rather than overwrite, naming both sources. Two classes are reachable:

- **Digit boundary.** `toPascalCase` only uppercases after a hyphen, and a digit cannot be uppercased, so the plural slugs `a-1b` and `a1b` both derive `A1b`.
- **Alias boundary.** An alias may contain uppercase letters after the first character, so alias `web` with a `site-posts` Collection and alias `webSite` with a `posts` Collection both derive `webSitePosts`.

One class that looks reachable is not: a Collection can never take the `${alias}Assets` key, because `assets` is in `reservedSlugs` ([`src/schema/baseSchema.ts`](../src/schema/baseSchema.ts)) and no other plural slug derives `Assets`. If that reservation is ever lifted, this collision becomes real and needs a test.

## Selecting what is derived

One rule governs both options: **no options object derives everything, and an options object is the complete list.** A key left out contributes nothing, and so does an alias left out of a key. Deriving all twenty Collections of a Project to read two means syncing all twenty, and an Assets collection copies every binary into the site on each sync.

Two consequences:

- The bare `elekCollections(config)` survives that argument only as the exploration step. You cannot name Collections you have not seen yet, and with no argument there is no partial specification to misread. It warns every time, naming what it derived, and the warning goes through `core.logger` so `ELEK_IO_LOG_LEVEL` silences it for anyone who means it.
- The strict reading is what removes API rather than adding it. `assets: false` and a per-alias `false` both disappear, since leaving the key or the alias out already says none.

Three cases throw, all for one reason: each would otherwise produce exactly what success produces, so the developer would go looking for a broken loader.

- **A name matching no Collection of the Project it is listed under.** Matched against the plural slug and the id, the same two a loader's `collectionIdOrSlug` accepts.
- **A selection deriving nothing at all**, which `elekCollections(config, {})` does.
- **A derived Collection that can reference Assets while that Project's Assets are left out.** Following such a reference is `getEntry('<alias>Assets', ref.id)`, which without the collection fails while a page renders, far from the config that caused it.
  - The check reads field definitions only, never Entries, so it needs no ordering between loaders. A reference field, or a markdown field with `assetReferences` enabled, is enough to know.

That last check is the tractable half of "derive only the Assets that are actually referenced". The full version is not available to us: loaders are independent and Astro decides their order, so the Assets loader cannot wait on every Entries loader, and it would silently drop Assets a template uses without any Entry referencing them.

The keys a consumer autocompletes against come from the types Astro generates after a sync, not from what `elekCollections` returns. Its return type is honestly string-keyed, and making it more precise would not help, Astro reads the collection object at sync time either way.

## The generated schema and the generated types

A loader's `createSchema` returns two things built from the same model:

| Built by | Shape | Astro uses it for |
| --- | --- | --- |
| `buildEntryValuesSchema` | a Zod object keyed by field definition slug | `parseData` validation at sync time |
| `buildEntryValuesTypeString` | TypeScript source | the collection's `Entry` type, written to a file and imported |

They are two walks over one `fieldDefinitions` array, and the invariant is that they admit the same values. Violating it breaks a consumer in one of two ways, neither of which shows up where the mistake was made:

- A schema wider than the type gives a type error on data that validated and synced.
- A type wider than the schema gives a sync failure on data that type-checked.

Nothing structural enforces the pairing. `buildValueContentSchema` and `fieldDefToTsType` are separate switches over `valueType`, as are `buildComponentArraySchema` and `renderComponentValuesType` one level down, so a new field type means editing both sides. `schema.test.ts` is the only thing holding them together, asserting per field type that the emitted leaf type and the schema agree on `null`.

The emitted type names are PascalCased slugs: `${CollectionPascal}${FieldPascal}Item` and `${ComponentPascal}${FieldPascal}Item` for dynamic field item unions, `${ComponentPascal}ComponentValues` for a Component's values.

That is the same `toPascalCase` derivation as the collection keys above, so it carries the same digit-boundary collision class, detected where the name is emitted rather than left to the file a consumer compiles, see [Two slugs deriving one name](#two-slugs-deriving-one-name).

## What a Component item names

A `dynamic` field's items carry `componentSlug` beside the `componentId` they always had, and the item schema discriminates on the slug. The id alone cannot do the job on this surface:

- The loader hands Astro its types as a string, so it has no runtime constant a page could switch on. `elek generate:types` does emit an id constant per Component and types its union on `componentId`.
- The two generators therefore dispatch differently on purpose, and both say so, in [`../docs/usage.md`](../docs/usage.md#rendering-a-dynamic-field) and [`../docs/api-clients.md`](../docs/api-clients.md#generatetypes).
- Every UUID is new after the content is re-created, from a seed or a fresh Project, while the slug is what the developer named. A page written against the id breaks there, and nothing in the page says why.
- The id stays on every item and every union member, so a site that also calls Core's own methods or the local API addresses the same Component there.

A Component's slug therefore reaches a consumer's data and types, which is what makes renaming one a major Release, see [`../docs/releases.md`](../docs/releases.md#every-change-a-diff-can-carry).

Four consequences for the loader, of which the first two decide the order inside `syncEntries`:

- `transformEntryValues` needs the Project's Components to resolve an item's slug, so `syncEntries` reads the model on every sync rather than only to compare the digest.
- That read goes after the Collection rename guard, never before, and takes the id the guard resolved. `readModel` resolves without a catch, so a renamed Collection would throw and fail the build where the guard warns and keeps the Entries.
- An item whose Component the Project cannot resolve throws `NotFound` naming the Entry, the field and the Component, and nothing an editor typed. Deleting the Component is not the route there, because `delete` refuses while a Collection or a Component still references it and narrowing an `ofComponents` strips the items it drops. A Project written outside Core is what reaches it.
- The slug is part of the stored item, so the digest the loader compares changes when a Component is renamed and a second build into the same cache replaces every item of it.

An item union with no members at all, which an open `ofComponents` in a Project without Components produces, is emitted as `never`. Emitting the members alone leaves `type X =` and a bare semicolon, which is a syntax error in a file the consumer compiles.

## Two slugs deriving one name

Component slugs are unique per Project, enforced by `ComponentService` on create and update, and `toPascalCase` collapses the difference between some of them anyway. Both collisions are caught where the name is derived, because the layer below reports neither usefully:

- **One discriminant for two Components** of one field is `buildComponentArraySchema`'s `Conflict`, naming both ids and the field. Zod answers it with `Duplicate discriminator value` while an Entry is validated, which names neither the Components nor the field, and only once content happens to reach it.
- **One type name for two declarations** is `buildEntryValuesTypeString`'s `Conflict`, naming both sources and the name. Two classes are reachable:
  - The digit boundary of the collection keys above, where `hero-1` and `hero1` both derive `Hero1`.
  - An item name a Collection and a Component both derive, where the Collection `Hero` with a `grid-items` field meets the Component `hero-grid` with an `items` field.

## What the mdast renderers return

`astroDefaults` builds every default with `renderTemplate` and `addAttribute` from `astro/runtime/server/index.js`, never with `jsx()` from `astro/jsx-runtime`. Keep it that way.

An `astro/jsx-runtime` vnode is only unwrapped by `renderStreaming`, which runs on the top-level result of a page. A nested `.astro` component renders its template through `renderChild`, which handles strings, promises, arrays, functions, `RenderInstance`, `RenderTemplateResult` and iterables, and writes anything else straight to the destination.

- A vnode therefore renders correctly on a page and stringifies to `[object Object]` one component deep, which is exactly where a site puts its markdown rendering.
- `renderTemplate` returns a `RenderTemplateResult`, one of the shapes `renderChild` knows, so the same element renders in a page, in a component and through a slot alike.

The two functions are what the Astro compiler emits into every compiled `.astro` file, so this is the compiler's own contract rather than a private constant. It is still an internal import and is recorded as one in [`peer-dependencies.md`](./peer-dependencies.md).

Two consequences for the code:

- A heading tag cannot be interpolated, since the static parts of a tagged template are the markup. The six depths are spelled out in `renderHeading` rather than built as a string.
- Attributes go through `addAttribute`, which returns an empty string for `null` and `undefined`, so an absent `title` emits no attribute at all.

A handler is given the node, its rendered children where it has any, and last its `MdastNodeContext`, see [`markdown-internals.md`](./markdown-internals.md). Three defaults need more than the node:

| Default | Needs | Because |
| --- | --- | --- |
| `heading` | `node.depth` | the tag is static markup, see above |
| `table` | its rendered rows | the `thead` and `tbody` split is a split of that array, the first row against the rest, and neither wrapper is emitted empty |
| `tableCell` | its context | `th` or `td` follows from whether its row is the table's first, and the column's alignment is on the table rather than the cell |

A cell's alignment is emitted as `style="text-align:..."` rather than the `align` attribute, which HTML dropped. A column mdast left unaligned gets no style at all, since `text-align: left` would override the consumer's own CSS and break a right to left reading direction.

`src/astro/mdastRender.test.ts` renders every default by interpolating it into a `renderTemplate`, which puts it through the same `renderChild` dispatch an `.astro` file uses. A default that regressed to a vnode would show up as `[object Object]` in those assertions rather than passing and failing in a consumer's component.

A consumer writing handlers as JSX inside an `.astro` template needs none of this: the compiler emits render-safe values for them. It only matters for what Core itself constructs.

## What a default decides for the consumer

A default renders every field of its node, because a field a default silently drops is a loss a consumer cannot see without reading Core's source. `src/astro/mdastRender.test.ts` accounts for every field per node type, either locating it in the output or naming it dropped with the reason, so a field added to a node schema cannot pass through unanswered.

Three are dropped, and the test carries the reason for each:

- `code.lang` and `code.meta`, because every highlighter wants them somewhere else.
- `footnoteDefinition.label`, because it is the reference's text rather than the note's.
- `list.spread` and `listItem.spread` left that list when the `paragraph` default started reading them off its context, see [what only a paragraph can reach](./markdown-internals.md#what-only-a-paragraph-can-reach).

Five decisions beyond that, each the cheaper half of a trade:

| Decision | Against | Why |
| --- | --- | --- |
| `<ol start>` only where the list counts from something other than 1 | always writing it | `start="1"` is what `<ol>` does anyway, and emitting it would change the markup of every ordered list for no effect. A 0 is kept, GFM and HTML both allow it |
| A task item's checkbox is `disabled` | a live checkbox | A rendered tree is not an editor, so a live box would offer a change that goes nowhere |
| The checkbox is named by the `<label>` the first paragraph wraps around it and its text | a nameless box, which is what remark and GitHub emit | A disabled control is still announced, and a box called nothing leaves a screen reader with a checked state and no subject. A paragraph's children are phrasing content, so the `<label>` holds them and plain text is read once. A link, an image or a footnote marker in the text keeps its own name inside the box's, so that part is reached twice, which is still less than the whole item twice. A nested list is a block of the item rather than of the paragraph, so it stays outside the label and a nested task's text names its own box alone |
| Where the item itself places the box, the name goes on an `aria-label` | a nameless box there | `<label>` takes phrasing content and the item's blocks arrive rendered, so the name is read twice, once as the box's name and once as the text. It leaves out a list directly inside the item and is trimmed, so an item carrying no text, an image on its own or a paragraph of spaces, gets no attribute |
| No class name on a task item | `class="task-list-item"`, which is GFM's | The defaults promise no class names, and a name without the CSS that makes it mean something is a half measure. The item keeps its list marker, which is visible and therefore reported rather than hidden |
| The footnote reference carries `id="fnref-<identifier>"` and the definition links back to it | leaving the way back to the consumer | Without an id the definition's `fn-` id has nothing to point at, so the one half Core shipped was unusable on its own |

Two limits are left visible on the page:

- A default cannot prefix the footnote ids, because `astroDefaults` is one module-level object shared by every render and counting trees would mean state in it. Two trees on one page therefore share the ids, and a note referenced twice repeats its reference id, so the way back lands on the first reference. The consumer-facing doc names the override.
- The checkbox opens the item's first paragraph and the way back ends the note's last one, which only the `paragraph` default can reach. Where no paragraph can take one, and where the consumer brings a handler of its own, the item and the note place them instead, see [`markdown-internals.md`](./markdown-internals.md#what-only-a-paragraph-can-reach).

The back-link's `aria-label` is English, which is the first copy Core puts on a page. A link whose only content is an arrow glyph gets whatever name the screen reader's symbol dictionary gives it, so the label is worth more than the consistency of shipping no text at all.

A `footnoteDefinition` override owns that link whole, so another language replaces the label there and no paragraph adds a second one. The doc names that override.

## The `astro/content/config` subpath

`elekCollections` imports `defineCollection` from `astro/content/config`, not from the `astro:content` virtual module, which only exists inside a consumer's build and cannot be imported from package code.

That subpath is a real export map entry in astro 6.1.3, 6.4.8, 7.1.3 and 7.4.4, but it is not documented public API, so treat it as a pinned assumption. `src/index.astro.collections.test.ts` exercises it through a real `sync()`, which is what would catch its removal.

If it ever disappears, the fallback is cheap: `defineCollection` is a validating passthrough that sets `type` to `content_layer` and returns its argument, so `{ type: 'content_layer', loader }` is equivalent. The only thing lost is astro's own validation of that object.

## Asset binaries

Assets are split by kind, because a single location cannot serve both:

- Images go to `src/elek/<alias>/images`, below `src/` where Astro's image pipeline can reach them.
- Everything else goes to `public/elek/<alias>/assets`, because Astro copies only the public directory into the build verbatim and ignores unrecognized formats under `src/` entirely.

Without the split, a Project holding both photos and PDFs would have to choose which half works. The per-alias segment keeps two Projects from writing into one directory.

Both paths resolve against `context.config.root` (a `URL`, so it goes through `fileURLToPath`), not against `process.cwd()`:

- In a normal `astro build` the two are the same, but they diverge when the build is started from elsewhere, and the root is the only one the consumer wrote down.
- A path that lands outside the root, or outside the public directory, is warned about and its Asset loses `src` or `href` accordingly, rather than silently producing a URL that 404s.

Writing into `src/` during `astro dev` was checked for a watcher loop, since a write under `src/` is exactly what vite watches. It settles:

- The loader skips an Asset whose digest matches and whose file is still on disk, so a resync writes nothing and no further sync is triggered. Measured as one content sync across 20 seconds of idle dev.
- Keep that skip intact. Dropping it would turn dev into a rebuild loop.

The skip is also what sets the astro peer floor at 6.1.3. An Asset the loader skips registers no image import of its own, so it stays in the build only because astro rebuilds that list from the store it restored, which it does from 6.1.3 on. See [`peer-dependencies.md`](./peer-dependencies.md).

The binaries are derived artifacts and the docs tell consumers to gitignore `src/elek/` and `public/elek/`. Neither sits under `src/content/`, which carries no meaning for Astro outside the `legacy.collectionsBackwardsCompat` flag and by convention holds authored entries rather than generated binaries.

## Handing images to astro:assets

An image Asset gets `data.src` set to `__ASTRO_IMAGE_./<id>.<ext>` and the entry gets a root-relative `filePath`. Astro's content store scans stored data for that prefix, records the hit as an asset import anchored at `filePath`, and its runtime replaces the value with the resolved `ImageMetadata` when a page reads the entry.

So `<Image src={asset.data.src} />` works in dev and in build, with Astro doing the emitting and hashing.

This is the same path Astro's own `image()` schema helper takes for content layer collections, but the prefix is an internal constant rather than public API. Three routes were compared before settling on it:

- **`image()` in the schema**, which the docs present as the way. Unavailable to us: astro passes the `SchemaContext` only to a schema that is a _function_, and astro 6 removed function schemas for loaders in favour of `createSchema`. Only a consumer-written schema can use it, which would cost the loader-supplied schema and its generated types.
- **`filePath` plus the public `assetImports` field**. Fully documented, and it does get the file emitted, but it does not substitute the data value. The consumer is left with a relative string and no way to reach the content-hashed output. Verified, not assumed.
- **The marker**, which does both. Chosen.

`IMAGE_IMPORT_PREFIX` is byte-identical in astro 6.1.3, 7.1.3 and 7.4.4. If it ever changes, images degrade to a bare relative string rather than crashing, which is why `src/index.astro.assets.test.ts` asserts that Astro emitted an image import of its own. That is the only observable proof the handover still works, since the substitution itself needs a rendered page.

What the store holds afterwards is Astro's business, and it has already changed once inside the peer range:

- From astro 7.4 on the marker is consumed while the store is written. `data.src` holds the plain relative path, and the entry carries `assetImports` and `imageImports` beside it.
- So the marker's absence from the written store means Astro took it, not that Core stopped emitting it. The assertions read the emitted imports instead.

Astro keeps two format lists, and an extension has to be in both to be worth a marker:

- `VALID_INPUT_FORMATS` is what the content store recognizes a marker for. For anything else Astro strips the prefix and hands the consumer an unanchored relative path, which is why `src` is `null` for non-images and they take the `href` route instead.
- `VALID_SUPPORTED_FORMATS` is what the image service validates against. `<Image>` on a format outside it throws `UnsupportedImageFormat` and fails the build, measured against the installed 7.4.4.
- The second is the narrower one, and the difference is `apng`. It joined the input list in 7.2.5 and is in the supported list on no release, checked from 6.1.3 to 7.4.4, so an APNG carrying the marker would reach the consumer as an image that cannot be rendered.
- `imageExtensions` in `loaders.ts` therefore mirrors `VALID_SUPPORTED_FORMATS`, and an APNG takes the `href` route a non-image takes. That list is identical on every astro the peer range allows, so the table needs no release per entry and the loader does not read the installed astro's version.
- It is typed `Record<ImageInputFormat, boolean> & Record<string, boolean>`. The first half makes a format Astro adds to the input list a compile error here, which is where the two lists get compared again. The index signature is what lets the table name `apng`, which the types at the floor do not know, so pinning the floor type checks.

`src/index.astro.assets.test.ts` takes an APNG through a real `sync()`, and `src/astro/loaders.test.ts` covers the table itself. Neither sees Astro moving a format into the supported list, so read both lists when bumping astro, see [`peer-dependencies.md`](./peer-dependencies.md).

The parse-time schema declares `src` as a nullable string, because a marker string is what is stored and validated. The type consumers see is declared separately through `createSchema`'s `types`, as `ImageMetadata | null`.

That split looks odd but is exactly what Astro does with its own `ImageFunction`, which is typed as returning an object schema while the runtime schema for content layer collections is a string transform.

## See also

- [`../docs/usage.md`](../docs/usage.md#astro-integration) - the consumer documentation
- [`comparisons/astro-integrations.md`](./comparisons/astro-integrations.md) - Astro platform constraints and how other CMSs solve the same problems
- [`peer-dependencies.md`](./peer-dependencies.md) - why astro is an optional peer and how its majors are verified
