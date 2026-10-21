---
'@elek-io/core': patch
---

**`ELEK_IO_LOG_LEVEL` is documented as what it is, the level of Core's own logger.** `docs/usage.md` said that setting it to `error` keeps Core out of an Astro build's output.

The setting reaches `core.logger` alone. At `error` a build loses Core's startup lines, its slug index rebuilds and every warning it raises, and Core's log file keeps no record of the build. The `[elek]`, `[elek-assets]` and `[elek-entries]` lines stay, because the integration and the loaders report through Astro's logger.

The docs now say that, and point at `astro build --silent`, which silences those lines on Astro's side and takes Astro's whole output with them. It does not reach Core's, so a build that prints nothing needs both. Either way a failing build still prints the error that stopped it and still exits non-zero. No behavior changed.
