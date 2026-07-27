---
'@elek-io/core': minor
---

An Astro site now declares the elek.io Projects it consumes once, in a config created with the new `defineElekConfig()`, and imports that config wherever it is needed. Every Project gets an alias the consumer chooses, and the loaders accept only the declared aliases, so referencing a Project the config does not know is a TypeScript error instead of a failing build. The config validates itself where it is written, so a malformed Project id or a mistyped key fails there rather than somewhere in the build. By convention it lives in `elek.config.ts`, but nothing discovers it automatically, the imports are what connect the files.

Breaking on the loader surface. `elekAssets` is now `elekAssetsLoader` and `elekEntries` is now `elekEntriesLoader`, matching the `Loader` suffix the Astro ecosystem uses. Both take `{ config, project }` instead of a `projectId`, where `project` is the alias. `elek()` takes `{ config }` instead of its own `projects` array and requires a `remoteUrl` per declared Project, failing fast and naming the alias when one is missing. A Project without a `remoteUrl` is a valid declaration for a site that only reads from the local data directory and needs no integration at all.

```ts
// elek.config.ts
export const config = defineElekConfig({
  projects: {
    website: {
      id: 'abc-123-...',
      remoteUrl: 'https://github.com/acme/content.git',
    },
  },
});

// astro.config.mjs
export default defineConfig({ integrations: [elek({ config })] });

// src/content.config.ts
export const collections = {
  posts: defineCollection({
    loader: elekEntriesLoader({
      config,
      project: 'website',
      collectionIdOrSlug: 'posts',
    }),
  }),
};
```
