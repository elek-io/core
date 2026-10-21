---
'@elek-io/core': minor
---

**The documentation no longer covers elek.io Cloud.** The pages `docs/cloud-account.md`, `docs/cloud-git.md` and `docs/reporting.md` are gone from the package, and so is what the pages that stay said about the `cloud` options, the `ELEK_IO_CLOUD_*` variables and elek.io Cloud's git hosts. They described calls you cannot make, because elek.io Cloud is not released. The documentation comes back with elek.io Cloud.

The same release makes every page of `docs/` resolvable by name, and these three are not among them. `@elek-io/core/docs/cloud-account.md`, `@elek-io/core/docs/cloud-git.md` and `@elek-io/core/docs/reporting.md` do not resolve.

Nothing is removed from the code. `core.cloud.account`, `core.cloud.reports`, the `cloud` options and the `ELEK_IO_CLOUD_*` variables are all still there and every type stays exported. Until the pages are back, Core's repository describes the options in `contributing/cloud.md` and the git side in `contributing/git-credentials.md`.
