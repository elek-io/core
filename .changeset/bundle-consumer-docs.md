---
'@elek-io/core': patch
---

Ship the consumer documentation inside the published package

The package now includes its consumer documentation under `docs/`, available offline and matched to the installed version at `node_modules/@elek-io/core/docs/` with no network lookup. This lets developers and AI coding agents work from accurate, version-matched references. Start at `docs/index.md`, and see the README's "Using Core with AI agents" section for how to point an agent at them.

Documentation is now split by audience. Consumer docs live in `docs/` and ship with the package. Contributor and design docs live in `contributing/` and are not published, so a few docs moved there (testing, language-scoped validation, migration and history flow, how to add a field type, error-handling internals, and the cross-CMS comparison).
