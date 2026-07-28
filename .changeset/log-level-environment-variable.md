---
'@elek-io/core': minor
---

The new `ELEK_IO_LOG_LEVEL` environment variable sets the lowest level Core logs, so a build that embeds Core can quieten it from the outside. It accepts `error`, `warn`, `info` and `debug`, defaults to `info` and, like every other variable, loses to the matching constructor option. Anything else throws a `CoreError` naming the four, rather than leaving the logs as they were and looking like the variable did nothing.

This is what an Astro site needs. Its loaders share one Core that takes no options, so until now nothing could stop Core from writing into the build output. `ELEK_IO_LOG_LEVEL=error astro build` now leaves only Astro's own log. The CLI reads it the same way. Both used to pass `info` explicitly, which would have won over the variable, so neither does any more.
