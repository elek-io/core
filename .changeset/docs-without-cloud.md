---
'@elek-io/core': minor
---

**The documentation no longer covers elek.io Cloud.** `docs/cloud-account.md`, `docs/cloud-git.md` and `docs/reporting.md` are gone from the package, and with them the `cloud` options, the `ELEK_IO_CLOUD_*` variables and every Cloud entry the other pages carried. elek.io Cloud is not released, so the reference described calls you cannot make. The documentation comes back with elek.io Cloud.

Nothing changes in the code. `core.cloud.account`, `core.cloud.reports`, the git credential helper, the `cloud` options and the `ELEK_IO_CLOUD_*` variables all behave as before, and every type stays exported. Until the pages are back, Core's repository describes them in `contributing/cloud.md` and `contributing/git-credentials.md`.
