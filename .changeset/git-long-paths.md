---
'@elek-io/core': patch
---

**Git commands work where a path passes the Windows limit.** Core hands git `core.longpaths=true` on every command it runs, so creating a Project in a deep directory, committing to it and reading its history work on Windows, where a path is resolved against 260 characters.

- **It is passed per command** rather than written into a Project, so a clone, a read-only Core and a Project an earlier version created all get it.
- **Git LFS is a separate binary** that handles long paths its own way, so the Asset binaries it stores are the part this does not cover. See `docs/features.md`.
- Nothing changes about how a command is classified, logged or redacted. A log line still shows the command line as the caller wrote it.
