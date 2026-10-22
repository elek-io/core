---
'@elek-io/core': minor
---

**An `.apng` Asset reaches an Astro site as an image.** Astro added `apng` to its input formats in 7.2.5, and the Assets loader now reads the Astro you installed rather than assuming Core's own pin.

From that release on an apng Asset carries `data.src` and its `data.href` is `null`, where it used to be the other way round. A template that reads `data.href` for one gets `null`, so render it with `<Image src={asset.data.src} />` like any other image.

Its binary moves with it, from `public/elek/<alias>/assets` to `src/elek/<alias>/images`. Both directories are derived artifacts you gitignore, so a clean checkout never has the old copy, but delete it where you have one or a local build keeps shipping it.

On an astro below 7.2.5 nothing changes. The peer range still allows those releases, and there an apng is not an image, so it keeps `data.href`.
