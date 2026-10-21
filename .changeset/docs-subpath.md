---
'@elek-io/core': minor
---

**The documentation inside the package resolves by name.** `exports` maps `./docs/*`, so you reach the reference of the exact Core version you install without knowing where the package keeps its files. The subpath answered with `ERR_PACKAGE_PATH_NOT_EXPORTED` before.

```typescript
const indexUrl = import.meta.resolve('@elek-io/core/docs/index.md');
```

What the package publishes is unchanged. Every page of `docs/` shipped in it before and still does, and no other entry point changes.
