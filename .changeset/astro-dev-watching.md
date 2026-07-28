---
'@elek-io/core': minor
---

The Astro loaders now watch the Projects they read while `astro dev` runs, so editing content in the Desktop app updates the open page instead of needing a dev server restart. Each loader watches only what it reads: a Collection reloads when one of its own Entries changes, Assets reload on their own, and the Project's git history is not watched, so committing does not trigger a reload by itself. Reloads are debounced and never overlap, since saving one Entry writes several files.

Content edits are live, model edits need a restart. Astro builds a collection's schema and its TypeScript types once, when it loads the content config, and offers no way to rebuild them while the server runs, so editing a field definition, a Component or a Project's supported languages means restarting `astro dev`. The loaders detect exactly that and stop instead of reloading Entries against a schema that no longer describes them, which would silently drop an added field and fail on a removed one. The build log names the Collection and says to restart. Adding or removing a whole Collection is not detected, since the set of collections is decided before any loader runs.

The loaders' shared `ElekIoCore` now runs with its file cache off. Core only invalidates that cache for writes it performs itself, and an Astro site is a reader of files another application owns, so a cached Project served content one edit behind. Every file is read once per sync either way. Nothing about the build path changes.
