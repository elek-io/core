---
'@elek-io/core': minor
---

**Three of Core's own dependencies moved:**

| Dependency                   | From    | To      |
| ---------------------------- | ------- | ------- |
| `@hono/node-server`          | 2.1.6   | 2.1.11  |
| `@scalar/hono-api-reference` | 0.12.18 | 0.12.25 |
| `hono`                       | 4.13.17 | 4.13.22 |

Six packages they bring moved with them: `@scalar/client-side-rendering` 0.4.17 to 0.4.24, `@scalar/helpers` 0.17.0 to 0.20.0, `@scalar/schemas` 0.16.1 to 0.20.1, `@scalar/types` 0.27.0 to 0.32.1, `@scalar/validation` 0.6.7 to 0.6.9 and `nanoid` 5.1.16 to 6.0.2.

No export of any entry point was added, removed or renamed, and no public type changed. The declarations of all four entries are what the previous release published, apart from the order members are printed in, which two builds of one source differ on anyway. Every peer range is as it was, zod's floor included, because `@scalar/types` still asks for `zod@^4.6.7`.

**The reference page `elek api:start` serves at `/` runs on a newer Scalar**, `@scalar/api-reference` 1.84.0 instead of 1.77.0. Core carries that package's browser bundle inside `dist/node`, so a release of Core is what updates it.

- The HTML Core serves and the OpenAPI document behind it are byte for byte the previous release's, and the page still lists the same 15 content routes.
- The bundle is 4.68 MB instead of 4.93 MB, because Scalar highlights a code block in a description with its own highlighter rather than bundling highlight.js for it.
- The version of the API description is shown as it is written, so Core's `0.1.0` reads `0.1.0` where it read `v0.1.0`.
- Scalar redesigned the cards the request example and the example responses sit in, so the page's markup moved. Nothing else it displays did.

**The fixes in the five hono and five node-server releases are in paths the local API does not take.** Its 15 content routes are all `GET`. Fourteen of them validate a path parameter or a query string, and the fifteenth takes no input at all. None of them reads a JSON or form body, the API calls neither `mount()` nor `serveStatic()`, and it asks for no WebSocket upgrade.

One of them does reach it. From `@hono/node-server` 2.1.8 on, a response whose reader has disconnected is cancelled rather than read to the end.

The git Core develops and tests against moved too, to the one dugite 3.3.3 bundles, which is git 2.56.1 and Git LFS 3.8.1. The `dugite` peer range is unchanged, so the version a consumer installs still decides which git runs.
