# Signing in to elek.io Cloud

Core signs in to an elek.io account and keeps the session for the rest of the process. This page covers the calls on `core.cloud.account`, where the session's token lives, and what each call does to the User. Read it to build a sign in form, or to run a script against elek.io Cloud.

## The calls

| Call | Answers | Sends |
| --- | --- | --- |
| `signUp({ name, email, password })` | `{ outcome: 'session', token, account }` or `{ outcome: 'verification' }` | `POST /api/auth/sign-up/email` |
| `signIn({ email, password })` | `{ token, account }` | `POST /api/auth/sign-in/email` |
| `read()` | the account of the session Core holds, or `null` | `GET /api/auth/get-session` |
| `signOut()` | nothing | `POST /api/auth/sign-out` |
| `onTokenChange(listener)` | a function that removes the listener | nothing |
| `hasToken` | whether Core holds a token | nothing |

An account is `{ id, name, email }`, and `id` is a uuid. Every path is appended to the `cloud.url` option, see [`usage.md`](./usage.md#options).

No call is retried. Each one is a request that must not repeat, because a retry after a timeout can create a second account or spend the rate limit on a password guess.

## Signing in

```typescript
import ElekIoCore from '@elek-io/core';

const core = new ElekIoCore();

const { token, account } = await core.cloud.account.signIn({
  email: 'ada@example.com',
  password: 'correct horse battery staple',
});
```

Core keeps `token` and sends it as a bearer token on every later elek.io Cloud call, a report included. It also asks git tokens for elek.io Cloud's git hosts with it, see [`cloud-git.md`](./cloud-git.md).

Signing in sets a `cloud` User with the account's `id`, `name` and `email`, and keeps the `language` and `localApi` settings of the User before. A data directory without a User yet starts on `en`, with the local API disabled on port 31310.

Signing in and signing up never send the token Core holds, so a refused attempt, a mistyped password included, keeps it. Signing in again replaces the token. It does not end the earlier session, so call `signOut()` first to end that one.

## Signing up

`signUp()` has two outcomes, and `outcome` says which:

| `outcome` | Means | Token | User |
| --- | --- | --- | --- |
| `session` | The account exists and Core signed in to it | kept, as by `signIn()` | set, as by `signIn()` |
| `verification` | The address has to be verified before anybody signs in with it | none | unchanged |

```typescript
import ElekIoCore from '@elek-io/core';

const core = new ElekIoCore();

const result = await core.cloud.account.signUp({
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct horse battery staple',
});

if (result.outcome === 'session') {
  console.log(`Signed in as ${result.account.id}`);
} else {
  console.log('Verify the address, then sign in');
}
```

The `verification` outcome carries no account. elek.io Cloud answers the same for a new address and for an address that already has an account, so the outcome says nothing about which of the two it was.

A password has 12 to 128 characters, a name 1 to 256 with no `|` and no control character, and an address up to 254. A length counts UTF-16 code units, as `String.length` does, so an emoji counts as two. Core refuses a value outside these with `BadRequest` before anything is sent.

## Reading the account

`read()` asks elek.io Cloud for the account of the session Core holds. It answers `null` without a request while Core holds no token. It answers `null` and forgets the token when the session is not live any more, and the User stays as it is.

For a live session the User follows the account, as on signing in. A name or an address changed on the account reaches `user.json`, a `local` User becomes the account's `cloud` User, and a User of another account is replaced, keeping the language and the local API settings. Nothing is written while the User already matches.

Call it when a host starts, to check a token it stored and bring the User up to date, see [handing the token back](#handing-the-token-back).

## Signing out

`signOut()` sends `POST /api/auth/sign-out` with the token, forgets the token and sets a `local` User. That User keeps the name, the email, the language and the local API settings, and its `id` is `null`.

It signs out on this machine whatever elek.io Cloud answers. When the request fails, because elek.io Cloud is unreachable, silent for 15 seconds or refuses it, Core still forgets the token, sets the `local` User, logs a warning and resolves. The session then stays live on elek.io Cloud until it expires, and only a copy of the token you kept can reach it.

While Core holds no token, `signOut()` sends nothing and only sets the `local` User.

## The token

Core holds the token in memory. It never writes it into `user.json`, a log file or any other file, and the token is not part of `core.options`. So the session ends with the process unless the host keeps the token.

| Host | Keeps the token in | Hands it back through |
| --- | --- | --- |
| An application | the platform's credential store, such as Electron's `safeStorage` | the `cloud.token` option |
| A command line tool or a script | its environment | the `ELEK_IO_CLOUD_TOKEN` environment variable |

Core reads both once at construction, and the option wins over the variable.

Hand a token to one process only. Its git tokens replace each other, so two processes or two Cores on one session revoke each other's, see [`cloud-git.md`](./cloud-git.md#one-session-per-process). Sign each application and command line tool in on its own.

`onTokenChange()` tells a listener every token Core keeps and drops from then on: the token of a sign in or a sign up, and `null` after `signOut()`, a 401 or a `read()` that found no live session. It is never called for the token Core started with. Keep the stored copy current from there, and nothing else has to track the token. A listener that throws or rejects is logged and changes nothing else.

### Handing the token back

```typescript
import ElekIoCore from '@elek-io/core';

const stored = new Map<string, string>();
const storedToken = stored.get('elek.io Cloud');
const core = new ElekIoCore({ cloud: { token: storedToken } });

core.cloud.account.onTokenChange((token) => {
  if (token === null) {
    stored.delete('elek.io Cloud');
  } else {
    stored.set('elek.io Cloud', token);
  }
});

const account = await core.cloud.account.read();
if (account === null) {
  console.log('No live session, sign in again');
}
```

The `Map` stands in for the platform's credential store.

## When a session ends

A session can stop being live at any time. Core learns it from the next call that reaches elek.io Cloud:

| elek.io Cloud answers | Token | User | The call |
| --- | --- | --- | --- |
| 401 to any call that sends the token, a report included | forgotten | unchanged, still `cloud` | throws `Unauthorized` |
| no live session to `read()` | forgotten | unchanged, still `cloud` | answers `null` |

The User stays `cloud`, so commits keep the author they had. Ask the person to sign in again, and signing in to the same account sets the same User.

## Errors

Every call throws a `CoreError`, see [`error-handling.md`](./error-handling.md).

| Type | When |
| --- | --- |
| `BadRequest` | The props failed validation, or elek.io Cloud rejected them (400) |
| `Unauthorized` | `signIn()` with a wrong address or password (401), and any other 401 or 403 |
| `Conflict` | `signIn()` for an address that is not verified yet (403), or `signUp()` for an address an account already holds (422) |
| `RateLimited` | This client signed up or signed in too often (429) |
| `PreconditionFailed` | elek.io Cloud could not be reached, or did not answer within 15 seconds |
| `Internal` | elek.io Cloud failed (5xx), or accepted the call and answered with something Core cannot read |

`Conflict` is how a sign in form tells an unverified address apart from a wrong password, so it asks for what verifies the address rather than for the password again. A refusal keeps no token and leaves the User as it was. No message repeats what elek.io Cloud answered, the address or the password.

## See also

- [`usage.md`](./usage.md#options) - the `cloud.url` and `cloud.token` options, and `ELEK_IO_CLOUD_TOKEN`
- [`cloud-git.md`](./cloud-git.md) - git against elek.io Cloud's git hosts with the session
- [`reporting.md`](./reporting.md) - sending a report, which carries the token
- [`error-handling.md`](./error-handling.md) - `CoreError` and how to catch failures
