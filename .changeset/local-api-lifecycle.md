---
'@elek-io/core': minor
---

`core.api.start()` and `core.api.stop()` return promises that settle once the port is bound or released.

**`start()` says when it fails.** A busy port surfaced as an uncaught server `error` event while `start()` returned normally, so a caller could not tell a failed start from a running one. `start()` now resolves once the API is listening and rejects with `Conflict` when something else holds the port.

**A second `start()` no longer strands the first server.** It replaced the tracked server, so the first one kept answering and neither `stop()` nor `dispose()` could close it until the process ended. A start while the API is running or still starting now rejects with `PreconditionFailed`.

**`stop()` and `dispose()` release the port before they resolve**, so restarting on the same port right away works. Code that called `start()` and then polled `isRunning()` can await `start()` instead.
