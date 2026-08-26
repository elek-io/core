# Git credentials

Core authenticates git operations against private HTTPS remotes through an askpass helper, driven by the `ELEK_IO_REMOTE_ACCESS_TOKEN` environment variable. The observable behavior is documented in [`docs/usage.md`](../docs/usage.md#environment-variables).

This doc records why the askpass approach was chosen over its alternatives, and which invariants to keep when touching the credential path in `GitService`.

## How it works

The token flows from the environment into a git prompt answer in five steps:

1. **Construction.** `GitService` reads `ELEK_IO_REMOTE_ACCESS_TOKEN` and `ELEK_IO_REMOTE_ACCESS_TOKEN_USER` once from the environment (default token user `x-access-token`). Nothing is read at import time.
2. **Per invocation.** Every git command funnels through the private `git()` method and its queue. Inside the queue `credentialEnv()` builds the environment for this one invocation. Without a token that is only `GIT_TERMINAL_PROMPT=0`.
3. **Helper scripts.** With a token, `writeAskpassScript()` writes `askpass.cjs` plus a platform trampoline into the tmp directory, `askpass.sh` on POSIX and `askpass.bat` on Windows, both invoking `process.execPath`. They are rewritten on every call, which is cheap, serialized by the queue and self-healing if the tmp directory is emptied.
4. **Environment.** `buildCredentialEnv()` returns `GIT_ASKPASS` pointing at the trampoline, the token and token user in `ELEK_IO_ASKPASS_TOKEN` and `ELEK_IO_ASKPASS_TOKEN_USER`, and the `GIT_CONFIG_*` entry that resets `credential.helper`. The result is merged into the dugite exec options, caller-provided env wins.
5. **Prompt time.** When git needs credentials, it runs the trampoline with the prompt text as argument. The Node script answers a prompt starting with `Username` with the token user and every other prompt with the token, read from its environment and written to stdout.

Because git-lfs commands go through the same `git()` method, LFS fetches, pushes and smudges authenticate identically. On a non-zero exit, stderr passes through `classifyAuthError()`, which maps authentication failures to a `CoreError` of type `Unauthorized` naming the environment variable to set or check.

## Why askpass

Git has no credentials API. Its own documentation ([gitcredentials](https://git-scm.com/docs/gitcredentials)) defines exactly two integration points for supplying credentials programmatically, credential helpers and the askpass interface (`GIT_ASKPASS`).

Both mean the same thing, git runs a program you point it at. Writing a small helper and setting `GIT_ASKPASS` is therefore the documented standard, not a workaround.

It is also the established pattern in Core's ecosystem:

- VS Code's built-in git extension sets `GIT_ASKPASS` to a bundled shell script ([`askpass.sh`](https://github.com/microsoft/vscode/blob/main/extensions/git/src/askpass.sh)) that execs a Node script ([`askpass-main.ts`](https://github.com/microsoft/vscode/blob/main/extensions/git/src/askpass-main.ts)) to answer the prompts.
- GitHub Desktop routes prompts through its vendored [`desktop-trampoline`](https://github.com/desktop/desktop/tree/development/vendor/desktop-trampoline) executable, as a credential helper for HTTPS and as askpass for SSH (the [askpass handler](https://github.com/desktop/desktop/blob/development/app/src/lib/trampoline/trampoline-askpass-handler.ts)).
- dugite itself ships no credential support and only passes `env` through, expecting exactly this pattern.

Desktop moved its HTTPS flow from askpass to the credential helper protocol because askpass cannot express "no credentials available". An empty askpass answer makes git authenticate with literal empty strings, while a silent credential helper makes git fail cleanly.

That ambiguity matters for an interactive app that must tell a cancelled prompt apart from a wrong password. Core never hits it, the askpass helper is only installed while a token exists, so askpass stays the simpler fit.

Desktop's wiring ([`trampoline-environment.ts`](https://github.com/desktop/desktop/blob/development/app/src/lib/trampoline/trampoline-environment.ts)) also confirms two Core decisions independently:

- It injects git config by environment variable instead of `-c` arguments, so that git-lfs filter processes inherit it.
- It resets the credential helper list with an empty entry before adding its own.

The mechanism covers HTTP(S) remotes. SSH remotes are supported too but authenticate through the ambient SSH setup outside of Core, like keys loaded into ssh-agent. `classifyAuthError` tells the two transports apart (including dugite's `SSHPermissionDenied` for the common `Permission denied (publickey)` case) and names the SSH setup instead of the token for SSH failures.

That SSH branch is deliberately narrow. dugite maps `SSHPermissionDenied` from git's generic `fatal: Could not read from remote repository.`, which git also prints for an unreachable host and for a repository that does not exist, so the classification also requires a permission signal in the output.

Without that narrowing every offline SSH remote would surface as `Unauthorized`, which is both misleading and, since `provision()` treats `Unauthorized` as unrecoverable, would cost SSH consumers the offline fallback.

## Alternatives considered

- **Inline credential helper**, a `credential.helper=!f() ...` one-liner injected via `GIT_CONFIG_*`. Would remove the helper files, but embeds a shell script in an env var and depends on cross-platform shell quoting. The askpass helper runs its logic in Node, the one runtime Core is guaranteed to have, and is unit-testable as a plain function.
- **`http.extraheader` with a basic auth header**, the `actions/checkout` approach. Puts the token on argv via `-c` where it is visible in the process list, or persists it into `.git/config`, which then needs explicit cleanup.
- **Token embedded in the remote URL**. Persists in `.git/config` and leaks into logs.
- **Pre-seeding `git credential-cache`**. Documented, but adds a daemon, a socket and a TTL lifecycle for no gain.
- **Third-party packages**. No maintained package for this exists. Libraries with real credential callbacks (isomorphic-git, nodegit) replace git itself, which would drop Git LFS and abandon dugite.

## Invariants

Preserve these properties when changing the credential path:

- The token travels by environment variable only. It never becomes part of an argument, a URL or the repository config, so it cannot leak into process listings, logs or caches.
- `credential.helper` is reset to an empty value via `GIT_CONFIG_*` while the token is set. Helpers outrank askpass in git's precedence order, so without the reset an ambient helper like the OS keychain would silently shadow the token. Without a token the reset is not applied, so ambient helpers keep working.
  - Desktop performs the same reset through `GIT_CONFIG_PARAMETERS` instead, because the blank `GIT_CONFIG_VALUE_*` entry triggered a Windows bug in Python based hook runners ([desktop/desktop#18945](https://github.com/desktop/desktop/issues/18945)). Core-managed repositories only run the shell hooks git-lfs installs, so the documented `GIT_CONFIG_*` form is safe here.
- `GIT_TERMINAL_PROMPT` is always `0`, with or without a token. A missing or wrong token fails the command with a typed `Unauthorized` error (`classifyAuthError`) instead of hanging it on a prompt.
- The helper scripts on disk contain no secret. They only read their environment, so the tmp directory never holds the token.

## Testing

The credential flow cannot be integration-tested, the suite's remotes are local bare repositories and git skips its credential machinery for local paths. See the limitation in [`testing.md`](./testing.md#limitation-git-credentials-cannot-be-integration-tested) for what the unit tests cover and what to verify manually.

## See also

- [`../docs/usage.md`](../docs/usage.md#environment-variables) - the environment variables a consumer sets
- [`error-handling-internals.md`](./error-handling-internals.md) - how a failed authentication becomes a typed error
- [`testing.md`](./testing.md#limitation-git-credentials-cannot-be-integration-tested) - why this path has no integration test
- [`peer-dependencies.md`](./peer-dependencies.md) - the dugite range the askpass helper runs against
