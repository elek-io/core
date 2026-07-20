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
});
```

The resolved options are exposed on `core.options`, and the running Core version on `core.coreVersion`.

`dataDir` sets the data directory everything lives in, see [`storage-layout.md`](./storage-layout.md). It takes precedence over the `ELEK_IO_DATA_DIR` environment variable, which takes precedence over the default `~/elek.io`. Relative paths are resolved against the current working directory once at construction. `~` is not expanded, that is a shell feature, so pass an absolute path or let the shell expand it. The directory does not need to exist, Core creates it. An empty or whitespace-only value throws a `CoreError`. The resolved absolute path is exposed as `core.options.dataDir`, and `core.util.pathTo` builds every path from it.

### Environment variables

Core reads its environment variables once at construction, never at import. All of them use the `ELEK_IO_` prefix with SCREAMING_SNAKE_CASE names. An empty or whitespace-only value counts as unset. When a constructor option covers the same setting, the option wins over the environment.

| Variable           | Purpose                                     | Default     |
| ------------------ | ------------------------------------------- | ----------- |
| `ELEK_IO_DATA_DIR` | The directory Core reads and writes data in | `~/elek.io` |

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

The global `--data-dir <path>` option sets the data directory for any command, e.g. `elek --data-dir /path/to/data export`. It overrides the `ELEK_IO_DATA_DIR` environment variable and defaults to `~/elek.io`, see [Options](#options).

Generated clients and types narrow translatable content to the Project's languages (`Record<ProjectLanguage, T>`) rather than Core's broad exported types.

## Astro integration

`@elek-io/core/astro` exports content loaders that pull Project data into Astro's content collections, plus `mdastRender` for rendering `markdown` Values. It adds `astro` (`^6.0.0`) as an optional peer dependency, which your Astro project already provides.

```typescript
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { elekAssets, elekEntries } from '@elek-io/core/astro';

export const collections = {
  assets: defineCollection({
    loader: elekAssets({
      projectId: 'abc-123-...',
      outDir: './src/content/assets',
    }),
  }),
  products: defineCollection({
    loader: elekEntries({
      projectId: 'abc-123-...',
      collectionIdOrSlug: 'products',
    }),
  }),
};
```

Both loaders accept a `core` property with the same options as the `ElekIoCore` constructor, so `elekEntries({ ..., core: { dataDir: '/path/to/data' } })` reads from a custom data directory. Note that all loaders share one Core instance, created by whichever loader runs first. Later `core` options are silently ignored, so pass identical `core` options to every loader or leave them off entirely. To change the data directory, prefer setting `ELEK_IO_DATA_DIR` in the build environment, which applies no matter which loader runs first.

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
