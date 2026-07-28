---
'@elek-io/core': minor
---

The `elek` binary starts again. `generate:client` and `generate:types` imported tsdown at module top level, which bundled tsdown and rolldown into `dist/cli`. rolldown loads its parser through a platform specific native binding, and a native binding cannot be bundled, so every `elek` command failed at startup with `Cannot find native binding`. The import is now lazy and reached only when compiling to JavaScript, which also drops `dist/cli` from 6.0M to 1.6M.

`tsdown` (`^0.22.3`) and `typescript` (`^5.0.0 || ^6.0.0 || ^7.0.0`) are now declared as optional peer dependencies. They are what keeps them out of the bundle, and they are only needed to run `generate:client` or `generate:types` with `js` as the language. Install both as dev dependencies of your project if you use it, otherwise nothing changes: every other command, and both generators with the default `ts` language, work without them. The `js` language now fails with a message naming both packages instead of a raw module resolution error.
