---
'@elek-io/core': minor
---

Every public `migrate` method now throws a `CoreError` instead of a raw `ZodError` when a file on disk does not match what Core expects.

```ts
try {
  core.entries.migrate(JSON.parse(content));
} catch (error) {
  // Previously a ZodError, which no `instanceof CoreError` branch caught
  if (error instanceof CoreError && error.type === 'BadRequest') {
    // error.cause is the ZodError, so the issues are still there
  }
}
```

`docs/error-handling.md` promises that all services throw `CoreError` on failure, and this was the one place that did not hold. It matters more than the five methods suggest, because `migrate` sits on every read path: reading a malformed Entry, Asset, Collection, Component or Project raised an error a consumer catching `CoreError` never saw.

The type is `BadRequest`, with the `ZodError` kept as `cause` so nothing is lost. A `VersionSkew` raised while applying migrations still passes through unchanged, since a file written by a newer Core is a different failure from a file Core cannot read at all.

Anyone catching `ZodError` around a read or a `migrate` call has to catch `CoreError` instead.
