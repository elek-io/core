---
'@elek-io/core': patch
---

**`ELEK_IO_LOG_LEVEL` sets the level of Core's own logger and nothing else.** `docs/usage.md` said that setting it to `error` keeps Core out of an Astro build's output.

The setting reaches `core.logger` alone. At `error` a build loses Core's own lines, and that list is open: the line each Core writes when it starts, the one the integration's writes when it is disposed, the line per slug index rebuild, every git command that changes the copy `elek()` fetches, and every warning Core raises. Core's log file then holds nothing about the build but what failed. The `[elek]`, `[elek-assets]` and `[elek-entries]` lines stay, because the integration and the loaders report through Astro's logger.

The docs now say that, and point at `astro build --silent` for the lines the setting does not cover. That flag silences everything Astro's own logger writes, the loader lines included, and it does not reach Core's logger, so a build that prints nothing needs `--silent` and `ELEK_IO_LOG_LEVEL=error` together. Either way a failing build still prints the error that stopped it and still exits non-zero. No behavior changed.
