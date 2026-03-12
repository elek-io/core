---
'@elek-io/core': minor
---

Separated git history from CRUD return values for improved performance. `history` and `fullHistory` are no longer included on `Project`, `Collection`, `Entry`, and `Asset` objects. Use the new `history()` method on each service instead (e.g. `core.projects.history({ id })`, `core.entries.history({ projectId, collectionId, id })`).
