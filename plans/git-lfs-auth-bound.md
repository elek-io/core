# Pin git-lfs's bound on credential retries

git-lfs 3.8.0 retries a refused credential at most 3 times ([git-lfs#6018](https://github.com/git-lfs/git-lfs/pull/6018), `defaultMaxAuthAttempts` in `lfsapi/auth.go`). Core's dev pin dugite 3.3.2 bundles git-lfs 3.8.1, so the bound can be pinned against it, while the peer floor 3.2.3 still bundles git-lfs 3.7.1, which calls `erase` and `get` again for as long as the helper answers.

Core does not depend on the bound. Its helper answers `quit=1` after an `erase`, see [`git-credentials.md`](../contributing/git-credentials.md#erase-quit1-and-the-rerun). Keep that after the bump, or each LFS request could mint 3 git tokens.

## When dugite bundles git-lfs 3.8.0 or later

1. Bump dugite's dev pin, and check whether the peer floor in [`peer-dependencies.md`](../contributing/peer-dependencies.md) has to follow.
2. Add a test to [`GitService.cloudGit.test.ts`](../src/service/GitService.cloudGit.test.ts) with a fake helper that keeps answering a refused token. Assert git-lfs stops after 3 attempts with `too many authentication attempts`.
3. Update the measurements table in [`git-credentials.md`](../contributing/git-credentials.md#measurements) with the version.
4. Delete this plan.
