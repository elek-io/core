---
'@elek-io/core': patch
---

**`ELEK_IO_LOG_LEVEL` is documented as what it is, the level of Core's own logger.** `docs/usage.md` said that setting it to `error` keeps Core out of an Astro build's output. It takes out the line Core writes when it starts and one per slug index rebuild, while the `[elek-assets]` and `[elek-entries]` lines stay, because the loaders report through Astro's logger. The docs now say so and point at `astro build --silent` for those, which silences the whole build, warnings and errors included. No behavior changed.
