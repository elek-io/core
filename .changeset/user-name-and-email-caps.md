---
'@elek-io/core': minor
---

Cap a User's `name` at 256 characters and `email` at 254, and refuse a control character in a name.

These are the limits elek.io Cloud holds an account and a report to, so a User Core accepts is never refused there. A length counts UTF-16 code units, as `String.length` does. `core.user.set()` throws `BadRequest` past either limit, and a `|` in a name stays refused as before.

**A `user.json` that breaks a limit reads back as `null`.** `core.user.get()` already treats a file that no longer matches the schema as no User at all, so a name over 256 characters written by an older Core has to be set again.

The git signature of a commit is not capped. History can hold commits nobody made through Core, and reading one must not fail on a name longer than a User may have.
