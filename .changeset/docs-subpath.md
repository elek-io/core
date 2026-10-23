---
'@elek-io/core': minor
---

**The documentation inside the package resolves by name.** `exports` maps `./docs/*`, so you reach the reference of the exact Core version you install without knowing where the package keeps its files. The subpath answered with `ERR_PACKAGE_PATH_NOT_EXPORTED` before.

```typescript
const indexUrl = import.meta.resolve('@elek-io/core/docs/index.md');
```

This is an addition to `exports` and nothing more. It adds no file to the package, and no other entry point changes.
