---
'@elek-io/core': minor
---

**Git against elek.io Cloud's git hosts with a session.** Core answers git's credential requests for elek.io Cloud's git hosts itself. The first time a session meets a Project, it asks `POST /management/v1/projects/{id}/git-token` when it holds no token for that git host, and `PUT /management/v1/projects/{id}/git-access` when it does. It keeps one token per host in memory. The person's credential store is never asked about a Cloud host, and every other host keeps the person's own helpers. See `docs/cloud-git.md`.

- **New option `cloud.gitUrl`** and environment variable `ELEK_IO_CLOUD_GIT_URL`, with the same precedence as `cloud.url`. They name the git hosts' URL pattern. Unset, it is derived from `cloud.url`: `https://api.<zone>` gives `https://*.git.<zone>`. `core.options.cloud.gitUrl` holds the pattern in use, or `null` when `cloud.url` carries no `api.` label, and Core then installs no helper and logs a warning.
- **A refused git token is asked for again once.** Core drops it and runs the command once more. A second refusal throws `Unauthorized`.
- **Signed out**, a git command against a Cloud host throws `Unauthorized`, unless `ELEK_IO_REMOTE_ACCESS_TOKEN` is set, which then reaches Cloud's hosts too.
- **A failed call to elek.io Cloud is the git command's error**: `NotFound` for a Project the session cannot see, `RateLimited` until `Retry-After` passes, and `PreconditionFailed` when elek.io Cloud or the git host is unreachable, so `provision()` keeps its offline fallback.
- **One session per process.** Each `git-token` replaces the session's older tokens on that host, so two processes or two Cores sharing a session revoke each other's.
- **Inside Electron**, Core's helper runs the app's binary with `ELECTRON_RUN_AS_NODE=1`, so keep Electron's `RunAsNode` fuse on.
- Core listens on a random loopback port for its helper, opened by the first git command and closed by `dispose()`.

**`ELEK_IO_REMOTE_ACCESS_TOKEN` goes through the same helper instead of askpass.** A refused token now fails a Git LFS transfer with `Unauthorized` instead of retrying it forever. The token no longer reaches git's environment, and it works inside Electron.

**git never runs an askpass program.** Core sets `GIT_ASKPASS` empty for every git command, so a desktop's `SSH_ASKPASS` or a configured `core.askPass` no longer opens a dialog for a remote without a credential. The command throws `Unauthorized` instead.

**New exports** `cloudGitTokenResponseSchema` and `cloudGitAccessResponseSchema`, the two answers above.
