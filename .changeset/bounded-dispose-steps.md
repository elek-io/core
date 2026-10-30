---
'@elek-io/core': minor
---

`dispose()` resolves within seconds even when one of its steps never finishes, and says which step that was.

**Every step is bounded.** Stopping the local API, closing the credential relay's loopback listener and closing the logger each get 5,000ms. A step that has not finished by then is given up on, the remaining steps still run, and `dispose()` resolves. Before, a step that stopped coming back took the whole shutdown with it, and a host that awaits `dispose()` on quit or after a failed start waited forever.

**The stalled step is named.** `dispose()` now answers `{ stalledSteps }`, which lists what it gave up on as `api`, `relay` or `logger`, and is empty when every step finished. The new `disposeStepNames` holds the words Core itself uses for each, so what you show a person reads like Core's own log record. Each stalled step also leaves a `warn` record naming it in the log file, except the logger, whose own stream has ended by the time Core knows. A stalled step is given up on rather than undone. `api` and `relay` stop accepting, which releases their port, and then wait for the connections still open. `api` first waits for a start still in progress, so one given up on there closes its listener only once that start finishes. A stalled `logger` means winston never confirmed its flush, so a record still in a transport's buffer never reaches the log file. Read a named step as something to report rather than to retry.

**`core.logger.close()` answers whether it flushed**, `true` once winston's `finish` arrived and `false` once Core gave up waiting for it. It used to wait for that event without a bound, so a shutdown could stop there.
