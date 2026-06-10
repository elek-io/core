---
'@elek-io/core': minor
---

Protect Assets and Entries from deletion while still referenced

Deleting an Asset or Entry that is still referenced by another Entry's values now fails with a `Conflict` error instead of silently leaving dangling references, mirroring the existing Component delete protection. References are detected in flat `reference` fields, in `assetReference` / `entryReference` nodes inside `mdast` fields, and nested inside `dynamic` / component items. The error's `cause` carries the list of referring Entries, each annotated with the offending field and, for nested cases, the component path.

As part of the same fix, write-time reference validation now also descends into `dynamic` / component items, so a broken reference stored inside a component block is caught on Entry create and update rather than slipping through.
