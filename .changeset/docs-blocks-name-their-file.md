---
'@elek-io/core': patch
---

**Every code block of the documentation names its language**, so code is colored as the language it is written in and a diagram, a tree or a log reads as plain text instead of being colored as code. The two blocks that show the markup Core's markdown defaults render name HTML.

**A block that shows a file names it in a comment on its first line.** The workflow in `docs/provisioning.md` is `.github/workflows/deploy.yml`, the Astro page that lists Assets in `docs/usage.md` is `src/pages/assets.astro`, and in `docs/markdown-content.md` the page with a collected footnotes section is the `src/pages/posts/[slug].astro` above it while the React renderers are `src/components/MdastContent.tsx`. The name reads as a comment on GitHub and in the installed package, and a renderer that takes a file name from a first-line comment shows it as the block's head instead.

No export, type or behavior changes, and every page answers what it answered before.
