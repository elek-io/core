---
'@elek-io/core': minor
---

Image Assets are now native `astro:assets` images. An Asset in a format Astro's image pipeline understands arrives on `data.src` as a ready Astro image, so `<Image src={asset.data.src} />` optimizes, hashes and sizes it like any local image, in dev and in a build alike.

Every other Asset, a PDF or a ZIP for example, is served as it is and carries its URL on `data.href`. Each Asset has exactly one of the two and `null` for the other, which is also how a consumer tells the kinds apart:

```astro
{asset.data.src
  ? <Image src={asset.data.src} alt={asset.data.description} />
  : <a href={asset.data.href}>{asset.data.name}</a>}
```

The two kinds are saved separately, because a single location cannot serve both: Astro only processes recognized image formats below `src/`, and only copies the public directory into a build. Images go to `src/content/elek/<alias>/assets` as before, everything else to the new default `public/elek/<alias>/assets`. `elekAssetsLoader` and the `assets` option of `elekCollections()` take a `publicOutDir` alongside `outDir` to move either. Both are derived artifacts, so `.gitignore` wants `src/content/elek/` and `public/elek/`.
