---
'@elek-io/core': minor
---

New `ReleaseService` that diffs the `work` branch against `production` to detect collection and field definition changes, computes the appropriate semver bump (major/minor/patch), and supports creating full releases and preview releases with git tags.
