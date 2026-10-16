# elek.io Cloud calls

How Core talks to elek.io Cloud, and what every call has to keep. For what a consumer sees, read [`../docs/reporting.md`](../docs/reporting.md) and the `cloud` options in [`../docs/usage.md`](../docs/usage.md#options).

## The decision

Every call goes through [`CloudClient`](../src/util/cloud.ts). It owns the base URL, the bearer token, the timeout and the mapping of a refusal onto a `CoreError`. A service only says what it sends and which refusal it reads differently from the shared mapping.

| Rejected | Why |
| --- | --- |
| Each service calling `fetch` itself | The report did, and the token, the 401 rule and the mapping would be copied into every new call |
| An HTTP client library | The global `fetch` covers one JSON request with a timeout, and a library brings retries Core has to turn off |
| Retrying a call | A retry after a timeout can duplicate a report or an account, or spend a rate limit on a password guess, and Core cannot tell from the outside whether the first one landed |

## Invariants

- **An answer's body never reaches a message.** A body can echo what was sent, and a `CoreError` message is written to a log file at the service boundary. A refusal's `code` is read only to pick a type, through a `CloudRefusal`.
- **The token lives in memory and nowhere else.** It arrives through `cloud.token` or `ELEK_IO_CLOUD_TOKEN`. It is not part of `core.options`, which a host may log or hand around, and which could not forget it.
- **A 401 forgets the token it was sent with.** Whatever the call, a 401 means the session is gone, so the calls after it carry none instead of being refused again. A 403 keeps the token, because it refuses one call rather than the session.
- **A token is validated before it is kept.** `fetch` throws on a header value it cannot carry and quotes that value in its error, so `cloudTokenSchema` stops one at the door.

## See also

- [`../docs/reporting.md`](../docs/reporting.md) - the report, a call through the seam
- [`logging.md`](./logging.md) - why neither a body nor a credential may reach a log file
- [`error-handling-internals.md`](./error-handling-internals.md) - the boundary that logs a `CoreError` message
