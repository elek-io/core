---
'@elek-io/core': minor
---

`dispose()` resolves within seconds even when one of its steps never finishes, and says which step that was.

**Every step is bounded.** Stopping the local API, closing the credential relay's loopback listener and closing the logger each get 5,000ms. A step that has not finished by then is given up on, the remaining steps still run, and `dispose()` resolves. Before, one handle a platform did not give back took the whole shutdown with it, and a host that awaits `dispose()` on quit or after a failed start waited forever.

**The stalled step is named.** `dispose()` now answers `{ stalledSteps }`, which lists what it gave up on as `local API`, `credential relay` or `logger`, and is empty when every step finished. Each stalled step also leaves a `warn` record naming it in the log file, except the logger, whose own stream has ended by the time Core knows. What a stalled step holds stays held, a loopback port or the last lines Core wrote, so read a named step as something to report rather than to retry.

**`core.logger.close()` answers whether it flushed**, `true` once winston's `finish` arrived and `false` once Core gave up waiting for it. It used to wait for that event without a bound, which is where a shutdown stopped.
