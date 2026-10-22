---
'@elek-io/core': minor
---

**zod `^4.6.6` is required.** The peer range rises from `^4.3.6`. astro raised its own zod dependency to `^4.6.6` in 7.4.0, and Core's floor is the highest zod floor in the tree, so anything below it lets another package pull a second physical zod.

Two copies break the Astro integration at runtime and every schema Core hands you at type-check time, because zod v4 brands a schema with its exact version. The floor is the same for everyone, even though astro itself is an optional peer.

Raise your own zod to 4.6.6 or later when you take this Core, then run your package manager's dedupe. `pnpm why zod`, `npm ls zod` or `yarn why zod` has to report exactly one version.
