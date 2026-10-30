# Usage

How to use `@elek-io/core` programmatically, through the local API, the CLI, and the Astro integration.

For the data model these examples build on (Projects, Collections, Entries, Values, Assets), see [`concepts.md`](./concepts.md).

## Installing and instantiating

```bash
npm install @elek-io/core zod dugite
```

Core declares `zod` and `dugite` as required peer dependencies, so you install them alongside Core:

- `dugite` (`^3.2.3`) is the git binding the Node entry point runs every Project operation through, see [git and sync](./git-and-sync.md).
  - On Linux its embedded git needs `libcurl.so.4` for HTTP(S) remotes. Older dugite releases need `libcurl-gnutls.so.4`, which Fedora, RHEL, openSUSE and NixOS do not ship.
  - A git that cannot load a shared library throws a `CoreError` of type `PreconditionFailed` naming it. Install the library, or point dugite's `LOCAL_GIT_DIRECTORY` variable at another git installation that has git-lfs.
- `zod` is what Core authors its schemas with. Use a compatible version (`zod@^4.6.7`) that resolves to a single copy, otherwise Zod's per-version branding makes Core's schemas incompatible with your own Zod usage.

Three more peers are optional and needed by one feature each: `astro` for the [Astro integration](#astro-integration), and `tsdown` plus `typescript` for [compiling generated clients and types to JavaScript](./api-clients.md#compiling-to-javascript).

You still install Zod as above. As a convenience, Core also re-exports `z`, so in your own code you can import it from `@elek-io/core` instead of from `zod` directly. It is the same `z` plus `@hono/zod-openapi`'s `.openapi()` extension.

`ElekIoCore` is the Node entry point. It wires up all services and creates the directories it works in on construction.

```typescript
import ElekIoCore from '@elek-io/core';

const core = new ElekIoCore();
```

### Options

The constructor accepts an optional options object. All fields are optional and default as shown. An option Core does not know throws a `CoreError` instead of being ignored.

```typescript
const core = new ElekIoCore({
  log: {
    level: 'info', // 'error' | 'warn' | 'info' | 'debug' - default 'info'
    hasProcessErrorHandlers: true, // handle uncaught exceptions - default true
  },
  cache: true, // keep what Core reads from the files in memory - default true
  dataDir: '/path/to/data', // directory Core reads and writes data in - default ~/elek.io
  isReadOnly: false, // never mutate a Project or its remote - default false
});
```

The resolved options are exposed on `core.options`, and the running Core version on `core.coreVersion`.

- **`dataDir`** sets the data directory everything lives in, see [`storage-layout.md`](./storage-layout.md). It takes precedence over the `ELEK_IO_DATA_DIR` environment variable, which takes precedence over the default `~/elek.io`.
  - Relative paths are resolved against the current working directory once at construction. `~` is not expanded, that is a shell feature, so pass an absolute path or let the shell expand it.
  - The directory does not need to exist, Core creates it. An empty or whitespace-only value throws a `CoreError`.
  - The resolved absolute path is exposed as `core.options.dataDir`, and `core.util.pathTo` builds every path from it.
- **`log.level`** is the lowest level Core's own logger writes, one of `error`, `warn`, `info` and `debug`. It takes precedence over the `ELEK_IO_LOG_LEVEL` environment variable, which takes precedence over the default `info`.
  - A value that is none of the four throws a `CoreError`, so a typo says so instead of quietly leaving the logs as they were.
  - Set it to `error` where Core is a library inside another tool's output, such as an Astro build. It reaches Core's own logger only, so whatever the host tool logs is untouched, see [Astro integration](#astro-integration).
- **`log.hasProcessErrorHandlers`** decides whether Core registers `process.on('uncaughtException')` and `process.on('unhandledRejection')`, which is what writes an uncaught error into the log file before the process goes down. It defaults to `true`.
  - Set it to `false` where the host owns its own error handling, such as inside a build. The Astro entry does that for you.
  - `dispose()` removes the handlers again either way.
- **`log.hostVersion`** is the version of your own application, written to `service.version` on every record you log with a `source` other than `core`.
  - Core stamps its own version on its own records and has no way to read yours, so without this the records you write carry no version at all, and a log file someone hands you on its own cannot be matched to the build that produced it.
  - It must be a semantic version. A value that is not one throws a `CoreError` rather than writing something the log file's own read contract would reject. See [log files](#log-files) for what a record carries.
- **`cache`** decides whether Core keeps what it reads from a Project's files in memory between calls: parsed JSON files and the index that resolves Collection and Component slugs. It defaults to `true`, and everything kept is dropped whenever git changes a Project's working tree.
  - Set it to `false` when another application writes the same files while this Core runs. The Astro loaders do that for you during `astro dev`.
- **`isReadOnly`** puts Core into read-only mode, meant for environments that only consume content, such as CI builds. It takes precedence over the `ELEK_IO_READ_ONLY` environment variable, which counts as true only when set to `true`.
  - Every operation that would mutate a Project or its remote (create, update, delete, synchronize, setting a remote, releasing, upgrading) throws a `CoreError` of type `PreconditionFailed`.

### Environment variables

Core reads its environment variables once at construction, never at import. All of them use the `ELEK_IO_` prefix with SCREAMING_SNAKE_CASE names. An empty or whitespace-only value counts as unset. When a constructor option covers the same setting, the option wins over the environment.

| Variable | Purpose | Default |
| --- | --- | --- |
| `ELEK_IO_DATA_DIR` | The directory Core reads and writes data in | `~/elek.io` |
| `ELEK_IO_LOG_LEVEL` | The lowest level Core logs | `info` |
| `ELEK_IO_READ_ONLY` | Set to `true` to put Core into read-only mode | unset |
| `ELEK_IO_REMOTE_ACCESS_TOKEN` | Token git presents to a private remote | unset |
| `ELEK_IO_REMOTE_ACCESS_TOKEN_USER` | The username presented alongside `ELEK_IO_REMOTE_ACCESS_TOKEN` | `x-access-token` |
| `ELEK_IO_CHANNEL` | The channel provisioning follows, overrides configured refs | unset |

Core also reads `ELEK_IO_CLOUD_URL`, `ELEK_IO_CLOUD_TOKEN` and `ELEK_IO_CLOUD_GIT_URL`. They configure calls to elek.io Cloud:

- Core reads and validates all three at construction, and an unusable value throws a `CoreError`. A well-formed value does not throw.
- Constructing Core calls nothing. A request reaches elek.io Cloud only when you call a method that talks to it.
- A well-formed `ELEK_IO_CLOUD_TOKEN` becomes the session token every later call carries, as `ELEK_IO_REMOTE_ACCESS_TOKEN` does for git.
- They are not documented until elek.io Cloud is released.

`ELEK_IO_REMOTE_ACCESS_TOKEN` is handed to git through Core's own credential helper:

- It never becomes part of a command line, a remote URL, the repository config or git's environment, so it cannot leak into logs or caches.
- Prompts and askpass programs are disabled, `SSH_ASKPASS` included. A missing token fails the operation with a `CoreError` of type `Unauthorized` instead of hanging it.
- A token the remote refuses fails the operation with `Unauthorized` after one attempt, a Git LFS transfer included.
- While the token is set, configured git credential helpers are bypassed, so the token is authoritative. Without a token, ambient credential helpers keep working as before.
- It applies to HTTP(S) remotes only. SSH remotes authenticate through the ambient SSH setup like ssh-agent.

On Windows, keep the data directory short. Windows resolves paths against a 260 character limit unless long paths are enabled, and Core needs about 137 characters below the data directory for its deepest file, so a data directory beyond roughly 120 characters runs out of room.

See the limitation in [`features.md`](./features.md#intentional-constraints). macOS and Linux allow 1024 and 4096 characters and are not affected.

The environment variable is what makes a packaged app configurable from the outside. For example, an end to end test can point a packaged Electron app at a disposable data directory by injecting `ELEK_IO_DATA_DIR` at launch, without redirecting `HOME` or adding test-only code paths.

### Log files

Core writes to the console and to daily rotated files under `<dataDir>/logs`, kept 30 days. A log file is one JSON object per line, following the [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/):

```json
{
  "timestamp": "2026-08-21T14:02:11.000Z",
  "level": "info",
  "severityNumber": 9,
  "message": "Created file \"/home/you/elek.io/projects/<uuid>/collections/<uuid>/<uuid>.json\"",
  "resource": {
    "service.name": "core",
    "service.version": "0.24.0",
    "os.type": "linux",
    "host.arch": "amd64"
  },
  "attributes": { "file.path": "..." }
}
```

`attributes` uses flat dotted [Semantic Convention](https://opentelemetry.io/docs/specs/semconv/) names where one exists (`error.type`, `code.function.name`, `file.path`, `http.request.method`) and the `elek.` namespace for the rest (`elek.project.id`, `elek.collection.id`, `elek.object.type`, `elek.method`). No `@opentelemetry/*` package is involved, the shape is just the shape.

What each level carries is a promise rather than an accident:

| Level | What lands in it |
| --- | --- |
| `error` | a failure at a service method boundary, and anything Core could not recover from |
| `warn` | something anomalous Core recovered from, such as a file it skipped |
| `info` | **what happened**: every file created, updated or deleted, every git command that changed a repository or a remote, and the Project level events |
| `debug` | **how it happened**: reads, cache hits and misses, and the git commands that only asked something |

So `info`, the default, is enough to reconstruct what was done and in what order, and `debug` adds how Core did it. An application that ships Core to end users can run at `info` and still have a diagnostic record.

A log file holds ids, paths, counts and error messages. It never holds the content of an Entry, the name of a Project, Collection or Asset, or the git signature of the User. It does hold the absolute data directory, which includes the account name, because it is written for the machine it is on. Anything that ships a log file elsewhere is responsible for scrubbing that prefix.

`resource['service.name']` is the `source` the record was logged with, so your own records stay distinguishable from Core's in the same file. `service.version` is Core's version on Core's records, and yours on yours when you set the `log.hostVersion` option above. Set it: a log file someone sends you has no other way to say which build wrote it.

#### The log tail

`core.logger.tail()` reads the last 24 hours of log files back as one blob:

```typescript
const tail = await core.logger.tail();
// { encoding: 'gzip+base64', from, to, isTruncated: false, data: 'H4sIAAAA...' }
```

The records come back oldest first, one JSON object per line, gzipped and then base64 encoded. Two things keep a tail small:

- Log files are read line by line and gunzipped on the way, so a very large one is never held in memory.
- A run of identical records collapses into the first of them plus `elek.log.repeat.count` and `elek.log.repeat.last_timestamp`. A measured day of 78 MB, two thirds of it one stack repeating, came to 4 KB, and an ordinary day is 1 to 25 KB.

Two things a tail does not promise:

- It stops at 4 MB of collapsed records, counted before they are compressed, and sets `isTruncated` to `true` when it had to drop any. The oldest go first, and an ordinary day stays far below that ceiling.
- A tail collected right after a crash can stop short of its last lines, which are usually the ones it was collected for. See [`features.md`](./features.md#intentional-constraints).

**What a tail holds.** Ids, paths, timestamps, counts and error messages, which is to say what happened and in what order. Ids and timestamps are exact, and paths keep their structure below the data directory, because those are the join: a tail plus the repository replays what was done, in order, with the commit for every step. Hashing or truncating an id would destroy that and buy nothing.

**What a tail does not hold.** The content of an Entry, the name of a Project, Collection or Asset, and the git signature of the User were never written to a log file in the first place, so they cannot be in a tail.

What the tail itself removes is the short list a log file may hold because it is written for the machine it is on:

- The home directory prefix becomes `~`.
- An attribute whose key name is on Sentry's default denylist (`token`, `secret`, `password`, `auth` and the rest) is dropped with its value.
- A git signature, a credential in a URL, or an address anywhere in the text is redacted.

Nothing goes silently. What was replaced says what it was (`~`, `[redacted]`, `[email]`), and a record that changed carries `redaction.masked.count` and `redaction.redacted.count`, so a reader can tell a deliberate gap from an empty one.

**A tail is still personal data.** The ids in it resolve against the repository, which makes it pseudonymized rather than anonymous. Scrubbing lowers what a tail carries. It does not change what it is. Ask for consent before collecting one, and decide how long you keep one.

## Setting the User (required before writing)

Every create, update and delete operation commits to git, and git needs a signature. Set the User once before any write - without it, write operations throw a `CoreError` of type `Unauthorized`. Cloning, fetching and reading need no User.

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

`core.user.get()` returns the current `User` or `null` if none is set (a fresh install has no User). There are two kinds of User:

- A `local` User has an `id` of `null`.
- A `cloud` User carries the `id` of an elek.io account. Setting one with `core.user.set()` signs nobody in. It only writes the signature commits are made with.

`name` takes up to 256 characters, with no `|` and no control characters, and `email` is an address of up to 254. A length counts Unicode code points, the way Zod counts them, so a smiling face emoji counts as one while a flag counts as two.

`core.user.set()` throws `BadRequest` past either limit. A `user.json` written by an older Core that breaks one reads back as `null`, the same as no User, so set the User again.

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

Entry Values are keyed by the field definition's `slug`. Each Value declares its `objectType`, `valueType` and per-language `content`. A slug the Collection does not declare fails with `BadRequest` on `create` and `update`, in a Component item's values too, so a misspelled slug cannot drop a Value.

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
  await core.projects.create({/* ... */});
} catch (error) {
  if (error instanceof CoreError) {
    console.error(error.type, error.statusCode, error.message);
  }
}
```

See [`error-handling.md`](./error-handling.md) for the full list of error types and the patterns Core uses internally (`withGitRollback`, `collectResults`, boundary logging).

## Cleaning up

`dispose()` stops the local API if running, closes the loopback listener git's credential helper reaches, and closes the logger, removing the process-level exception handlers.

```typescript
const { stalledSteps } = await core.dispose();
```

Each step gets 5,000ms, so a step that never finishes, such as a log file a platform does not let go of, costs seconds rather than your whole shutdown. `dispose()` resolves either way.

- `stalledSteps` names what Core gave up on, `api`, `relay` or `logger`, and is empty when every step finished.
- `disposeStepNames` holds the words Core itself uses for each step, so what you show a person reads like Core's own log record.
- A stalled step leaves a `warn` record naming it in the log file, except the logger, whose own stream has ended by the time Core knows.
- A stalled step is given up on rather than undone. `api` and `relay` stop accepting, which releases their port, and then wait for the connections still open. `api` first waits for a start still in progress, so one given up on there closes its listener only once that start finishes.
- A stalled `logger` means winston never confirmed its flush, so a record still in a transport's buffer never reaches the log file.
- So read a step in `stalledSteps` as something to report rather than to retry.

## The local API

Core ships a local REST API (Hono + OpenAPI) for reading Project content - useful when building a static site or app against local data. It is read-only and never meant to be exposed to the internet.

```typescript
await core.api.start(31310); // default port, resolves once listening
core.api.isRunning(); // -> true
await core.api.stop(); // resolves once the port is released
```

With the server running, interactive OpenAPI documentation is served at `http://localhost:31310/` and the schema at `http://localhost:31310/openapi.json`. You can also start it without writing code via the CLI (see below).

## The CLI

The package installs an `elek` binary. Run a command with `--help` to see all arguments and options.

- `elek generate:client [outDir] [language] [format] [target]` - generate a JS/TS API client. `--watch` regenerates on content changes.
- `elek generate:types [outDir] [language] [projects]` - generate TypeScript type definitions from Project content models. `--watch` supported. Both generators emit TypeScript by default. Passing `js` compiles it, which needs `tsdown` and `typescript` installed as dev dependencies of your project, see [compiling to JavaScript](./api-clients.md#compiling-to-javascript).
- `elek api:start [port]` - start the local REST API (default port `31310`).
- `elek export [outDir] [projects] [template]` - export Projects to JSON (`nested` or `separate` template). `--watch` supported.
- `elek provision --project <id> --url <url>` - provision a copy of a Project from its remote into the data directory, for example in CI. It runs read-only, so no User is required, and private remotes authenticate through `ELEK_IO_REMOTE_ACCESS_TOKEN`.
  - `--ref` selects a channel (`release` for the latest Release, `preview` for the latest preview Release, `draft` for the tip of the draft branch) or an exact Release version. The `ELEK_IO_CHANNEL` environment variable overrides it.
  - See [`git-and-sync.md`](./git-and-sync.md#provisioning-a-copy-for-builds).

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

`elekCollections()` reads the content model of every declared Project and derives one Astro collection per elek.io Collection, plus one for the Project's Assets.

A Project aliased `website` with a `products` and a `blog-posts` Collection produces `websiteProducts`, `websiteBlogPosts` and `websiteAssets`, which is what `getCollection('websiteProducts')` then expects.

- Keys are always alias-prefixed, also when a single Project is declared, so adding a second Project later never renames the first one's collections.
- Two Collections that would derive the same key fail the build naming both sides rather than one silently winning.

Called like that, with no second argument, it derives **everything** and says so in a warning. That is the shape to start with, before you know what a Project holds. Replace it with a selection before you ship, see [Choosing what to derive](#choosing-what-to-derive).

Nothing discovers `elek.config.ts` automatically, the filename is a convention and the imports are what connect the three files. Put it wherever you like as long as both sides can import it.

### What an Entry looks like

The loaders supply Astro with both a schema and a TypeScript type per Collection, built from its field definitions, so `entry.data` is typed without any codegen step of yours. Every Value is keyed by the Project's languages, and a field the Collection does not require is `null` in a language nobody filled in:

```typescript
entry.data.title.en; // string, the field is required
entry.data.subtitle.en; // string | null, the field is optional
entry.data.body.en; // MdAstRoot | null, an optional markdown field
entry.data.cover.en; // Array<{ id: string; objectType: 'asset' }>, never null
entry.data.related.en; // Array<{ id: string; objectType: 'entry'; collectionId: string }>
```

A `reference` field is an array, empty rather than null when nothing is referenced. The field definition decides what it points at, so the type does too: an Asset reference carries an id, an Entry reference carries the id and the `collectionId` of the Collection the Entry lives in.

That id is also the Astro store id, so following a reference is a `getEntry` away. An Asset resolves against the Project's Assets collection:

```typescript
const cover = await getEntry('websiteAssets', entry.data.cover.en[0].id);
```

An Entry needs the collection key its Collection derives, the alias plus the plural slug in PascalCase described above. `collectionId` is what tells you which Collection a reference landed in, which matters when a field allows more than one:

```typescript
const post = await getEntry('websitePosts', entry.data.related.en[0].id);
```

An Entry carries no `body` and no rendered HTML, so Astro's `render()` and `<Content />` produce an empty page rather than an error. A `markdown` field arrives on `entry.data` as a tree, which [`markdown-content.md`](./markdown-content.md#rendering-markdown-content-in-astro) renders with `mdastRender`.

### Rendering a dynamic field

A `dynamic` field is the page builder shape: an ordered array of items, each one holding the content of a Component the field allows. Every item names its Component twice.

```typescript
entry.data.sections[0].id; // string, the item's own id
entry.data.sections[0].componentSlug; // "hero" | "quote", the Component's slug
entry.data.sections[0].componentId; // the Component's UUID
entry.data.sections[0].values; // that Component's own fields, language keyed
```

- `componentSlug` is what a template dispatches on. It is the name you gave the Component and it survives the content being re-created, where every UUID is new.
- `componentId` addresses the same Component through Core's own methods, the [local API](./local-api.md) and the types [`elek generate:types`](./api-clients.md#generatetypes) writes, which dispatch on an id constant rather than on the slug.
- The array is not language keyed, the `values` inside each item are. Editors order the items once for every language.

The item type is a union discriminated on `componentSlug`, so a `switch` narrows `values` to the Component of that branch. A page hands the field's array to a component of its own, `<Sections sections={entry.data.sections} />`:

```astro
---
// src/components/Sections.astro
import type { CollectionEntry } from 'astro:content';
import Hero from './Hero.astro';
import Quote from './Quote.astro';

type Section = CollectionEntry<'websitePages'>['data']['sections'][number];

interface Props {
  sections: Section[];
}

const { sections } = Astro.props;

function unhandled(section: never): never {
  throw new Error(`Unhandled Component "${String(section)}"`);
}
---
{
  sections.map((section) => {
    switch (section.componentSlug) {
      case 'hero':
        return <Hero values={section.values} />;
      case 'quote':
        return <Quote values={section.values} />;
      default:
        return unhandled(section);
    }
  })
}
```

One component per Component then takes the values of its own branch, named with `Extract`:

```astro
---
// src/components/Hero.astro
import type { CollectionEntry } from 'astro:content';

type Section = CollectionEntry<'websitePages'>['data']['sections'][number];

interface Props {
  values: Extract<Section, { componentSlug: 'hero' }>['values'];
}

const { values } = Astro.props;
---
<h1>{values.headline.en}</h1>
```

### Keeping a dispatch and the content model in step

`astro build` emits types, it does not check them, so a dispatch that no longer matches the content model builds a page with a section missing. `astro check` is what reads them, and it needs `@astrojs/check` and `typescript` in the project:

```bash
astro check && astro build
```

Two changes to the content model then fail, which is what the `default` branch above is for:

- A Component the field allows that the `switch` does not handle. `section` is that member in the `default` branch rather than `never`, and `unhandled()` refuses it.
- A Component the `switch` handles that was renamed. Its `case` matches no member of the union any more.

Two shapes report less than the `switch` does:

- An `Extract<Section, { componentSlug: 'hero' }>` alias that is only declared reports neither change, because an alias of a Component that is gone becomes `never` rather than failing. Reading values off that alias does report the rename, which is what `Hero.astro` above does with `['values']`.
- A chain of `if (section.componentSlug === 'hero' && ...)` conditions reports the rename, because the comparison has no overlap left. It misses the Component the field gained, because nothing asks a chain to be complete.

A field whose `ofComponents` is empty allows every Component of the Project, so its union gains a member whenever a Component is added anywhere, including one no page of yours renders. Give such a field a `default` branch that returns nothing, `default: return;` in place of `return unhandled(section);`, or list the Components the field allows and keep the exhaustive one.

### Choosing what to derive

Pass a second argument and it becomes the complete list of what the site reads. This is the shape to ship:

```typescript
// src/content.config.ts
export const collections = {
  ...(await elekCollections(config, {
    collections: { website: ['pages'], shop: ['products'], blog: ['posts'] },
    assets: { website: { imageDir: './src/media' }, shop: true },
  })),
};
```

That derives `websitePages`, `shopProducts`, `blogPosts`, `websiteAssets` and `shopAssets`. Nothing else: `blog` is not named under `assets`, so its Assets are not derived, and any Collection not named under `collections` is not either.

One rule covers both keys. **A key you leave out contributes nothing, and so does an alias you leave out of a key.** So `{ collections: { website: ['pages'] } }` derives one collection and no Assets at all.

- Name Collections by their plural slug or their id, the same two a loader's `collectionIdOrSlug` takes.
- Under `assets`, `true` takes the default directories, and an object sets `imageDir` for image binaries and `publicDir` for every other file.

Deriving less is worth doing. An unread Collection costs a file read and a schema validation per Entry on every sync, and an unread Assets collection copies every binary of its Project into the site each time.

Three mistakes fail the build rather than passing quietly, because each would otherwise produce exactly what success produces:

- A name that matches no Collection of the Project it is listed under. The error names the alias and lists what that Project does have, so a typo is obvious.
- A selection that derives nothing at all, including `elekCollections(config, {})`.
- A derived Collection that can reference Assets, through a reference field or a markdown field with `assetReferences` enabled, while that Project's Assets are left out. Following such a reference is `getEntry('websiteAssets', ref.id)`, so without the collection it would break while a page renders, far from the config that caused it.

### Declaring collections explicitly

`elekCollections()` returns a plain object, so individual collections can be added next to it, and the loaders behind it are exported for when you want to name a collection yourself or give it a key of your own:

```typescript
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { elekCollections, elekEntriesLoader } from '@elek-io/core/astro';
import { config } from '../elek.config';

export const collections = {
  ...(await elekCollections(config, { collections: { website: ['pages'] } })),
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

The two kinds are saved in different places, because that is what makes each work. Images go to `src/elek/<alias>/images`, below `src/` where Astro can process them. Everything else goes to `public/elek/<alias>/assets`, because only the public directory is served. Override either per Project:

```typescript
await elekCollections(config, {
  collections: { website: ['pages'], shop: ['products'] },
  assets: {
    website: { imageDir: './src/media', publicDir: './public/downloads' },
  },
});
```

`shop` is not named under `assets` there, so its Assets are not derived at all, see [Choosing what to derive](#choosing-what-to-derive). Relative paths resolve against the Astro project root. `imageDir` has to stay inside the project and `publicDir` inside Astro's own `publicDir`, otherwise the Asset cannot be processed or served, and the build says so.

These binaries are derived from the Project, so they do not belong in your site's repository:

```
# .gitignore
src/elek/
public/elek/
```

Those are the only entries the integration needs. Everything else it produces goes through Astro's content store, which lives in `.astro` during development and in `node_modules/.astro` during a build, both of which a standard Astro `.gitignore` already covers.

All loaders share one Core instance, and the loaders themselves take no options for it. What configures it are the `ELEK_IO_*` environment variables of the build:

- `ELEK_IO_DATA_DIR` reads from a data directory other than `~/elek.io`.
- `ELEK_IO_LOG_LEVEL` set to `error` keeps Core's own `[core]` lines out of the build output.
- `ELEK_IO_CHANNEL` switches the content state deployment-wide.
- `ELEK_IO_REMOTE_ACCESS_TOKEN` authenticates against a private remote.

`ELEK_IO_LOG_LEVEL` reaches Core's own logger and nothing else, so the loaders keep reporting even when it is set to `error`:

- **The `[core]` lines go**, and that list is open.
  - A build that uses `elek()` runs two Cores, the integration's and the loaders', so that is two lines about Core starting and one when the integration's is disposed.
  - On a CI runner the whole provisioning trail goes with them. Core logs every git command that changes the copy `elek()` fetches: the clone, the Git LFS install, every LFS fetch and checkout, and outside the `draft` channel the tag fetch and the checkout of the ref.
  - A loader that names its Collection by its slug rather than its id adds a line for every slug index rebuild.
- **Every warning Core raises goes with them**, and that list is open too.
  - A build that uses `elek()` reaches one for every `project.json` provisioning reads before it has validated it, which is how it migrates a Project an older Core wrote.
  - A build also reaches the one `elekCollections()` raises when it is called without a selection.
- Three more of those warnings are about content Core dropped rather than read: an Entry Core could not read, which is why a loader can report more Entries than it stored, a Collection skipped while the slug index is rebuilt, and a file or folder skipped because its name does not parse.
  - The last two name what they skipped. The first carries only what the read failed with, which names the file when the JSON is broken and names the failing field alone when the file parses but does not validate.
- The level governs Core's [log files](#log-files) too, so at `error` the log file holds nothing about the build but what failed.
- The `[elek]`, `[elek-assets]` and `[elek-entries]` lines stay, because the integration and the loaders report through Astro's logger. That covers what each one provisioned, read and wrote, the line [every loader logs about the content state it read](#provisioning-in-ci-with-elek), and their own warnings.
- [`astro build --silent`](https://docs.astro.build/en/reference/cli-reference/#--silent) silences those lines, and everything else Astro's own logger writes with them. It does not reach Core's logger, so a build that prints nothing needs `ELEK_IO_LOG_LEVEL=error` as well.
- Either way a failing build still prints the error that stopped it and still exits non-zero, because that error is not written through a logger.

See [Environment variables](#environment-variables) for the full list, and note that it is the full list. A setting without an environment variable cannot be changed for the loaders' Core.

### Local development

While `astro dev` runs, the loaders watch the Projects they read. Editing an Entry or an Asset in the Desktop app updates the open page a moment later, without restarting the dev server.

Each loader watches only what it reads, so a Collection reloads when one of its own Entries changes and Assets reload on their own. The Project's git history is not watched, so committing in the Desktop app does not trigger a reload by itself.

**Content edits are live, model edits need a restart.** Astro builds a collection's schema and its TypeScript types once, when it loads the content config, and offers no way to rebuild them while the server runs. So changing the content model means restarting `astro dev`:

- Adding, removing or editing a **field definition** of a Collection
- Adding, removing or editing a **Component**, or the fields of one
- Changing a Project's **supported languages**, which every translatable Value is keyed by
- Renaming a **Collection's plural slug**, which Astro names the collection after
- Adding or removing a **Collection or Project**, which changes the set of collections `elekCollections()` returns

The loaders notice all but the last and stop rather than pretend. Instead of reloading Entries against a schema that no longer describes them, which would silently drop a new field or fail on a removed one, the build log says what happened:

```
[elek-entries] The content model of Collection "posts" of Project "website" changed.
Astro builds a collection's schema and types once, when it loads the content config,
so restart the dev server to pick them up. Entries are not reloaded until then.
```

Content editing carries on as normal after the restart. Adding or removing a whole Collection is not detected, because the set of collections is decided before any loader runs.

### Provisioning in CI with elek()

The loaders read from the local data directory, which is empty on a CI runner. The `elek()` integration fills it: it provisions every Project of the config from its remote before Astro's content sync runs.

Each declaration takes an optional `ref`, a channel (`release`, `preview` or `draft`, default `release`) or an exact Release version. The `ELEK_IO_CHANNEL` environment variable overrides it and accepts channels only. Private remotes authenticate through `ELEK_IO_REMOTE_ACCESS_TOKEN`.

- The integration runs on its own short-lived read-only Core, so no User is required and nothing is mutated.
- A locally existing Project managed by the Desktop app is left untouched, so `astro dev` keeps reading the live working copy while CI builds Released content.
- Without the integration, a missing Project fails the build with an error pointing here. The underlying behavior is documented in [`git-and-sync.md`](./git-and-sync.md#provisioning-a-copy-for-builds).

`elek()` provisions every declared Project that has a `remoteUrl`. A Project that only ever comes from the local data directory, for example one the Desktop app manages, is declared without one. The integration skips it, says so in the build log and leaves it to the loaders.

- One config can therefore mix a Project fetched from its remote with a local one.
- A config in which no Project has a `remoteUrl` fails while `astro.config` is read, naming the aliases, because there is nothing left for the integration to do.
- A site whose Projects are all local needs no integration at all.

Every loader logs which content state it read, e.g. `Reading Project "Website" version 1.4.0 (Release tag)`. The label is the checked-out branch, or `Release tag` for a Release or a pinned version.

The line goes through Astro's logger, so `ELEK_IO_LOG_LEVEL` does not take it out of a build. `astro build --silent` does.

For rendering `markdown` field Values (including the required `html`, `assetReference` and `entryReference` handlers), see [`markdown-content.md`](./markdown-content.md).

## See also

- [`concepts.md`](./concepts.md) - the data model these examples build on
- [`fields.md`](./fields.md) - full field type reference
- [`schema-changes.md`](./schema-changes.md) - how editing field definitions cascades into existing Entries
- [`git-and-sync.md`](./git-and-sync.md) - branches, commits and synchronizing with a remote
- [`releases.md`](./releases.md) - tagged snapshots and promoting `draft` into `main`
- [`asset-management.md`](./asset-management.md) - creating, reading and deleting Assets
- [`storage-layout.md`](./storage-layout.md) - where Projects and their files live on disk
- [`local-api.md`](./local-api.md) - the read-only REST API reference
- [`api-clients.md`](./api-clients.md) - generating typed clients and TypeScript types
- [`export.md`](./export.md) - exporting Projects to JSON
- [`error-handling.md`](./error-handling.md) - `CoreError` and error patterns
- [`markdown-content.md`](./markdown-content.md) - rendering rich `markdown` Values
