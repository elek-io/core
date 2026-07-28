# Usage

How to use `@elek-io/core` programmatically, through the local API, the CLI, and the Astro integration.

For the data model these examples build on (Projects, Collections, Entries, Values, Assets), see [`concepts.md`](./concepts.md).

## Installing and instantiating

```bash
npm install @elek-io/core zod dugite
```

Core declares `zod` and `dugite` as required peer dependencies, so you install them alongside Core. `dugite` is the git binding the Node entry point runs every Project operation through, see [git and sync](./git-and-sync.md). `zod` is what Core authors its schemas with: a compatible version (`zod@^4.3.6`) that resolves to a single copy, otherwise zod's per-version branding makes Core's schemas incompatible with your own zod usage. The Astro integration adds one more optional peer, see [Astro integration](#astro-integration).

You still install zod as above. As a convenience, Core also re-exports `z`, so in your own code you can import it from `@elek-io/core` instead of from `zod` directly. It is the same `z` plus `@hono/zod-openapi`'s `.openapi()` extension.

`ElekIoCore` is the Node entry point. It wires up all services and creates the directories it works in on construction.

```typescript
import ElekIoCore from '@elek-io/core';

const core = new ElekIoCore();
```

### Options

The constructor accepts an optional options object. All fields are optional and default as shown.

```typescript
const core = new ElekIoCore({
  log: {
    level: 'info', // 'error' | 'warn' | 'info' | 'debug' - default 'info'
  },
  file: {
    cache: true, // cache files in memory to speed up access - default true
  },
  dataDir: '/path/to/data', // directory Core reads and writes data in - default ~/elek.io
  isReadOnly: false, // never mutate a Project or its remote - default false
});
```

The resolved options are exposed on `core.options`, and the running Core version on `core.coreVersion`.

`dataDir` sets the data directory everything lives in, see [`storage-layout.md`](./storage-layout.md). It takes precedence over the `ELEK_IO_DATA_DIR` environment variable, which takes precedence over the default `~/elek.io`. Relative paths are resolved against the current working directory once at construction. `~` is not expanded, that is a shell feature, so pass an absolute path or let the shell expand it. The directory does not need to exist, Core creates it. An empty or whitespace-only value throws a `CoreError`. The resolved absolute path is exposed as `core.options.dataDir`, and `core.util.pathTo` builds every path from it.

`log.level` is the lowest level Core writes, one of `error`, `warn`, `info` and `debug`. It takes precedence over the `ELEK_IO_LOG_LEVEL` environment variable, which takes precedence over the default `info`. A value that is none of the four throws a `CoreError`, so a typo says so instead of quietly leaving the logs as they were. Set it to `error` where Core is a library inside another tool's output, such as an Astro build.

`isReadOnly` puts Core into read-only mode, meant for environments that only consume content, such as CI builds. Every operation that would mutate a Project or its remote (create, update, delete, synchronize, setting a remote, releasing, upgrading) throws a `CoreError` of type `PreconditionFailed`. In return, cloning and fetching work without a User being set, because nothing is ever committed. The option takes precedence over the `ELEK_IO_READ_ONLY` environment variable, which counts as true only when set to `true`.

### Environment variables

Core reads its environment variables once at construction, never at import. All of them use the `ELEK_IO_` prefix with SCREAMING_SNAKE_CASE names. An empty or whitespace-only value counts as unset. When a constructor option covers the same setting, the option wins over the environment.

| Variable                           | Purpose                                                          | Default          |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------- |
| `ELEK_IO_DATA_DIR`                 | The directory Core reads and writes data in                      | `~/elek.io`      |
| `ELEK_IO_LOG_LEVEL`                | The lowest level Core logs                                       | `info`           |
| `ELEK_IO_READ_ONLY`                | Set to `true` to put Core into read-only mode                    | unset            |
| `ELEK_IO_REMOTE_ACCESS_TOKEN`      | Token for authenticating git operations against a private remote | unset            |
| `ELEK_IO_REMOTE_ACCESS_TOKEN_USER` | The username presented alongside `ELEK_IO_REMOTE_ACCESS_TOKEN`   | `x-access-token` |
| `ELEK_IO_CHANNEL`                  | The channel provisioning follows, overrides configured refs      | unset            |

`ELEK_IO_REMOTE_ACCESS_TOKEN` is handed to git per invocation through an askpass helper. It never becomes part of a command line, a remote URL or the repository config, so it cannot leak into logs or caches. Prompts are disabled, a missing or wrong token fails the operation with a `CoreError` of type `Unauthorized` instead of hanging it. While the token is set, configured git credential helpers are bypassed, so the token is authoritative. Without a token, ambient credential helpers keep working as before. The token applies to HTTP(S) remotes only, SSH remotes authenticate through the ambient SSH setup like ssh-agent.

On Windows, keep the data directory short. Windows resolves paths against a 260 character limit unless long paths are enabled, and Core needs about 137 characters below the data directory for its deepest file, so a data directory beyond roughly 120 characters runs out of room. See the limitation in [`features.md`](./features.md#intentional-constraints). macOS and Linux allow 1024 and 4096 characters and are not affected.

The environment variable is what makes a packaged app configurable from the outside. For example, an end to end test can point a packaged Electron app at a disposable data directory by injecting `ELEK_IO_DATA_DIR` at launch, without redirecting `HOME` or adding test-only code paths.

## Setting the User (required before writing)

Every create, update and delete operation commits to git, and git needs a signature. Set the User once before any write - without it, write operations throw a `CoreError` of type `Unauthorized`.

```typescript
await core.user.set({
  userType: 'local',
  name: 'John Doe',
  email: 'john.doe@example.com',
  language: 'en',
  localApi: {
    isEnabled: false,
    port: 31310,
  },
});
```

`core.user.get()` returns the current `User` or `null` if none is set (a fresh install has no User).

The `localApi` settings are a stored preference for elek.io clients. `isEnabled` records whether the local API should auto-start, which elek.io Desktop acts on, but Core itself does not. When using Core directly, start the API with `core.api.start()` or `elek api:start` (see [`local-api.md`](./local-api.md)).

## Working with content

All content services hang off the `core` instance: `core.projects`, `core.collections`, `core.components`, `core.entries`, `core.assets` and `core.releases`. They share a consistent CRUD shape (`create`, `read`, `update`, `delete`, `list`, `count`, `history`).

### Creating a Project

```typescript
const project = await core.projects.create({
  name: 'Website',
  description: 'The official website',
  settings: {
    language: {
      default: 'en',
      supported: ['en', 'de'],
    },
  },
});
```

`supported` must be non-empty and free of duplicates, and `default` must be one of the supported languages. Both are checked on create and update, so a Project cannot drop a supported language while it is still the default.

### Adding an Asset

```typescript
import Path from 'node:path';

const asset = await core.assets.create({
  projectId: project.id,
  filePath: Path.resolve('./logo.png'),
  name: 'Logo',
  description: 'The company logo',
});
```

### Creating a Collection

A Collection holds the field definitions every Entry must follow. See [`fields.md`](./fields.md) for the full list of field types and their properties.

```typescript
import { uuid } from '@elek-io/core';

const collection = await core.collections.create({
  projectId: project.id,
  icon: 'home',
  name: {
    singular: { en: 'Product', de: 'Produkt' },
    plural: { en: 'Products', de: 'Produkte' },
  },
  slug: { singular: 'product', plural: 'products' },
  description: {
    en: 'The products we offer',
    de: 'Die Produkte, die wir anbieten',
  },
  fieldDefinitions: [
    {
      id: uuid(),
      slug: 'name',
      valueType: 'string',
      fieldType: 'text',
      label: { en: 'Name', de: 'Name' },
      description: null,
      inputWidth: '12',
      isRequired: true,
      isDisabled: false,
      isUnique: false,
      min: null,
      max: 70,
      defaultValue: null,
    },
    {
      id: uuid(),
      slug: 'image',
      valueType: 'reference',
      fieldType: 'asset',
      label: { en: 'Image', de: 'Bild' },
      description: null,
      inputWidth: '12',
      isRequired: false,
      isDisabled: false,
      isUnique: false,
      min: null,
      max: 1,
      ofAssetMimeTypes: [],
    },
  ],
});
```

Field-definition `id`s are caller-supplied (hence the `uuid()` calls) - Core does not generate them. Each `id` is the stable identity Core uses to match field definitions when you update the Collection later, so reuse the same `id` for a field rather than minting a new one. See [`schema-changes.md`](./schema-changes.md#the-golden-rule-field-definitions-are-matched-by-id).

Translatable fields (`label`, `description`, and Entry Values) must carry a value for every language the Project supports. With `supported: ['en', 'de']`, omitting `de` fails validation.

### Creating an Entry

Entry Values are keyed by the field definition's `slug`. Each Value declares its `objectType`, `valueType` and per-language `content`.

```typescript
const entry = await core.entries.create({
  projectId: project.id,
  collectionId: collection.id,
  values: {
    name: {
      objectType: 'value',
      valueType: 'string',
      content: { en: 'My first product', de: 'Mein erstes Produkt' },
    },
    image: {
      objectType: 'value',
      valueType: 'reference',
      content: {
        en: [{ objectType: 'asset', id: asset.id }],
        de: [{ objectType: 'asset', id: asset.id }],
      },
    },
  },
});
```

### Reading, listing and counting

```typescript
// Read a single Entry
const one = await core.entries.read({
  projectId: project.id,
  collectionId: collection.id,
  id: entry.id,
});

// List returns { list, total }. Pass limit: 0 to return everything.
const { list, total } = await core.entries.list({
  projectId: project.id,
  collectionId: collection.id,
  limit: 0,
});

const count = await core.entries.count({
  projectId: project.id,
  collectionId: collection.id,
});
```

### Reading from history

Pass a `commitHash` to `read()` to retrieve an object as it existed at that commit. The historical data is run through the migration chain so it always comes back in the current schema shape.

```typescript
const history = await core.entries.history({
  projectId: project.id,
  collectionId: collection.id,
  id: entry.id,
});

const past = await core.entries.read({
  projectId: project.id,
  collectionId: collection.id,
  id: entry.id,
  commitHash: history[1].hash,
});
```

## Error handling

Services throw `CoreError` (exported from `@elek-io/core`) with a `type` and `statusCode`. Catch it to branch on failure modes.

```typescript
import { CoreError } from '@elek-io/core';

try {
  await core.projects.create({
    /* ... */
  });
} catch (error) {
  if (error instanceof CoreError) {
    console.error(error.type, error.statusCode, error.message);
  }
}
```

See [`error-handling.md`](./error-handling.md) for the full list of error types and the patterns Core uses internally (`withGitRollback`, `collectResults`, boundary logging).

## Cleaning up

`dispose()` stops the local API if running and closes the logger, removing the process-level exception handlers.

```typescript
await core.dispose();
```

## The local API

Core ships a local REST API (Hono + OpenAPI) for reading Project content - useful when building a static site or app against local data. It is read-only and never meant to be exposed to the internet.

```typescript
core.api.start(31310); // default port
core.api.isRunning(); // -> true
core.api.stop();
```

With the server running, interactive OpenAPI documentation is served at `http://localhost:31310/` and the schema at `http://localhost:31310/openapi.json`. You can also start it without writing code via the CLI (see below).

## The CLI

The package installs an `elek` binary. Run a command with `--help` to see all arguments and options.

- `elek generate:client [outDir] [language] [format] [target]` - generate a JS/TS API client. `--watch` regenerates on content changes.
- `elek generate:types [outDir] [language] [projects]` - generate TypeScript type definitions from Project content models. `--watch` supported.
- `elek api:start [port]` - start the local REST API (default port `31310`).
- `elek export [outDir] [projects] [template]` - export Projects to JSON (`nested` or `separate` template). `--watch` supported.
- `elek provision --project <id> --url <url>` - provision a copy of a Project from its remote into the data directory, e.g. in CI. `--ref` selects a channel (`production` for the latest Release, `preview` for the latest preview Release, `draft` for the tip of the work branch) or an exact Release version, and is overridden by the `ELEK_IO_CHANNEL` environment variable. Runs read-only, so no User is required. Authentication against private remotes uses `ELEK_IO_REMOTE_ACCESS_TOKEN`. See [`git-and-sync.md`](./git-and-sync.md#provisioning-a-copy-for-builds).

The global `--data-dir <path>` option sets the data directory for any command, e.g. `elek --data-dir /path/to/data export`. It overrides the `ELEK_IO_DATA_DIR` environment variable and defaults to `~/elek.io`, see [Options](#options).

Generated clients and types narrow translatable content to the Project's languages (`Record<ProjectLanguage, T>`) rather than Core's broad exported types.

## Astro integration

`@elek-io/core/astro` exports content loaders that pull Project data into Astro's content collections, plus `mdastRender` for rendering `markdown` Values. It adds `astro` (`^6.1.3 || ^7.0.0`) as an optional peer dependency, which your Astro project already provides.

An Astro site declares the Projects it consumes once and imports that declaration wherever it is needed, so a Project id is written a single time.

```typescript
// elek.config.ts
import { defineElekConfig } from '@elek-io/core/astro';

export const config = defineElekConfig({
  projects: {
    website: {
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      remoteUrl: 'https://github.com/acme/website-content.git',
    },
  },
});
```

The `id` is the Project's own UUID, which elek.io Desktop shows for every Project. `remoteUrl` is the content repository the Project is synchronized with, the same URL you would clone, and only the [`elek()` integration](#provisioning-in-ci-with-elek) reads it.

Every Project gets an alias you choose (`website` above). The alias is what you reference everywhere else, it must start with a lowercase letter and continue with letters or digits. `defineElekConfig` validates the declaration right away, so a malformed id or a mistyped key fails where you wrote it rather than somewhere in the build.

Both other files import that config:

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { elek } from '@elek-io/core/astro';
import { config } from './elek.config';

export default defineConfig({
  integrations: [elek({ config })],
});
```

```typescript
// src/content.config.ts
import { elekCollections } from '@elek-io/core/astro';
import { config } from '../elek.config';

export const collections = {
  ...(await elekCollections(config)),
};
```

`elekCollections()` reads the content model of every declared Project and derives one Astro collection per elek.io Collection, plus one for the Project's Assets. A Project aliased `website` with a `products` and a `blog-posts` Collection produces `websiteProducts`, `websiteBlogPosts` and `websiteAssets`, which is what `getCollection('websiteProducts')` then expects. Keys are always alias-prefixed, also when a single Project is declared, so adding a second Project later never renames the first one's collections. Two Collections that would derive the same key fail the build naming both sides rather than one silently winning.

Nothing discovers `elek.config.ts` automatically, the filename is a convention and the imports are what connect the three files. Put it wherever you like as long as both sides can import it.

### What an Entry looks like

The loaders supply Astro with both a schema and a TypeScript type per Collection, built from its field definitions, so `entry.data` is typed without any codegen step of yours. Every Value is keyed by the Project's languages, and a field the Collection does not require is `null` in a language nobody filled in:

```typescript
entry.data.title.en; // string, the field is required
entry.data.subtitle.en; // string | null, the field is optional
entry.data.body.en; // MdAstRoot | null, an optional markdown field
entry.data.tags.en; // Array<{ id: string; objectType: string }>, never null
```

A `reference` field is an array, empty rather than null when nothing is referenced, and each item carries the UUID of the Asset or Entry it points at. That UUID is also the Astro store id, so `getEntry('websiteAssets', item.id)` resolves it.

An Entry carries no `body` and no rendered HTML, so Astro's `render()` and `<Content />` produce an empty page rather than an error. A `markdown` field arrives on `entry.data` as a tree, which [`markdown-content.md`](./markdown-content.md#rendering-markdown-content-in-astro) renders with `mdastRender`.

### Declaring collections explicitly

`elekCollections()` returns a plain object, so individual collections can be added next to it, and the loaders behind it are exported for when you want to name a collection yourself or expose only part of a Project:

```typescript
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { elekCollections, elekEntriesLoader } from '@elek-io/core/astro';
import { config } from '../elek.config';

export const collections = {
  ...(await elekCollections(config, { assets: false })),
  posts: defineCollection({
    loader: elekEntriesLoader({
      config,
      project: 'website',
      collectionIdOrSlug: 'blog-posts',
    }),
  }),
};
```

The `project` of a loader and the aliases in `elekCollections()`'s options accept only the aliases the config declares, so a typo is a TypeScript error rather than a failing build.

### Routing by slug

Entries are keyed by their UUID in Astro's store, which is what `getEntry()` and every reference between Entries uses. For public URLs you usually want a [`slug` field](./fields.md) instead, and `elekSlugPaths()` turns a collection into the paths `getStaticPaths` expects:

```astro
---
// src/pages/[language]/[slug].astro
import { getCollection } from 'astro:content';
import { elekSlugPaths } from '@elek-io/core/astro';

export async function getStaticPaths() {
  const posts = await getCollection('websitePosts');
  return elekSlugPaths(posts, { slugField: 'slug' });
}

const { entry, language } = Astro.props;
---
<h1>{entry.data.title[language]}</h1>
```

Every path carries the language it was built for, so a page reads a translatable Value without naming the Project's languages itself. Taking it from `Astro.params` instead would not type-check, since Astro types every route param as `string | undefined` while a Value is keyed by the languages.

Each language gets its own path, so `/en/hello-world` and `/de/hallo-welt` both reach the same Entry. Pass `language: 'en'` to route a single one, and the params hold only the slug, for a page at `src/pages/[slug].astro`. `language` is checked against the Project's languages and `slugField` against the Collection's fields, so a typo in either is a TypeScript error rather than a failing build.

Slugs are unique per language within a Collection, not across languages, and an Entry that has no slug in a language simply gets no path there. A Collection can define several slug fields, which is why the field to route by is named per call.

### Assets and astro:assets

An Asset that Astro's image pipeline understands (`jpeg`, `jpg`, `png`, `tiff`, `webp`, `gif`, `svg`, `avif`) arrives as a ready-made Astro image on `data.src`, so it optimizes like any local image:

```astro
---
import { getCollection } from 'astro:content';
import { Image } from 'astro:assets';

const assets = await getCollection('websiteAssets');
---
{assets.map((asset) =>
  asset.data.src
    ? <Image src={asset.data.src} alt={asset.data.description} />
    : <a href={asset.data.href}>{asset.data.name}</a>
)}
```

Every other Asset, a PDF or a ZIP for example, is served as it is and carries its URL on `data.href` instead. Each Asset has exactly one of the two, the other is `null`, so the check above is also how you tell them apart.

The two kinds are saved in different places, because that is what makes each work. Images go to `src/content/elek/<alias>/assets`, below `src/` where Astro can process them. Everything else goes to `public/elek/<alias>/assets`, because only the public directory is served. Override either per Project, or drop the Assets collection entirely:

```typescript
await elekCollections(config, {
  assets: {
    website: { outDir: './src/media', publicOutDir: './public/downloads' },
    shop: false,
  },
});
```

`{ assets: false }` drops it for every Project. Relative paths resolve against the Astro project root. `outDir` has to stay inside the project and `publicOutDir` inside the public directory, otherwise the Asset cannot be processed or served, and the build says so.

These binaries are derived from the Project, so they do not belong in your site's repository:

```
# .gitignore
src/content/elek/
public/elek/
```

Those are the only entries the integration needs. Everything else it produces goes through Astro's content store, which lives in `.astro` during development and in `node_modules/.astro` during a build, both of which a standard Astro `.gitignore` already covers.

All loaders share one Core instance, which the loaders themselves take no options for. What configures it are the `ELEK_IO_*` environment variables of the build: set `ELEK_IO_DATA_DIR` to read from a data directory other than `~/elek.io`, `ELEK_IO_LOG_LEVEL` to `error` to keep Core out of the build output, `ELEK_IO_CHANNEL` to switch the content state deployment-wide and `ELEK_IO_REMOTE_ACCESS_TOKEN` to authenticate against a private remote. See [Environment variables](#environment-variables) for the full list, and note that it is the full list: a setting without an environment variable cannot be changed for the loaders' Core today.

### Local development

While `astro dev` runs, the loaders watch the Projects they read. Editing an Entry or an Asset in the Desktop app updates the open page a moment later, without restarting the dev server. Each loader watches only what it reads, so a Collection reloads when one of its own Entries changes and Assets reload on their own. The Project's git history is not watched, so committing in the Desktop app does not trigger a reload by itself.

**Content edits are live, model edits need a restart.** Astro builds a collection's schema and its TypeScript types once, when it loads the content config, and offers no way to rebuild them while the server runs. So changing the content model means restarting `astro dev`:

- Adding, removing or editing a **field definition** of a Collection
- Adding, removing or editing a **Component**, or the fields of one
- Changing a Project's **supported languages**, which every translatable Value is keyed by
- Adding or removing a **Collection or Project**, which changes the set of collections `elekCollections()` returns

The loaders notice the first three and stop rather than pretend. Instead of reloading Entries against a schema that no longer describes them, which would silently drop a new field or fail on a removed one, the build log says what happened:

```
[elek-entries] The content model of Collection "posts" of Project "website" changed.
Astro builds a collection's schema and types once, when it loads the content config,
so restart the dev server to pick them up. Entries are not reloaded until then.
```

Content editing carries on as normal after the restart. Adding or removing a whole Collection is not detected, because the set of collections is decided before any loader runs.

### Provisioning in CI with elek()

The loaders read from the local data directory, which is empty on a CI runner. The `elek()` integration fills it: it provisions every Project of the config from its remote before Astro's content sync runs.

Each declaration takes an optional `ref`: a channel (`production`, `preview` or `draft`, default `production`) or an exact Release version, overridden by the `ELEK_IO_CHANNEL` environment variable, which accepts channels only. Private remotes authenticate through `ELEK_IO_REMOTE_ACCESS_TOKEN`. The integration runs on its own short-lived read-only Core, so no User is required and nothing is mutated. A locally existing Project managed by the Desktop app is left untouched, so `astro dev` keeps reading the live working copy while CI builds Released content. Without the integration, a missing Project fails the build with an error pointing here. The underlying behavior is documented in [`git-and-sync.md`](./git-and-sync.md#provisioning-a-copy-for-builds).

`elek()` provisions every declared Project that has a `remoteUrl`. A Project that only ever comes from the local data directory, for example one the Desktop app manages, is declared without one: the integration skips it, says so in the build log and leaves it to the loaders. So one config can mix a Project fetched from its remote with a local one. A config in which no Project has a `remoteUrl` fails while `astro.config` is read, naming the aliases, since there is nothing left for the integration to do. A site whose Projects are all local needs no integration at all.

Every build logs which content state the loaders read, e.g. `Reading Project "Website" version 1.4.0 (production)`.

For rendering `markdown` field Values (including the required `html`, `assetReference` and `entryReference` handlers), see [`markdown-content.md`](./markdown-content.md).

## See Also

- [`concepts.md`](./concepts.md) - the data model these examples build on
- [`fields.md`](./fields.md) - full field type reference
- [`schema-changes.md`](./schema-changes.md) - how editing field definitions cascades into existing Entries
- [`git-and-sync.md`](./git-and-sync.md) - branches, commits and synchronizing with a remote
- [`releases.md`](./releases.md) - tagged snapshots and promoting `work` to `production`
- [`asset-management.md`](./asset-management.md) - creating, reading and deleting Assets
- [`storage-layout.md`](./storage-layout.md) - where Projects and their files live on disk
- [`local-api.md`](./local-api.md) - the read-only REST API reference
- [`api-clients.md`](./api-clients.md) - generating typed clients and TypeScript types
- [`export.md`](./export.md) - exporting Projects to JSON
- [`error-handling.md`](./error-handling.md) - `CoreError` and error patterns
- [`markdown-content.md`](./markdown-content.md) - rendering rich `markdown` Values
