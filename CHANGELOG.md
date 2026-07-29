# @elek-io/core

## 0.23.0

### Minor Changes

- 9a72a5e: The `astro` peer dependency floor moved from 6.0.0 to 6.1.3, making the range `^6.1.3 || ^7.0.0`. On Astro 6.0.0 through 6.1.2 only the first `astro build` of a site emits its image Assets. Every build after it fails with `LocalImageUsedWrongly` until `.astro` is deleted, because those versions do not rebuild their image imports from a restored content store and the Assets loader skips Assets that have not changed. Astro fixed it in 6.1.3. Consumers on `^6.0.0` who install today already resolve above the floor, only an exact pin below 6.1.3 has to move.
- 837fefe: The `astro` peer dependency range now includes Astro 7, so consumers on Astro 7 no longer get a peer warning. Astro 7 leaves the content layer untouched, so the loaders, the `elek()` integration and programmatic `sync` work unchanged, verified by running the full suite against it. Astro 7 requires the same `zod` range as Astro 6, so the `zod` floor does not move.
- a82448a: Image Assets are now native `astro:assets` images. An Asset in a format Astro's image pipeline understands arrives on `data.src` as a ready Astro image, so `<Image src={asset.data.src} />` optimizes, hashes and sizes it like any local image, in dev and in a build alike.

  Every other Asset, a PDF or a ZIP for example, is served as it is and carries its URL on `data.href`. Each Asset has exactly one of the two and `null` for the other, which is also how a consumer tells the kinds apart:

  ```astro
  {asset.data.src
    ? <Image src={asset.data.src} alt={asset.data.description} />
    : <a href={asset.data.href}>{asset.data.name}</a>}
  ```

  The two kinds are saved separately, because a single location cannot serve both: Astro only processes recognized image formats below `src/`, and only copies the public directory into a build. Images go to `src/elek/<alias>/images`, everything else to `public/elek/<alias>/assets`. `elekAssetsLoader` and the `assets` option of `elekCollections()` take `imageDir` and `publicDir` to move either. These replace the single required `outDir` of the previous release, which is gone: it named Astro's build output directory while meaning the opposite end of the pipeline, and there was nowhere to put the other kind. Both are derived artifacts, so `.gitignore` wants `src/elek/` and `public/elek/`.

- eaf795d: The new `elekCollections()` derives Astro content collections from the elek.io content model, so a site no longer writes a `defineCollection` block per Collection. It reads every Project the elek config declares and returns one collection per elek.io Collection plus one for the Project's Assets, keyed by the Project alias and the Collection's plural slug in PascalCase (`websitePosts`, `websiteAssets`). Keys are always alias-prefixed, also for a single Project, so declaring a second one never renames the first one's collections. Two Collections that would derive the same key throw naming both sides instead of one silently winning.

  ```ts
  // src/content.config.ts
  import { elekCollections } from '@elek-io/core/astro';
  import { config } from '../elek.config';

  export const collections = {
    ...(await elekCollections(config)),
  };
  ```

  That call derives everything and warns that it did, which is the shape to explore a Project with rather than the shape to ship. Naming what the site reads is a second argument away, see the entry on the `elekCollections()` selection.

  `elekAssetsLoader`'s directories are now optional, images defaulting to `src/elek/<alias>/images` so Astro can process the binaries. Keep that below `src/`: a directory inside `public/` works, but Astro then also copies the untouched original into the build next to the optimized one. Which Projects contribute Collections and Assets at all is the `elekCollections()` selection, and where the binaries of every other Asset go comes with the native `astro:assets` change, both in this same release.

  One behavior change for existing loader usage: a relative directory now resolves against the Astro project root rather than the current working directory. Both are the same in a normal `astro build`, they differ only when the build is started from another directory.

- 9662a7c: The Astro loaders now watch the Projects they read while `astro dev` runs, so editing content in the Desktop app updates the open page instead of needing a dev server restart. Each loader watches only what it reads: a Collection reloads when one of its own Entries changes, Assets reload on their own, and the Project's git history is not watched, so committing does not trigger a reload by itself. Reloads are debounced and never overlap, since saving one Entry writes several files.

  Content edits are live, model edits need a restart. Astro builds a collection's schema and its TypeScript types once, when it loads the content config, and offers no way to rebuild them while the server runs, so editing a field definition, a Component or a Project's supported languages means restarting `astro dev`. The loaders detect exactly that and stop instead of reloading Entries against a schema that no longer describes them, which would silently drop an added field and fail on a removed one. The build log names the Collection and says to restart. Adding or removing a whole Collection is not detected, since the set of collections is decided before any loader runs.

  The loaders' shared `ElekIoCore` now runs with its file cache off. Core only invalidates that cache for writes it performs itself, and an Astro site is a reader of files another application owns, so a cached Project served content one edit behind. Every file is read once per sync either way. Nothing about the build path changes.

- c2d58f7: An Astro site now declares the elek.io Projects it consumes once, in a config created with the new `defineElekConfig()`, and imports that config wherever it is needed. Every Project gets an alias the consumer chooses, and the loaders accept only the declared aliases, so referencing a Project the config does not know is a TypeScript error instead of a failing build. The config validates itself where it is written, so a malformed Project id or a mistyped key fails there rather than somewhere in the build. By convention it lives in `elek.config.ts`, but nothing discovers it automatically, the imports are what connect the files.

  Breaking on the loader surface. `elekAssets` is now `elekAssetsLoader` and `elekEntries` is now `elekEntriesLoader`, matching the `Loader` suffix the Astro ecosystem uses. Both take `{ config, project }` instead of a `projectId`, where `project` is the alias. `elek()` takes `{ config }` instead of its own `projects` array and provisions every declared Project that has a `remoteUrl`. A Project declared without one only ever comes from the local data directory, so the integration skips it, logs that it did and leaves it to the loaders, which is what lets one config mix a remote Project with a Project the Desktop app manages locally. A config in which no Project has a `remoteUrl` fails while `astro.config` is read, naming the aliases, because the integration would have nothing to provision.

  ```ts
  // elek.config.ts
  export const config = defineElekConfig({
    projects: {
      website: {
        id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        remoteUrl: 'https://github.com/acme/content.git',
      },
    },
  });

  // astro.config.mjs
  export default defineConfig({ integrations: [elek({ config })] });

  // src/content.config.ts
  export const collections = {
    posts: defineCollection({
      loader: elekEntriesLoader({
        config,
        project: 'website',
        collectionIdOrSlug: 'posts',
      }),
    }),
  };
  ```

- 906a86e: The Astro content loaders no longer accept a `core` property. Their shared `ElekIoCore` instance is configured through the `ELEK_IO_*` environment variables of the build instead, so `ELEK_IO_DATA_DIR` reads from another data directory. This removes the footgun that only the first loader to run decided the options for every loader. The `elek()` integration keeps its own `core` option for the short-lived Core it provisions with.
- 659d5e7: The TypeScript types the Astro loaders generate now admit `null` for optional fields, matching the schema they are generated from. A language slot an editor left empty holds `null`, which the loader-supplied schema has always accepted, while the generated type declared a plain `string`. So `entry.data.slug.de` read as a string and was `null` at runtime, in exactly the case `elekSlugPaths()` exists for.

  An optional `string` field is now `Record<ProjectLanguage, string | null>` and an optional `number` field `Record<ProjectLanguage, number | null>`. The reverse applies to markdown: a **required** `markdown` field is now `Record<ProjectLanguage, MdAstRoot>` instead of always carrying `| null`. Nullability is unchanged for required string and number fields, `boolean` fields and `reference` fields, none of which is ever null. The shape of a `reference` field does change in this release, separately from nullability.

  Type-checking a site against the new types may surface real null cases that were previously hidden, in templates reading an optional field. Guard them, or mark the field required in the Collection:

  ```astro
  {post.data.subtitle.en && <p>{post.data.subtitle.en}</p>}
  ```

  The same rule applies to fields inside a Component.

- e0f8260: The new `elekSlugPaths()` routes Entries by a `slug` field instead of by their UUID. It takes a collection and the field to route by, and returns what `getStaticPaths` expects:

  ```astro
  ---
  // src/pages/[language]/[slug].astro
  export async function getStaticPaths() {
    const posts = await getCollection('websitePosts');
    return elekSlugPaths(posts, { slugField: 'slug' });
  }

  const { entry, language } = Astro.props;
  ---
  <h1>{entry.data.title[language]}</h1>
  ```

  Every language of the Collection gets its own path, so `/en/hello-world` and `/de/hallo-welt` reach the same Entry, and an Entry without a slug in a language simply gets no path there. Pass `language` to route a single one, and the params hold only the slug. A Collection may define several slug fields, which is why the field is named per call.

  Each path carries the language it was built for, typed as the Project's languages, so a page reads a translatable Value without naming them itself. Reaching for `Astro.params.language` instead does not type-check, since Astro types every route param as `string | undefined` while a Value is keyed by the languages. `slugField` and `language` are both checked against the Entry being routed, so a mistyped field name or a language the Project does not support is a TypeScript error rather than a failing build.

  Nothing about the store changes. Entries stay keyed by their UUID, so `getEntry()` and every reference between Entries keeps working as before, and a Collection without a slug field keeps routing by UUID.

- 8271c4a: The `elek` binary starts again. `generate:client` and `generate:types` imported tsdown at module top level, which bundled tsdown and rolldown into `dist/cli`. rolldown loads its parser through a platform specific native binding, and a native binding cannot be bundled, so every `elek` command failed at startup with `Cannot find native binding`. The import is now lazy and reached only when compiling to JavaScript, which also drops `dist/cli` from 6.0M to 1.6M.

  `tsdown` (`^0.22.3`) and `typescript` (`^5.0.0 || ^6.0.0 || ^7.0.0`) are now declared as optional peer dependencies. They are what keeps them out of the bundle, and they are only needed to run `generate:client` or `generate:types` with `js` as the language. Install both as dev dependencies of your project if you use it, otherwise nothing changes: every other command, and both generators with the default `ts` language, work without them. The `js` language now fails with a message naming both packages instead of a raw module resolution error.

- 5033c66: `elek generate:types` and `elek generate:client` now admit `null` for optional fields, matching the schema the types are generated from and the Astro loaders' generated types. A language slot an editor left empty holds `null`, which the Entry schema has always accepted for a field the Collection does not require, while the generated type declared a plain `string`.

  An optional `string` field is now `content: Record<ProjectLanguage, string | null>` and an optional `number` field `content: Record<ProjectLanguage, number | null>`. A **required** `markdown` field loses the `| null` it always carried and becomes `content: Record<ProjectLanguage, MdAstRoot>`. Nullability is unchanged for required string and number fields, `boolean` fields and `reference` fields, none of which is ever null. The shape of a `reference` field does change in this release, separately from nullability.

  Type-checking against regenerated types may surface real null cases that were previously hidden. Guard them, or mark the field required in the Collection.

- b5f117a: `elekCollections()` takes a second argument saying exactly what the site reads, so a Project with twenty Collections no longer syncs twenty to render two. An unread Collection costs a file read and a schema validation per Entry on every sync, and an unread Assets collection copies every binary of its Project into the site each time.

  ```typescript
  export const collections = {
    ...(await elekCollections(config, {
      collections: { website: ['pages'], shop: ['products'], blog: ['posts'] },
      assets: { website: { imageDir: './src/media' }, shop: true },
    })),
  };
  ```

  That derives `websitePages`, `shopProducts`, `blogPosts`, `websiteAssets` and `shopAssets`, and nothing else. One rule covers both keys: **a key you leave out contributes nothing, and so does an alias you leave out of a key.** So `{ collections: { website: ['pages'] } }` derives one collection and no Assets at all. Name Collections by their plural slug or their id, the same two a loader's `collectionIdOrSlug` takes. Under `assets`, `true` takes the default directories and an object sets `imageDir` and `publicDir`.

  `elekCollections(config)` with no second argument still derives everything, for finding your way around a Project before you know what it holds. It now warns that it did, naming the count, since it is not the shape to ship. `ELEK_IO_LOG_LEVEL=error` silences that for anyone who means it.

  Three mistakes now fail the build instead of passing quietly, because each would otherwise produce exactly what success produces and send you looking for a broken loader: a name matching no Collection of the Project it is listed under, a selection deriving nothing at all, and a derived Collection that can reference Assets from a Project whose Assets were left out. The last one is a content-model check, so it fires while the config is read rather than when a page renders a reference it cannot resolve.

  Because the options are now a complete list, `assets: false` is gone, as is the per-alias `false`. Leaving the key or the alias out says the same thing.

- 7a351f0: The new `ELEK_IO_LOG_LEVEL` environment variable sets the lowest level Core logs, so a build that embeds Core can quieten it from the outside. It accepts `error`, `warn`, `info` and `debug`, defaults to `info` and, like every other variable, loses to the matching constructor option. Anything else throws a `CoreError` naming the four, rather than leaving the logs as they were and looking like the variable did nothing.

  This is what an Astro site needs. Its loaders share one Core that takes no options, so until now nothing could stop Core from writing into the build output. `ELEK_IO_LOG_LEVEL=error astro build` now leaves only Astro's own log. The CLI reads it the same way. Both used to pass `info` explicitly, which would have won over the variable, so neither does any more.

- 0825ba8: Projects can now be provisioned from their remote for builds. `projects.provision()` ensures a read-only copy of a Project is present in the data directory at a chosen content state, cloning it from the remote in build mode when missing (shallow, single ref, only the LFS objects of the checked-out ref) and fetching plus hard-resetting it when already provisioned. The `ref` is either a channel that follows the newest content of its kind, `production` for the latest Release, `preview` for the latest preview Release and `draft` for the tip of the work branch, or an exact Release version for reproducible builds. The `ELEK_IO_CHANNEL` environment variable overrides configured refs deployment-wide and accepts channels only.

  `provision()` returns `{ project, source, warning }`, where `source` states where the content came from. A refresh keeps building when the remote cannot be reached: an exact version the copy already holds skips the network entirely (`local-pin`), and any other ref falls back to the copy in the data directory with a loud warning naming the requested ref and the version on disk (`local-fallback`). A missing copy, an authentication failure and a pin the copy does not hold stay hard failures, and so does every answer a reachable remote gives, like an unknown version or a Project that never published a Release.

  Two consumers ship with the engine. The CLI gains `elek provision --project <id> --url <url> [--ref <ref>]` for any pipeline. Astro sites need no pipeline step at all: the new `elek()` integration from `@elek-io/core/astro` takes the site's elek config and provisions every declared Project that has a `remoteUrl` before Astro's content sync runs, logging which content state the loaders read.

  Provisioned copies are read-only for everyone and disposable by design, the next provision run resets them to the remote. Every `Project` now carries a computed `isProvisioned` flag, and any operation that would mutate a provisioned copy throws a `CoreError` of type `PreconditionFailed`, with the git layer backstopping direct `commit`, `tags.create` and `push` calls. A working copy managed by another application like the Desktop app is never touched, so `astro dev` keeps reading live drafts while CI builds Released content. `projects.delete()` stays the escape hatch and removes a provisioned copy without an unpushed-changes check.

  Core itself can now run read-only through the new `isReadOnly` constructor option, used by `elek provision` and the Astro integration. A read-only Core requires no User and refuses every operation that would init, commit or push. Independent of that, reading content written by a newer Core than the one installed now fails with a typed `VersionSkew` error naming the version to update to, instead of proceeding on data it does not understand.

  Private remotes authenticate through the new `ELEK_IO_REMOTE_ACCESS_TOKEN` environment variable, with `ELEK_IO_REMOTE_ACCESS_TOKEN_USER` for providers that expect a specific username (default `x-access-token`). The token is handed to git per invocation through an askpass helper and never becomes part of a command line, a URL or the repository config, so it cannot leak into logs or caches. While set, it bypasses configured credential helpers and is authoritative. Terminal prompts are always disabled, so a missing or wrong credential fails with a typed `Unauthorized` error naming the fix instead of hanging the operation, for HTTPS token failures and SSH key failures alike. An unreachable host or a missing repository is deliberately not classified as an authentication failure, even though git reports all three through the same message on the SSH and local transports. SSH remotes keep authenticating through the ambient SSH setup, like keys loaded into ssh-agent.

  For consumers of the lower-level `core.git` API: `GitSwitchOptions.isNew` is renamed to `create` to mirror git's own `--create` flag, and `switch` additionally supports `forceCreate` with a `startPoint`, `detach` and `discardChanges`. `push` accepts specific `refs`, `fetch` accepts a `ref` and `depth`, and the new `lsRemote` lists the refs a remote advertises without cloning.

- 8e6c949: Generated types now describe what a `reference` field points at. Both generators emitted `Array<{ id: string; objectType: string }>` for every reference field, which said neither what kind of thing was on the other end nor how to reach it. The field definition has always known, so the type now says so too:

  ```typescript
  entry.data.cover.en; // Array<{ id: string; objectType: 'asset' }>
  entry.data.related.en; // Array<{ id: string; objectType: 'entry'; collectionId: string }>
  ```

  `collectionId` is the part that was missing. An Entry reference has always carried it at runtime, and it is what tells you which Collection the referenced Entry lives in when a field allows more than one. Following a reference is then a `getEntry` away, which the Astro section of `usage.md` now shows for both kinds.

  This applies to the Astro loaders and to `elek generate:types` alike. On the CLI side a reference field also gains the per-language narrowing every other field type already had, so it is `Omit<ReferencedValue, 'content'> & { content: Record<ProjectLanguage, ...> }` rather than a bare `ReferencedValue`. Type-checking against the new types can surface code that treated `objectType` as an open string, for example a branch for a kind the field cannot hold.

### Patch Changes

- bdfb287: The Astro documentation now shows code that compiles. `docs/` ships inside the package, so these examples are what a consumer starts from.

  The `mdastRender` examples had their renderers object in the frontmatter of an `.astro` file. That fence is TypeScript, not TSX, so a handler written as JSX there is a parse error. The renderers now sit inline at the `mdastRender` call in the template, in the per-page example, in the collected-footnotes example and in the reusable `MdastContent.astro` component alike.

  The slug routing example indexed a translatable Value with `Astro.params.language`, which Astro types as `string | undefined`, so the example did not type-check. It now names the languages the route was built for. A new "What an Entry looks like" section documents the generated `entry.data` shape, including which fields are nullable.

  The environment variable paragraph no longer implies the loaders' Core is fully configurable through `ELEK_IO_*`, and says plainly that the listed variables are the whole list.

  Every example Project id is a real UUID now, in the docs and in `defineElekConfig`'s own reference. The `abc-123-...` placeholder they used to carry is not a valid id, so copying an example out of the documentation failed on the spot. The docs also say where to read the id, and what `remoteUrl` points at.

- bdfb287: Rendered markdown now renders inside an Astro component, not only directly on a page. `mdastRender`'s built-in defaults were constructed with `jsx()` from `astro/jsx-runtime`, and Astro only unwraps such a value in the render pass it runs on a page's own result. One component deep it was written out as `[object Object]`, so the obvious way to reuse a site's rendering policy, a small `MdastContent.astro` wrapping the call, silently produced broken output.

  The defaults are built with `renderTemplate` and `addAttribute` instead, the same two functions Astro's compiler emits into every `.astro` file, so what `mdastRender` returns is an ordinary Astro template result that renders in a page, in a component and through a slot alike:

  ```astro
  ---
  // src/components/MdastContent.astro
  const { root } = Astro.props;
  ---
  {root !== null &&
    mdastRender(root, {
      html: (node) => /* ... */,
      assetReference: (node) => /* ... */,
      entryReference: (node, children) => /* ... */,
    })}
  ```

  The rendered HTML is unchanged, and consumer handlers written as JSX inside an `.astro` template were never affected. Overrides built with `jsx()` in a shared module keep the old constraint, since they still produce a vnode: write them in a template instead.

- 9dbb6b5: The documentation now says that Astro's `render()` does not apply to an elek.io Entry. Coming from a local markdown collection, `const { Content } = await render(entry)` is the obvious move, and on an Entry it is not an error and produces nothing at all: `<Content />` renders empty, `headings` is `[]` and `remarkPluginFrontmatter` is `{}`, with no warning to go on. The loaders leave Astro's rendered slot empty on purpose, because a finished HTML string cannot keep the `entryReference` and `assetReference` nodes a page needs the UUIDs from. Body content arrives on `entry.data` as an mdast tree and `mdastRender` turns it into markup. Written down in the Astro rendering section of `markdown-content.md`, next to the Entry shape in `usage.md` and in the limitations list of `features.md`.
- 934e664: Runtime dependencies updated to their latest patch and minor releases: `hono` 4.12.32, `@hono/node-server` 2.0.12, `@hono/zod-openapi` 1.5.1, `@scalar/hono-api-reference` 0.11.11, `fs-extra` 11.4.0, `p-queue` 9.3.3, `semver` 7.8.5 and `uuid` 14.0.1. No public API changed.

  The `zod` floor stays at `^4.3.6`. `@hono/zod-openapi`, `@scalar/*` and `astro` are the dependencies that pull `zod`, and none of them raised its requirement, so the single physical copy the peer range exists to guarantee is unaffected.

- 249b685: `elek generate:types <outDir> js` no longer fails when the data directory holds no Projects. There was no types file to compile, and the empty entry list reached the compiler, which rejected it with `No input files`. The compile step is now skipped when there is nothing to compile, so the command writes nothing and exits successfully, the same way it already did for the default `ts` language. Because the check runs before the compiler is loaded, this case also no longer asks for the optional `tsdown` and `typescript` peers.
- 5ea5594: Listing Assets or Entries no longer warns about the files Core writes itself. Reading a Project printed `Function "getFileReferences" is ignoring file ".gitkeep"` for the marker that keeps an empty Assets folder in git, and the same for the `collection.json` that sits where a Collection's Entries are. Both are part of the documented storage layout, so the warning was Core complaining about its own files. In an Astro site the loaders read a Project on every build and every dev start, which made this the loudest thing in the log. Any other file that does not parse is still warned about by name.
- 934e664: Upgrading a Project whose Project file carries no `coreVersion` now fails with an `UpgradeFailed` error naming the file, instead of an `Internal` error raised from inside semver. The upgrade path reads that file before any schema applies to it, because a Project written by an older Core may not satisfy the current one, and it now validates that the one field it has to compare is actually there.

## 0.22.0

### Minor Changes

- ef620e8: A Project's default language must now be one of its supported languages. `settings.language.default` was previously validated only against the universe of language codes Core knows, so a Project could declare `de` as its default while supporting `['en']`. Nothing then produced content in the default language, because translatable content is validated against the supported set. The rule is checked on create and update alike, so a Project also cannot drop a supported language while it is still the default. The issue is reported on `settings.language.default`.

  Existing Projects whose default sits outside their supported languages are rejected on the next update until the settings are corrected, either by adding the default to the supported languages or by choosing a default from among them.

- 730bc3b: Field definitions now validate that a non-null `defaultValue` respects the field's own bounds. For `text` and `textarea` the default's length must sit within `min`/`max`, and for `number` and `range` the default must sit within the numeric `min`/`max`. Previously an out-of-range default was accepted even though the same value would be rejected on write, letting a definition ship a default it could never store.

  The related "a unique field cannot carry a non-null `defaultValue`" rule now lives on the shared string field definition base instead of only the string union, so every string field type inherits it, current and future ones alike. The set of accepted definitions is unchanged, but a single field definition is now rejected on its own, so an editor validating one field against its per-type schema catches the invalid unique + default combination before the Collection is assembled.

- ef620e8: Validation issues on grouped field definitions now carry their nested path instead of a flattened index. Creating or updating a Collection previously flattened its `fieldDefinitions` before checking that every label and description covers each supported language, so an issue on a grouped definition was reported at its position in the flattened list. That index does not address a grouped definition, and past the first group it addresses nothing at all: a Collection holding one field plus a group of two produced an issue at `fieldDefinitions[2]` in a two element array, leaving a consumer with no input to attach the error to. Issues now use the real path, `fieldDefinitions[1].fieldDefinitions[1].label`. Components are unaffected, they hold a flat list of field definitions and cannot use groups.

  A group's own `label` and `description` are now checked too. They are admin metadata like a field definition's, but flattening dropped the group wrapper, so a partially translated group label passed validation. Both must now carry every language the Project supports. A `null` description stays allowed, a partially translated one does not. Collections created before this change that carry a partially translated group label are rejected on the next update until the missing translations are filled in.

  The new `flattenFieldDefinitionsWithPaths()` is exported alongside `flattenFieldDefinitions()` for consumers that walk a Collection's field definitions and need each one's position in the nested array.

### Patch Changes

- ad423de: Projects are now byte identical no matter which OS created them. The generated `.gitignore` and `.gitattributes` were joined with the platform newline, so Windows wrote them with CRLF and every other OS with LF. The same Project opened on a second OS was then rewritten line by line, and a team on mixed operating systems could conflict on every line of every file.

  Both files are now written with LF, and the generated `.gitattributes` starts with `* text=auto eol=lf` so a checkout stays LF even when the machine has `core.autocrlf` enabled, which is a per machine git setting Core does not control. The `lfs/**` rules follow it and keep their `-text` marker, so Asset binaries are still excluded from conversion.

  This applies to newly created Projects.

- 06815ca: Reading a file at a commit no longer fails on Windows when the data directory is deeply nested. Core read those blobs with `git show <commit>:<path>`, and git stats that argument against the working directory to tell revisions from filenames. The stat adds the 40 character commit hash on top of an already absolute path, which overflowed the 260 character limit on Windows and failed history diffs with `fatal: failed to stat: Filename too long`, even though every real file was well within the limit. Core now reads through `git cat-file blob`, which resolves the blob from the object database and never touches the working tree. The returned content is unchanged, including LFS pointers and binary Assets.

## 0.21.0

### Minor Changes

- 6f9ae1f: Make the data directory configurable

  Core previously stored everything under a hardcoded `~/elek.io`. The root is now
  configurable in two ways: pass `dataDir` to the `ElekIoCore` constructor, or set the
  `ELEK_IO_DATA_DIR` environment variable. The constructor option wins over the
  environment variable, which wins over the `~/elek.io` default. Relative paths are
  resolved against the current working directory. The CLI accepts a global `--data-dir`
  option and the Astro loaders accept `dataDir` through their existing `core` options.
  The resolved absolute path is exposed as `core.options.dataDir` and `core.util.pathTo`
  reflects it per instance.

  Nothing changes for existing setups. Without the option or the environment variable,
  Core keeps using `~/elek.io`. Reading the environment variable inside Core makes it
  possible to isolate a packaged app's data in end to end tests without redirecting
  `HOME`, which stalls Electron on Windows CI.

  Constructor validation errors are now thrown as `CoreError.badRequest` instead of a
  raw `ZodError`, matching how every service boundary reports invalid input. The
  original `ZodError` stays attached as the cause. Importing the CLI also no longer
  creates directories as a side effect, the CLI creates its Core instance on first use.

  `core.util` is narrowed to expose only `pathTo`. It previously leaked the whole
  internal util module, including `workingDirectory` and internal helpers, which no
  consumer uses.

## 0.20.0

### Minor Changes

- 8470556: **Breaking:** `zod` is now a peer dependency instead of a bundled runtime dependency.

  Core authors all of its schemas with zod v4, and zod v4 brands every schema with its
  exact version. When Core shipped its own copy of zod, a consumer that installed a
  different (even another 4.x) zod ended up with two physical copies, so a schema built
  with Core's zod was not assignable to anything typed against the consumer's zod. This
  broke downstream type-checking, for example feeding Core schemas into
  `@hookform/resolvers`' `zodResolver`.

  Declaring `zod` as a peer dependency means the consumer supplies the single shared
  copy, so Core and the consumer always brand-match.

  Migration: install a compatible zod alongside `@elek-io/core` and make sure it resolves
  to a single copy.

  ```bash
  npm install zod@^4.3.6
  ```

  You still install zod yourself. As a convenience, Core also re-exports `z`, so in your
  own code you can import it from `@elek-io/core` instead of from `zod` directly. It is the
  same `z` with `@hono/zod-openapi`'s `.openapi()` extension:

  ```ts
  import { z } from '@elek-io/core';

  const mySchema = z.object({ title: z.string() }).openapi('MySchema');
  ```

### Patch Changes

- 8470556: Narrow the optional `astro` peer dependency from `>=6.0.0` to `^6.0.0`.

  The `/astro` entry requires astro 6: it uses the `Loader.createSchema` method (added in
  astro 6.0.0) and astro 6's zod v4 Loader schema typing, both of which are absent in astro
  5.x. The Content Layer `Loader` API changes across astro majors, so `>=6.0.0` would
  optimistically (and untested) allow a future astro 7. Capping at `^6.0.0` keeps the range
  to the verified major. No current consumer is affected, since the latest astro is 6.x.

- 8470556: Widen the `dugite` peer dependency from the exact `3.2.2` to `^3.0.0`.

  Core only uses dugite's functional `exec` API (with `IGitStringResult`, `parseError` and
  `GitError`), which has existed since dugite 3.0.0. Pinning the exact version forced every
  consumer onto one dugite release and risked a peer conflict. The wider range lets a
  consumer satisfy Core's peer with any dugite 3.x they already have, so they keep a single
  copy. This is not a breaking change. Consumers on dugite 3.2.2 are unaffected.

## 0.19.1

### Patch Changes

- b02e71a: Ship the consumer documentation inside the published package

  The package now includes its consumer documentation under `docs/`, available offline and matched to the installed version at `node_modules/@elek-io/core/docs/` with no network lookup. This lets developers and AI coding agents work from accurate, version-matched references. Start at `docs/index.md`, and see the README's "Using Core with AI agents" section for how to point an agent at them.

  Documentation is now split by audience. Consumer docs live in `docs/` and ship with the package. Contributor and design docs live in `contributing/` and are not published, so a few docs moved there (testing, language-scoped validation, migration and history flow, how to add a field type, error-handling internals, and the cross-CMS comparison).

- 76ab883: Fix Asset binary loss when replacing a file with one of the same extension

  Replacing an Asset's file through `update` with a `newFilePath` of the same extension deleted the binary it had just written, because the previous and new paths in `lfs/` were identical. The previous binary is now removed only when the extension actually changes. Listing and counting Assets also enumerate the JSON metadata in `assets/` instead of the `lfs/` binaries, so an Asset whose binary is missing or not yet fetched stays listed and recoverable rather than disappearing.

- 1ffe2d2: Update dependencies to their latest versions

  All runtime and development dependencies are updated to their latest published versions and pinned to exact versions. `@types/node` stays on the Node 24 LTS line (24.13.2) to match the supported runtime rather than moving to a non-LTS release. The `dugite` peer dependency moves to 3.2.2.

## 0.19.0

### Minor Changes

- 15676fa: Store Asset binaries with Git LFS so the repository no longer grows by the full file size on every version
- 5671f5c: Protect Assets and Entries from deletion while still referenced

  Deleting an Asset or Entry that is still referenced by another Entry's values now fails with a `Conflict` error instead of silently leaving dangling references, mirroring the existing Component delete protection. References are detected in flat `reference` fields, in `assetReference` / `entryReference` nodes inside `mdast` fields, and nested inside `dynamic` / component items. The error's `cause` carries the list of referring Entries, each annotated with the offending field and, for nested cases, the component path.

  As part of the same fix, write-time reference validation now also descends into `dynamic` / component items, so a broken reference stored inside a component block is caught on Entry create and update rather than slipping through.

- 5671f5c: Protect Collections from deletion while their Entries are still referenced

  Deleting a Collection that still has Entries referenced by another surviving Entry now fails with a `Conflict` error instead of silently leaving dangling references, mirroring the Asset, Entry and Component delete protection. Detection is a single on-demand scan over the Entries outside the Collection, matching any reference that points into it (every Entry reference carries its Collection id), across flat `reference` fields, `entryReference` nodes inside `mdast` fields, and references nested inside `dynamic` / component blocks. References between Entries that are all being deleted together, including an Entry that references only itself, do not block, since they vanish cleanly. The `Conflict` carries the same `ReferencingEntry` list as the single-entity guards, so consumers get one error contract across all deletes.

  A direct reference to a Collection as a whole is also detected and blocked as a defensive measure, even though no field type produces one. Only the current `work` tree is considered, not entities preserved in released (`production`) history.

- 2f5399b: Block synchronize from pushing dangling references, and never leave the repository mid-rebase

  `ProjectService.synchronize` now integrates the remote with a controlled rebase and validates the whole integrated `work` tree before pushing. If a rebase combined two individually valid changes (a delete on one side, a new reference to that target on the other) into a dangling reference, the sync stops with a `Conflict` listing the dangling references and does not push, so the shared remote never receives a dangling state. The integrated commits stay in the local tree to repair through Core's own delete or update, then sync again. This closes the one reference-integrity case the per-operation write and delete gates cannot catch, and holds because Projects are reconciled only through Core's `synchronize`, run locally.

  Detection is a new forward scan, `EntryService.findDanglingReferences`, reusing the same on-demand reference walker as delete protection across flat `reference` fields, `assetReference` / `entryReference` nodes inside `mdast` fields, references nested in `dynamic` / component blocks, and whole-collection references. A `Conflict` carries a plain `DanglingReference[]` cause, mirroring the delete guards' `ReferencingEntry[]`.

  The surrounding transaction is hardened too: a textual rebase conflict aborts cleanly and surfaces a descriptive `PreconditionFailed` instead of leaving the repository mid-rebase, a sync refuses to run against an uncommitted working tree, and the push is retried on a non-fast-forward rejection. Conflict and rejection states are classified with dugite's own `GitError` codes rather than bespoke output parsing. Only the current `work` tree is considered, not released (`production`) history.

## 0.18.1

### Patch Changes

- 372cef1: Upgraded to pnpm 11. Migrated build script approval from the removed `onlyBuiltDependencies` and `ignoredBuiltDependencies` fields to the new `allowBuilds` map, keeping dugite's build enabled and esbuild and sharp disabled.

## 0.18.0

### Minor Changes

- e63f583: Richer content modeling and a typed client workflow:
  - **Markdown fields** (`markdown` field type) store structured content (mdast) instead of raw strings, with per-field toggles for which features are allowed (headings, lists, tables, emphasis, links, images, and references to Assets/Entries). New framework-agnostic `mdastRender` and `extractText` helpers, plus an Astro renderer (`@elek-io/core/astro`), turn that content into your own markup.
  - **Components** are reusable, separately-defined sets of field definitions that you embed in Collections (or other Components) through `dynamic` fields, so a single field can hold an ordered list of mixed component blocks. Replaces the previous shared-value approach.
  - **Select fields** (`select` field type) let editors pick from predefined string or number options with translatable labels.
  - **Field definition groups** organise fields into named fieldsets for display in the UI without affecting stored data.
  - **Type generation**: a new `elek generate:types` CLI command emits project-scoped TypeScript types, and the generated API client now accesses Collections by slug and understands nested Component values.
  - **Language-scoped validation**: translatable content (names, labels, entry values) is validated against the Project's supported languages, and generated types narrow to `Record<ProjectLanguage, T>`.
  - **Automatic Entry migration**: changing a Collection's or Component's field definitions migrates existing Entries automatically where the change is unambiguous, and otherwise returns a list of issues for you to resolve and re-apply.
  - **Safer writes**: a failed operation now rolls back to a clean git working tree.

## 0.17.0

### Minor Changes

- 82c88f7: - Git commit messages now use human-readable subject lines with git trailers (Method:, Object-Type:, Object-Id:, Collection-Id:) instead of JSON.stringify
  - Git tag messages use a typed GitTagMessage discriminated union (release, preview, upgrade) serialized as git trailers (Type:, Version:, Core-Version:)
  - Removed releaseTypeSchema and releaseTagMessageSchema from releaseSchema.ts — tag message typing now lives in gitSchema.ts
  - Tightened Zod schemas: commit hash uses z.hash('sha1'), datetimes use z.iso.datetime(), migrateProjectSchema uses z.looseObject()
  - Fixed email truncation bug in GitTagService.list() caused by a redundant slice(0, -1)
  - Added pipe-character validation on gitSignatureSchema.name to prevent delimiter collision in parsed output
  - Changed parseTagTrailers to return null and log a warning for unrecognized tag types instead of throwing
- d2ea641: Separated git history from CRUD return values for improved performance. `history` and `fullHistory` are no longer included on `Project`, `Collection`, `Entry`, and `Asset` objects. Use the new `history()` method on each service instead (e.g. `core.projects.history({ id })`, `core.entries.history({ projectId, collectionId, id })`).
- cf284a4: - Access entry values by meaningful names: `entry.values.title` instead of `entry.values.find(v => v.fieldDefinitionId === '550e8400-...')`
  - Reference collections by slug in API routes: `/collections/blog-posts/entries` instead of `/collections/550e8400-.../entries` and the astro integration
- 4b88413: New `ReleaseService` that diffs the `work` branch against `production` to detect collection and field definition changes, computes the appropriate semver bump (major/minor/patch), and supports creating full releases and preview releases with git tags.
- 3bcda72: - Added a migration chain for outdated files (reading from git history and upgrading to the latest schema version)
  - Added documentation for the migration and history-reading flow in `docs/migration-and-history-flow.md`

## 0.16.2

### Patch Changes

- 7d76c26: Support Astro v6, dropped support for astro v5 since astro v5 zod v3 is not compatible with our zod v4 codebase

## 0.16.1

### Patch Changes

- 514a682: fix: do not bundle dugite CJS into Core

## 0.16.0

### Minor Changes

- 06fc63a: Added Astro loader & changed export CLI command

## 0.15.3

### Patch Changes

- 9046c56: fix: no partial project updates and creates

## 0.15.2

### Patch Changes

- dbdbd98: All tests are now run sequentially to ensure git working as expected. Also fixed rogue Project after test run not getting deleted.
- 2539cf9: Core can now export one or multiple projects in one or multiple JSON files
- 3bb661a: Refactored local API using Scalar and added CLI commands for generating an TS/JS API Client and exporting Projects to a JSON file. Switched from tsup to tsdown.

## 0.15.1

### Patch Changes

- 1f83621: Fix: OpenApi function usage on schemas
- 350388e: Fix: Refactor schema imports to use @hono/zod-openapi

## 0.15.0

### Minor Changes

- 418faa4: Refactored existing schema generation via fieldDefinition and added schema generation for create and update methods of the Entry service

## 0.14.4

### Patch Changes

- 17a51df: Upgraded to zod v4

## 0.14.3

### Patch Changes

- 401906f: Fix: same export for Node and Browser

## 0.14.2

### Patch Changes

- b0df691: Upgraded dependencies
- db8f71b: Git pull now tries to rebase first to reduce merge commits

## 0.14.1

### Patch Changes

- b28ba2d: Updated GitHub action runner

## 0.14.0

### Minor Changes

- 62bb27e: Made all API methods async to return Promisses for easier use in IPC. Git signature type now expects the email to actually be one instead of any string. Removed window object inside the Users config file.

## 0.13.0

### Minor Changes

- 1b1c0ce: Added local API endpoints for Projects, Assets, Collections and Entries. Also added custom logger middleware that uses our LogService.
  Removed the ability to directly resolve Entry reference Values - this needs to now be handled Client-side.

## 0.12.0

### Minor Changes

- 6e283f3: Added first local API routes to test inside elek.io Client

## 0.11.1

### Patch Changes

- 609cd30: fix: reading multiple Assets with the same ID but different commit hashes from history, do not overwrite each other anymore

## 0.11.0

### Minor Changes

- 9b3afaa: Git messages are now stringified JSON containing more information about the operation like the object type and ID.
  Git commits now contain the tag objects directly, instead of just the reference.
  Projects now have a "production" and a "work" branch.
  Returned Projects now contain remoteOriginUrl without the need of calling this method separately.
  Projects now have a protection against deletion if there is no remote yet or the local Project has changes not present on the remote yet.
  If Projets have to be deleted anyway, there now is a "force" option to do so.
  Changed Project upgrade to work with an additional upgrade branch and then squash merge it back into work branch.
  Removed old file based upgrade.
  Added git merge and branch delete method.
  Added support for most file types to be used as Assets.
  Added more tests and converted clone related tests from using a remote Github repository to a local one.
  Removed return for logging methods and added timestamp to CLI output.

## 0.10.0

### Minor Changes

- cc6a1a4: Removed unused options and added file cache option
- 2b3f3b5: Added history key to all objects (Project, Asset, Collection and Entry) and the `read` method of their services now support reading from history by providing a commit hash. Also added `save` method for Assets to let the user copy given file somewhere to his filesystem. This also works for Assets from history.
- 9b79cac: Changed the way the `upgrade` method for Projects work by migrating objects on disk directly. Reading from history also applies this migration step to comply with the current schema.

### Patch Changes

- 938c0a1: Added logging
- 17dbf20: Added matrix testing on all supported platforms and fixed EOL and path seperation issues with git commands in windows.
- 2605542: Removed usage of LFS and improved git command logging

## 0.9.1

### Patch Changes

- fa234b7: Removed displayId from user file

## 0.9.0

### Minor Changes

- a2a7b7a: Assets do not have a language anymore
- 5dec07b: The Users window position and size is saved between application launches

## 0.8.0

### Minor Changes

- a8db4a5: Value input types are now called Field types. Value definitions are now called Field definitions

## 0.7.0

### Minor Changes

- d5fc359: Switched to a different slug generating dependency and updated all dependencies
- 27e16e9: Using datetime instead of timestamp for created and updated fields as well as git log and git tags --list results

### Patch Changes

- 13b4626: Fixed import for browser environments and added ElekIoCore type export to it

## 0.6.0

### Minor Changes

- dd365e3: Now only exports ESM - electron and the browser should now be able to handle it and it resolves issues with dependencies while exporting CJS

## 0.5.4

### Patch Changes

- daf5f50: fix: EXPORT_TYPES_INVALID_FORMAT

## 0.5.3

### Patch Changes

- 03dd60a: Removed unused code

## 0.5.2

### Patch Changes

- 8114ca1: fix: properly export for node and browser environments

## 0.5.1

### Patch Changes

- 45d5de4: Optimized imports

## 0.5.0

### Minor Changes

- a923ef7: Separated entry points for node and browser. Simplified imports by providing exports via index.ts for errors and services

## 0.4.2

### Patch Changes

- b56c625: Added missing export of shared functions

## 0.4.1

### Patch Changes

- a0293cd: Added missing export of schema files

## 0.4.0

### Minor Changes

- 7c56031: Added git methods for working with branches, remotes, pull, fetch and push. The ProjectService can now determine changes between the local Project and it's remote origin and synchonize (pull & push) between them.
- 71efc35: Removed search, filter and sort
- 7c56031: Updated shared lib to 0.6.2 - moving from optional keys that could be undefined to nullable values and changing the structure of Entry Value references and their resolved counterparts

## 0.3.1

### Patch Changes

- a2be0a5: Updated shared lib to 5.0.1

## 0.3.0

### Minor Changes

- e691b5d: Updated shared lib to 0.5.0. Added Entry references and removed sharedValues for now.

## 0.2.1

### Patch Changes

- b0bd8c1: Updated shared lib to 0.4.7

## 0.2.0

### Minor Changes

- c517e48: Entries now have Values directly attached which is the default now. Additionally it's possible to use shared Values between n Entries, which are referenced by ID and language inside the Entry. Also Entries resolve shared Values now automatically
- 7a93e5c: Entries now have direct Values and referenced Values (Assets and shared Values) that are resolved when the Entry is requested

## 0.1.1

### Patch Changes

- db49cc6: Environment is now based on passed param instead of NODE_ENV
