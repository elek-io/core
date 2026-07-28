---
'@elek-io/core': patch
---

The Astro documentation now shows code that compiles. `docs/` ships inside the package, so these examples are what a consumer starts from.

The `mdastRender` examples had their renderers object in the frontmatter of an `.astro` file. That fence is TypeScript, not TSX, so a handler written as JSX there is a parse error. The renderers now sit inline at the `mdastRender` call in the template, in the per-page example, in the collected-footnotes example and in the reusable `MdastContent.astro` component alike.

The slug routing example indexed a translatable Value with `Astro.params.language`, which Astro types as `string | undefined`, so the example did not type-check. It now names the languages the route was built for. A new "What an Entry looks like" section documents the generated `entry.data` shape, including which fields are nullable.

The environment variable paragraph no longer implies the loaders' Core is fully configurable through `ELEK_IO_*`, and says which settings, the log level among them, have no variable today.

Every example Project id is a real UUID now, in the docs and in `defineElekConfig`'s own reference. The `abc-123-...` placeholder they used to carry is not a valid id, so copying an example out of the documentation failed on the spot. The docs also say where to read the id, and what `remoteUrl` points at.
