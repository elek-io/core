---
'@elek-io/core': minor
---

Cap every field of a report, with the same limits elek.io Cloud enforces.

elek.io Cloud (theoretically) takes a report from anybody, so it bounds every string it stores. Core now holds the report schemas to the same numbers, so a report that passes them is never refused by Cloud for its shape, and a form built on them can show every limit before anything is sent.

| Field | Limit |
| --- | --- |
| `message` | 10 to 5000, no control characters except tabs and line breaks |
| `user` | A User, whose `name` and `email` now carry limits of their own |
| `desktop.version`, `core.version` | A semantic version of up to 64 |
| `desktop.runtime.*` | Up to 64 digits, letters, `.`, `+` and `-` |
| `core.platform`, `core.arch` | Up to 32 lowercase letters, digits and `_` |
| `core.osRelease` | Up to 64 printable ASCII characters |
| `logs.data` | Base64, up to 2 MB |

A length counts UTF-16 code units, as `String.length` does, so an emoji counts as two. That is the unit a character counter has to use.

**A report's `user` is a User and nothing looser.** Its `name` and `email` are held to the User's own limits, so one prefilled from `core.user.get()` always passes. Its `language` stays one of the languages Core supports rather than any language tag, because that is all a User can have.

**What Core fills in is validated like the rest.** A `core` value or a log tail outside its limit is a `BadRequest` and nothing is sent, as a body over 2 MB already was. Node's values and the operating system's own limits leave the `core` block no room to fail.
