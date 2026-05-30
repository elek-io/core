---
'@elek-io/core': patch
---

Upgraded to pnpm 11. Migrated build script approval from the removed `onlyBuiltDependencies` and `ignoredBuiltDependencies` fields to the new `allowBuilds` map, keeping dugite's build enabled and esbuild and sharp disabled.
