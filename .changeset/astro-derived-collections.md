---
'@elek-io/core': minor
---

The new `elekCollections()` derives Astro content collections from the elek.io content model, so a site no longer writes a `defineCollection` block per Collection. It reads every Project the elek config declares and returns one collection per elek.io Collection plus one for the Project's Assets, keyed by the Project alias and the Collection's plural slug in PascalCase (`websitePosts`, `websiteAssets`). Keys are always alias-prefixed, also for a single Project, so declaring a second one never renames the first one's collections. Two Collections that would derive the same key throw naming both sides instead of one silently winning.

```ts
// src/content.config.ts
import { elekCollections } from '@elek-io/core/astro';
import { config } from '../elek.config';

export const collections = {
  ...(await elekCollections(config)),
};
```

The Assets collection is included per Project and opts out with `{ assets: false }` for all of them or `{ assets: { website: false } }` for one. `elekAssetsLoader`'s `outDir` is now optional and defaults to `src/content/elek/<alias>/assets`, below `src/` so Astro can process the binaries, overridable per Project with `{ assets: { website: { outDir: './public/media' } } }`. Those binaries are derived artifacts, so add `src/content/elek/` to your `.gitignore`.

One behavior change for existing loader usage: a relative `outDir` now resolves against the Astro project root rather than the current working directory. Both are the same in a normal `astro build`, they differ only when the build is started from another directory.
