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

`elekAssetsLoader`'s directories are now optional, images defaulting to `src/elek/<alias>/images` so Astro can process the binaries. Keep that below `src/`: a directory inside `public/` works, but Astro then also copies the untouched original into the build next to the optimized one. Which Projects contribute Collections and Assets at all is the `elekCollections()` selection, and where the binaries of every other Asset go comes with the native `astro:assets` change, both in this same release.

One behavior change for existing loader usage: a relative directory now resolves against the Astro project root rather than the current working directory. Both are the same in a normal `astro build`, they differ only when the build is started from another directory.
