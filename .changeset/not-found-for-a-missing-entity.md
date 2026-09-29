---
'@elek-io/core': minor
---

Reading something that is not there now fails with `NotFound`, the way `docs/error-handling.md` has always said it does. It used to fail with `Internal`, so the local API answered `500` for a missing Entry.

```ts
try {
  await core.entries.read({ projectId, collectionId, id });
} catch (error) {
  // Previously Internal / 500, carrying Node's raw ENOENT message
  if (error instanceof CoreError && error.type === 'NotFound') {
    // ...
  }
}
```

Node reports a missing file with an `ENOENT` code rather than a type, and nothing turned that into a `CoreError`, so it reached `CoreError.fromUnknown`, which types everything it does not recognise as `Internal`. `JsonFileService` now answers a missing file with `CoreError.notFound`, and every entity read goes through it.

It affects reading a Project, Collection, Component, Entry or Asset by id, and listing or counting the contents of a parent that does not exist. Addressing a Collection or Component **by slug** already answered `NotFound`, so the two forms disagreed for the same condition and now agree.

The same change closes a second gap. `entries.create` and `collections.create` read the Project's languages between the boundary's pre-parse and the validation that follows it, which sits outside every `try`, so creating in a Project that does not exist threw a raw `Error` that no `instanceof CoreError` branch caught. That read is one of the reads above, so it now raises a `CoreError` like everything else.

Anyone branching on `statusCode` or `type` sees `404` and `NotFound` where they saw `500` and `Internal`. Nothing is added to `CoreErrorType`, so a `satisfies Record<CoreErrorType, true>` map still compiles.
