# The local API reference page

Where the JavaScript bundle behind `GET /` comes from, why Core serves it rather than letting a browser fetch it, and what has to move together when either half is updated. For what the page offers a reader, see [`../docs/local-api.md`](../docs/local-api.md#built-in-documentation).

## Core serves every file the page loads

`@scalar/hono-api-reference` renders a page whose script tag points at jsDelivr by default, and Scalar's typefaces are only served from `fonts.scalar.com`. Both are a problem for the same two reasons:

- A local API that cannot be reached from another host still asks another host before it renders. With every host but loopback blocked, the default page leaves `#app` empty and renders not one character.
- Nothing about Core should tell a third party that somebody opened it, which the request alone does.

So the renderer's `cdn` option points at Core's own route, four switches turn off what would reach Scalar at runtime, and the bundle ships inside the package. [`../src/api/lib/reference.ts`](../src/api/lib/reference.ts) holds the route and finds the file, [`../src/api/index.ts`](../src/api/index.ts) holds the switches.

## Where the bundle comes from

| Step | What |
| --- | --- |
| Pinned | `@scalar/api-reference` is an exactly pinned devDependency. It unpacks to tens of megabytes and brings Vue and its whole tree, so a runtime dependency would land in every install of Core for one file |
| Copied | `copy` in [`../tsdown.config.ts`](../tsdown.config.ts) puts that package's `dist/browser/standalone.js` into `dist/node/reference/scalar.js`, with the notice of its license beside it |
| Published | `files` ships `dist/node`, so both travel with the package |
| Found | `readScalarBundle` reads that copy through the package root, and falls back to the pinned devDependency, which is what a run from `src/` has instead of a `dist` |

The single-file UMD build is the one that is copied. The ESM build is smaller but imports its chunks at runtime, so every chunk file beside it would have to ship and be served too.

One copy is made, and `dist/node`, `dist/astro` and `dist/cli` each bundle the code that reaches it:

- A path relative to the entry's own directory finds the copy from `dist/node` alone, and `elek api:start` answers 500 on the bundle's path. So the path is built from the package root instead.
- [`../src/api/reference.test.ts`](../src/api/reference.test.ts) reads the entries out of `dist/` rather than listing them, so a new one is covered by the time it carries the code.

## Both halves move together

`@scalar/hono-api-reference` renders the page and `@scalar/api-reference` is the page, so a dependency round bumps both or neither. The renderer writes the configuration object the bundle parses, and Scalar's schema falls back to a default for a key it does not know, so a switch one half has and the other does not is dropped without a word.

Nothing mechanical ties the two versions, because the renderer asks jsDelivr for whatever Scalar published last rather than for a version. [`../src/api/reference.test.ts`](../src/api/reference.test.ts) holds what can be checked: the pin is exact, the copy in `dist` matches it, and the publish carries both files.

## What a change here has to keep true

- The page names no absolute address, so a browser asks the host it came from and no other.
- `withDefaultFonts`, `showDeveloperTools`, `agent` and `proxyUrl` stay as they are, or the page loads fonts from Scalar, offers its account features, or lets a request go through Scalar's proxy.
- Every server variable in the OpenAPI document carries a string default. A number leaves the placeholder in the server URL, and a test request throws on it instead of reaching the API.
- The license notice names the file beside it. Core ships a third-party file, so it ships what that file is licensed under.

[`../src/api/api.test.ts`](../src/api/api.test.ts) asserts the first three against a started server, and [`../src/api/reference.test.ts`](../src/api/reference.test.ts) the last one.

## See also

- [`../docs/local-api.md`](../docs/local-api.md) - what the local API serves, the reference page included
- [`openapi-document.md`](./openapi-document.md) - how the document the page renders is generated
- [`peer-dependencies.md`](./peer-dependencies.md) - the ranges to re-check before bumping a dependency that pulls Zod
