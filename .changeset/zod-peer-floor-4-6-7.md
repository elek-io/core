---
'@elek-io/core': minor
---

**zod `^4.6.7` is required.** The peer range rises from `^4.6.6`. `@scalar/types` 0.25.0 depends on `zod ^4.6.7`. Core reaches it through `@scalar/hono-api-reference`, which serves the local API's reference page, and Core's floor is the highest zod floor in the tree. A floor below that lets `@scalar/types` resolve its own newer zod next to yours.

Two copies break the Astro integration at runtime and every schema Core hands you at type-check time, because zod v4 brands a schema with its exact version. Installing Core with `zod@4.6.6` now stops at an `ERESOLVE` error naming the `^4.6.7` peer, and forcing it through gives exactly the two copies the peer exists to prevent.

Raise your own zod to 4.6.7 or later when you take this Core, then run your package manager's dedupe. `pnpm why zod`, `npm ls zod` or `yarn why zod` has to report exactly one version.
