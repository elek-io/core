---
'@elek-io/core': patch
---

Upgrading a Project whose Project file carries no `coreVersion` now fails with an `UpgradeFailed` error naming the file, instead of an `Internal` error raised from inside semver. The upgrade path reads that file before any schema applies to it, because a Project written by an older Core may not satisfy the current one, and it now validates that the one field it has to compare is actually there.
