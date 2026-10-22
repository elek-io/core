---
'@elek-io/core': patch
---

**Git commands work where a path passes the Windows limit.** Core turns `core.longpaths` on for every git command it runs, so creating a Project in a deep directory, committing to it, reading its history and storing an Asset in it work on Windows, where a path is resolved against 260 characters.

- **It arrives per invocation** rather than written into a Project, so a clone, a read-only Core and a Project an earlier version created all get it.
- **A global configuration carries it**, which Core writes and points `GIT_CONFIG_GLOBAL` at. git's Windows build decides long paths while it is still reading the configuration, so a value only the command line carries comes too late for a deep repository's own config file. Your own global git configuration is included in it first, so your identity, credential helpers and URL rewrites are read exactly as before.
- Nothing changes about how a command is classified, logged or redacted. A log line still shows the command line as the caller wrote it.
