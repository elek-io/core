# Generated API Clients & Types

Core's CLI can generate typed artifacts from your Project content models: a runtime **API client** (`elek generate:client`) and standalone **TypeScript types** (`elek generate:types`). Both narrow translatable content to each Project's languages, so you get `Record<ProjectLanguage, T>` instead of the broad superset Core's own types expose. A field the Collection does not require is `null` in a language nobody filled in, and the generated type says so: `Record<ProjectLanguage, string | null>`.

For why the narrowing exists, see [`fields.md`](./fields.md#types-built-from-field-definitions). For the API the client talks to, see [`local-api.md`](./local-api.md).

## Which types describe what

Content reaches your code typed in three ways, and they are not interchangeable. Two describe the same payload at different widths, the third describes a payload Core reshaped first.

| Types                    | Where they come from                                  | Reach for them when                                                                                                                 |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Core's exported types    | `import type { Entry } from '@elek-io/core'`          | You write against Core without a specific Project in hand, so every Project and every supported language fits                       |
| `elek generate:types`    | A file the CLI writes into `outDir`, you import it    | You read one Project's content through the [local API](./local-api.md), a generated client, an [export](./export.md) or Core itself |
| The Astro loaders' types | Supplied to Astro by the loader, read as `entry.data` | You read content in an Astro site through `getEntry()` or `getCollection()`                                                         |

The first two describe an Entry as it is stored, so every Value keeps its envelope. The Astro loaders transform an Entry before Astro ever sees it, and their types describe that result:

```typescript
// Core's types and elek generate:types - the stored Value envelope
entry.values.title.content.en;
entry.values.sections.content[0].componentId;

// The Astro loaders - the envelope stripped by the loader
entry.data.title.en;
entry.data.sections[0].componentSlug;
```

Only the first two are ever a choice. In an Astro site the loaders supply the types, and generated types do not describe what `entry.data` holds.

A `dynamic` field is where the shapes differ most, since both sides emit a discriminated union but not on the same discriminant. `elek generate:types` emits an id constant per Component and types the union on `componentId`, so an item is dispatched with `case HeroComponentId:`. The Astro loaders add a `componentSlug` to every item and type the union on that, so an item is dispatched with `case 'hero':`. Both identify the same Component, and each is the readable option in the place it is used.

## generate:client

```bash
elek generate:client [outDir] [language] [format] [target] [--watch]
```

| Argument   | Default      | Meaning                                                           |
| ---------- | ------------ | ----------------------------------------------------------------- |
| `outDir`   | `./.elek.io` | Where to write the generated files.                               |
| `language` | `ts`         | `ts` for TypeScript source, or `js` for compiled JS plus `.d.ts`. |
| `format`   | `esm`        | `esm` or `cjs`. Only applies when `language` is `js`.             |
| `target`   | `es2020`     | JavaScript target. Only applies when `language` is `js`.          |
| `--watch`  | off          | Regenerate automatically when Project content changes.            |

This produces a typed client plus the supporting types in `outDir`. With `language: 'ts'` you get TypeScript source (`client.ts`) to bundle with your own toolchain. With `language: 'js'` the output is compiled to `.js` / `.mjs` with `.d.ts` declarations, where `format` and `target` control the module system and syntax level.

`language: 'js'` needs the compiler, see [Compiling to JavaScript](#compiling-to-javascript).

### Using the client

The client is constructed with a `baseUrl` and `apiKey`, and reads content over HTTP. It exposes typed, validated accessors that mirror the [local REST API](./local-api.md) - for example, listing a Collection's Entries:

```typescript
import { apiClient } from './.elek.io/client.js';

const client = apiClient({
  baseUrl: 'http://localhost:31310',
  apiKey: '<your-api-key>',
});

const { list, total } = await client.content.v1.projects[
  '<project-id>'
].collections['blog-posts'].entries.list({ limit: 10, offset: 0 });

// list[0] is fully typed, with content fields narrowed to Record<ProjectLanguage, T>
```

Each call fetches from `baseUrl` and validates the response against a Zod schema built from the Collection's field definitions, so a malformed response is caught rather than silently mistyped.

**The client is not standalone - it needs an API to talk to.** Point `baseUrl` at a running [local API](./local-api.md) (`elek api:start`) or any compatible elek.io endpoint.

## generate:types

```bash
elek generate:types [outDir] [language] [projects] [--watch]
```

| Argument   | Default      | Meaning                                                |
| ---------- | ------------ | ------------------------------------------------------ |
| `outDir`   | `./.elek.io` | Where to write the type files.                         |
| `language` | `ts`         | `ts` for source, or `js` to emit `.d.ts` declarations. |
| `projects` | `all`        | `all`, or a comma-separated list of Project ids.       |
| `--watch`  | off          | Regenerate automatically when Project content changes. |

Unlike `generate:client`, this emits **type definitions only - no runtime code**. For each Project it produces a narrowed `ProjectLanguage` union plus typed interfaces for every Collection, Component and Entry (with their values narrowed to the Project's languages), and id constants. Use these to type content you load yourself, through the [local API](./local-api.md), an [export](./export.md), Core's own methods or your own fetch layer, without pulling in the client.

They do not apply to an Astro site. The loaders supply Astro with types of their own, for the shape they transform content into, see [which types describe what](#which-types-describe-what).

A single Project writes `types.ts`. Multiple Projects write one `types-{projectId}.ts` per Project. With no Projects in the data directory nothing is written and the command exits successfully, for either language.

`language: 'js'` needs the compiler, see [Compiling to JavaScript](#compiling-to-javascript).

## Compiling to JavaScript

Both commands generate TypeScript first. Passing `js` as the language compiles it, which needs two packages Core declares as optional peer dependencies and does not install for you:

```bash
npm install --save-dev tsdown typescript
```

Install them as dev dependencies of the project you run `elek` in. Without them the `js` language fails with a message naming both, and every other command, including both generators with the default `ts` language, is unaffected.

On **TypeScript 7** the compiler also needs a `tsconfig.json` in the project, otherwise it fails with `tsgo generator requires a tsconfig file to be specified`. TypeScript 5 and 6 have no such requirement.

## Output location

Both commands default to `./.elek.io`. That directory is also the CLI's default for `elek export`, so keep generated artifacts and exports together or pass a different `outDir`.

## See Also

- [`local-api.md`](./local-api.md) - the REST API the generated client reads from- [`usage.md`](./usage.md) - the CLI and the Astro integration in context
- [`export.md`](./export.md) - exporting content to plain JSON instead
