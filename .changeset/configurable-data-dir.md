---
'@elek-io/core': minor
---

Make the data directory configurable

Core previously stored everything under a hardcoded `~/elek.io`. The root is now
configurable in two ways: pass `dataDir` to the `ElekIoCore` constructor, or set the
`ELEK_IO_DATA_DIR` environment variable. The constructor option wins over the
environment variable, which wins over the `~/elek.io` default. Relative paths are
resolved against the current working directory. The CLI accepts a global `--data-dir`
option and the Astro loaders accept `dataDir` through their existing `core` options.
The resolved absolute path is exposed as `core.options.dataDir` and `core.util.pathTo`
reflects it per instance.

Nothing changes for existing setups. Without the option or the environment variable,
Core keeps using `~/elek.io`. Reading the environment variable inside Core makes it
possible to isolate a packaged app's data in end to end tests without redirecting
`HOME`, which stalls Electron on Windows CI.

Constructor validation errors are now thrown as `CoreError.badRequest` instead of a
raw `ZodError`, matching how every service boundary reports invalid input. The
original `ZodError` stays attached as the cause. Importing the CLI also no longer
creates directories as a side effect, the CLI creates its Core instance on first use.

`core.util` is narrowed to expose only `pathTo`. It previously leaked the whole
internal util module, including `workingDirectory` and internal helpers, which no
consumer uses.
