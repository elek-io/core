---
'@elek-io/core': patch
---

Three schemas Core used internally are now exported: `projectScopeSchema` and `collectionScopeSchema`, the ids a create or update call is scoped by, and `upgradeableFileSchema`, the Core version a file needs to be considered for an upgrade. Nothing about how Core behaves changes.
