---
'@elek-io/core': patch
---

Fix Asset binary loss when replacing a file with one of the same extension

Replacing an Asset's file through `update` with a `newFilePath` of the same extension deleted the binary it had just written, because the previous and new paths in `lfs/` were identical. The previous binary is now removed only when the extension actually changes. Listing and counting Assets also enumerate the JSON metadata in `assets/` instead of the `lfs/` binaries, so an Asset whose binary is missing or not yet fetched stays listed and recoverable rather than disappearing.
