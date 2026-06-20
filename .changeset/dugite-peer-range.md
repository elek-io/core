---
'@elek-io/core': patch
---

Widen the `dugite` peer dependency from the exact `3.2.2` to `^3.0.0`.

Core only uses dugite's functional `exec` API (with `IGitStringResult`, `parseError` and
`GitError`), which has existed since dugite 3.0.0. Pinning the exact version forced every
consumer onto one dugite release and risked a peer conflict. The wider range lets a
consumer satisfy Core's peer with any dugite 3.x they already have, so they keep a single
copy. This is not a breaking change. Consumers on dugite 3.2.2 are unaffected.
