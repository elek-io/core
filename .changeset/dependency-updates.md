---
'@elek-io/core': patch
---

Runtime dependencies updated to their latest patch and minor releases: `hono` 4.12.32, `@hono/node-server` 2.0.12, `@hono/zod-openapi` 1.5.1, `@scalar/hono-api-reference` 0.11.11, `fs-extra` 11.4.0, `p-queue` 9.3.3, `semver` 7.8.5 and `uuid` 14.0.1. No public API changed.

The `zod` floor stays at `^4.3.6`. `@hono/zod-openapi`, `@scalar/*` and `astro` are the dependencies that pull `zod`, and none of them raised its requirement, so the single physical copy the peer range exists to guarantee is unaffected.
