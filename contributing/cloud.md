# elek.io Cloud calls

How Core talks to elek.io Cloud, how it holds a session, and what every call has to keep. For what a consumer sees, read [`../docs/cloud-account.md`](../docs/cloud-account.md) and [`../docs/reporting.md`](../docs/reporting.md).

## The decision

Every call goes through [`CloudClient`](../src/util/cloud.ts). It owns the base URL, the bearer token, the timeout and the mapping of a refusal onto a `CoreError`. A service only says what it sends and which refusal it reads differently from the shared mapping.

| Rejected | Why |
| --- | --- |
| Each service calling `fetch` itself | The report did, and the token, the 401 rule and the mapping would be copied into every new call |
| An HTTP client library | The global `fetch` covers one JSON request with a timeout, and a library brings retries Core has to turn off |
| Retrying a call | A retry after a timeout can duplicate a report or an account, or spend a rate limit on a password guess, and Core cannot tell from the outside whether the first one landed |

## Invariants

- **An answer's body never reaches a message.** A body can echo what was sent, and a `CoreError` message is written to a log file at the service boundary. A refusal's `code` is read only to pick a type, through a `CloudRefusal`.
- **The token lives in memory and nowhere else.** It arrives through `cloud.token`, `ELEK_IO_CLOUD_TOKEN` or a sign in. It is not part of `core.options`, which a host may log or hand around, and which could not forget it.
- **A 401 forgets the token it was sent with.** Whatever the call that sent it, a 401 means the session is gone, so the calls after it carry none instead of being refused again. A 403 keeps the token, because it refuses one call rather than the session.
- **A token is validated before it is kept.** `fetch` throws on a header value it cannot carry and quotes that value in its error, so `cloudTokenSchema` stops one at the door.
- **The User is set before the token is kept.** A User that cannot be written then leaves no token behind that the caller never received.

## The session

[`AccountService`](../src/service/AccountService.ts) signs in, and the decisions below are what the code alone does not say.

- **The host persists the token.** Core never writes a credential into a file it writes. `user.json` was rejected because it sits in every backup of the data directory, and an OS keychain because it needs a native dependency per platform while Desktop already has Electron's `safeStorage`.
- **A dead session leaves the User `cloud`.** Setting a `local` User on a 401 was rejected. Commits would change author halfway through the work, and signing in again sets the same User anyway.
- **Signing out never depends on the network.** Keeping the token and throwing was rejected, because nobody could sign out offline. Throwing after signing out locally was rejected too, because a host that deletes its stored copy after the `await` would keep it.
- **Signing in and up are anonymous.** They start a session rather than use one, so they send no token, and their 401 is a wrong password rather than a dead session. Sending the token, and forgetting it on any 401, was the first version, and a mistyped password dropped a live session with it.
- **Core tells the host when the token changes.** The host persists the token, and Core is the only party that sees it die, so `onTokenChange()` is how the two stay in step. It is a method rather than a `cloud` option, because a function does not fit an option set that is validated and exposed as `core.options`. A failing listener is logged and never fails the call that changed the token.
- **A live session read updates the User.** The User follows the account wherever Core learns it, so a name changed on the account reaches the next commit. `read()` writes only when something differs, since a host calls it at every start.

### Why the refusals map as they do

- **An unverified address is `Conflict`, not `PreconditionFailed`.** `PreconditionFailed` is what an unreachable Cloud throws, so a sign in form switching on it would ask for the code from the mail while offline. The credentials are valid and the account's state refuses them, which is what `Conflict` means elsewhere.
- **The `verification` outcome carries no account.** For an address that already has one, elek.io Cloud answers a made up `user`, so handing it back would hand a caller an id that belongs to nobody.
- **The 422 for an address an account holds is mapped and nothing more.** It goes away once elek.io Cloud requires a verified address, so nothing is built on it.

## See also

- [`../docs/cloud-account.md`](../docs/cloud-account.md) - the calls, the token and the User as a consumer sees them
- [`../docs/reporting.md`](../docs/reporting.md) - the report, a call through the seam
- [`naming.md`](./naming.md#the-account) - why the account calls carry the names they do
- [`logging.md`](./logging.md) - why neither a body nor a credential may reach a log file
- [`error-handling-internals.md`](./error-handling-internals.md) - the boundary that logs a `CoreError` message
