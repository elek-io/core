# Generated API Clients & Types

Core's CLI can generate typed artifacts from your Project content models: a runtime **API client** (`elek generate:client`) and standalone **TypeScript types** (`elek generate:types`). Both narrow translatable content to each Project's languages, so you get `Record<ProjectLanguage, T>` instead of the broad superset Core's own types expose.

For why the narrowing exists, see [`fields.md`](./fields.md#generated-client-types). For the API the client talks to, see [`local-api.md`](./local-api.md).

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

Unlike `generate:client`, this emits **type definitions only - no runtime code**. For each Project it produces a narrowed `ProjectLanguage` union plus typed interfaces for every Collection, Component and Entry (with their values narrowed to the Project's languages), and id constants. Use these to type content you load yourself (for example through the [Astro integration](./usage.md#astro-integration) or your own fetch layer) without pulling in the client.

A single Project writes `types.ts`. Multiple Projects write one `types-{projectId}.ts` per Project.

## Output location

Both commands default to `./.elek.io`. That directory is also the CLI's default for `elek export`, so keep generated artifacts and exports together or pass a different `outDir`.

## See Also

- [`local-api.md`](./local-api.md) - the REST API the generated client reads from- [`usage.md`](./usage.md) - the CLI and the Astro integration in context
- [`export.md`](./export.md) - exporting content to plain JSON instead
