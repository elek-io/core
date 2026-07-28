---
'@elek-io/core': patch
---

The documentation now says that Astro's `render()` does not apply to an elek.io Entry. Coming from a local markdown collection, `const { Content } = await render(entry)` is the obvious move, and on an Entry it is not an error and produces nothing at all: `<Content />` renders empty, `headings` is `[]` and `remarkPluginFrontmatter` is `{}`, with no warning to go on. The loaders leave Astro's rendered slot empty on purpose, because a finished HTML string cannot keep the `entryReference` and `assetReference` nodes a page needs the UUIDs from. Body content arrives on `entry.data` as an mdast tree and `mdastRender` turns it into markup. Written down in the Astro rendering section of `markdown-content.md`, next to the Entry shape in `usage.md` and in the limitations list of `features.md`.
