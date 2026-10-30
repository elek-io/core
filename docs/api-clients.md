# Generated API clients and types

Core's CLI generates typed artifacts from your Project content models: a runtime **API client** (`elek generate:client`) and standalone **TypeScript types** (`elek generate:types`).

Both narrow translatable content to each Project's languages, so you get `Record<ProjectLanguage, T>` instead of the broad superset Core's own types expose. A field the Collection does not require is `null` in a language nobody filled in, and the generated type says so: `Record<ProjectLanguage, string | null>`.

For why the narrowing exists, see [`fields.md`](./fields.md#generated-client-types). For the API the client talks to, see [`local-api.md`](./local-api.md).

## generate:client

```bash
elek generate:client [outDir] [language] [format] [target] [--watch]
```

| Argument | Default | Meaning |
| --- | --- | --- |
| `outDir` | `./.elek.io` | Where to write the generated files. |
| `language` | `ts` | `ts` for TypeScript source, or `js` for compiled JS plus `.d.ts`. |
| `format` | `esm` | `esm` or `cjs`. Only applies when `language` is `js`. |
| `target` | `es2020` | JavaScript target. Only applies when `language` is `js`. |
| `--watch` | off | Regenerate automatically when Project content changes. |

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

| Argument | Default | Meaning |
| --- | --- | --- |
| `outDir` | `./.elek.io` | Where to write the type files. |
| `language` | `ts` | `ts` for source, or `js` to emit `.d.ts` declarations. |
| `projects` | `all` | `all`, or a comma-separated list of Project ids. |
| `--watch` | off | Regenerate automatically when Project content changes. |

Unlike `generate:client`, this emits **type definitions only - no runtime code**. For each Project it produces:

- a `ProjectLanguage` union narrowed to that Project's languages
- typed interfaces for every Collection, Component and Entry, with their values narrowed to the same languages
- id constants, which a `dynamic` field's item union is discriminated on: `case HeroComponentId:`

Use these to type content you load yourself, through the [local API](./local-api.md), an [export](./export.md) or your own fetch layer, without pulling in the client.

An Astro site needs none of it:

- The [loaders](./usage.md#astro-integration) supply its types, for the shape they transform an Entry into rather than for the stored one.
- Their item union is discriminated on the Component's slug rather than on an id constant, see [Rendering a dynamic field](./usage.md#rendering-a-dynamic-field). The id is on every item there too, so both can be read side by side.

A single Project writes `types.ts`. Multiple Projects write one `types-{projectId}.ts` per Project. With no Projects in the data directory nothing is written and the command exits successfully, for either language.

`language: 'js'` needs the compiler, see [Compiling to JavaScript](#compiling-to-javascript).

## Compiling to JavaScript

Both commands generate TypeScript first. Passing `js` as the language compiles it, which needs two packages Core declares as optional peer dependencies and does not install for you:

```bash
npm install --save-dev tsdown typescript
```

Install them as dev dependencies of the project you run `elek` in. Without them the `js` language fails with a message naming both, and every other command, including both generators with the default `ts` language, is unaffected.

**TypeScript 7 needs a `tsconfig.json`**, and TypeScript 5 and 6 need none:

- Without one, either command fails with "The `tsgo` generator requires a tsconfig file to be specified."
- That `tsconfig.json` has to cover the output directory. Writing into a directory its `include` leaves out fails with `tsgo did not generate dts file` and exits 1, with the generated `.ts` file left behind.

Core's default `./.elek.io` is outside a typical `include: ["src"]`, so the command fails there with no `outDir` passed at all. Any one of these fixes it:

- Generate into a directory the tsconfig already covers, for example `elek generate:types ./src/elek js`.
- Add the output directory to the tsconfig's `include` as an explicit glob, `".elek.io/**/*"`. A bare `".elek.io"` does not cover it, because TypeScript's directory globs skip names beginning with a dot.
- Use TypeScript 6, which compiles into either location.

`isolatedDeclarations` is the one option that takes `generate:client js` away on TypeScript 7, whatever directory you write into. It routes declaration generation through Oxc instead of `tsgo`:

- Oxc exits 1 on `TS9007` for a function of the generated client without an explicit return type. That function is a Collection's `entries.list`, so a client generated while no Collection exists anywhere still compiles.
- `generate:types js` is unaffected, and compiles into any directory with the option on.

## Output location

Both commands default to `./.elek.io`. That directory is also the CLI's default for `elek export`, so keep generated artifacts and exports together or pass a different `outDir`.

## See also

- [`local-api.md`](./local-api.md) - the REST API the generated client reads from- [`usage.md`](./usage.md) - the CLI and the Astro integration in context
- [`export.md`](./export.md) - exporting content to plain JSON instead
