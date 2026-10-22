# Long paths on Windows

Why every git command Core runs carries `core.longpaths`, and why the command line alone cannot deliver it. For what a consumer sees, read [`../docs/usage.md`](../docs/usage.md#environment-variables).

## What breaks

Windows resolves a path against 260 characters unless the program asks for more. Core stores an Entry about 137 characters below the data directory, so a data directory past roughly 120 characters puts a Project's own `.git/config` over the limit. git dies on it with `fatal: unable to access '<path>/.git/config': Filename too long`.

## Why the command line is too late

git's Windows build answers `are_long_paths_enabled()` out of the configuration set as far as it has been filled, and defaults to false until then, see [`compat/mingw.c`](https://github.com/git-for-windows/git/blob/main/compat/mingw.c). It fills that set scope by scope, in this order:

| Scope     | Comes from                                              |
| --------- | ------------------------------------------------------- |
| `system`  | `GIT_CONFIG_SYSTEM`, or the installation's own file     |
| `global`  | `GIT_CONFIG_GLOBAL`, or the XDG file and `~/.gitconfig` |
| `local`   | the repository's `.git/config`                          |
| `command` | `-c` and `GIT_CONFIG_PARAMETERS`                        |

A value only the command line carries is therefore in the set after git has opened the repository's config, which is the access that fails. A scope above `local` is the only one that arrives in time.

## What Core does

- `GIT_CONFIG_GLOBAL` points at a file Core writes, which sets `core.longpaths` in the global scope, read before the repository's own config.
- The file sits in the machine's temporary directory and not the data directory's, which is the one place it may not be. A deep data directory is what it exists for, and git has to open it before it knows long paths are on. Its name carries the content and the user, because `/tmp` is shared.
- That file includes the global configuration git would have read anyway, first, so a person's identity, credential helpers and URL rewrites still arrive. A `GIT_CONFIG_GLOBAL` the host process set replaces both default files, which is git's own rule.
- The command line keeps `-c core.longpaths=true`, so nothing in a repository turns the key off again.
- Both are applied where the command reaches the runner and never earlier, so `isMutatingGitCommand`, `recordsGitIdentity` and the logged command line see the caller's arguments alone.

## Invariants

- Nothing is written into a Project, so a clone, a read-only Core and a Project an earlier version created all get it.
- A person's own global configuration is included rather than replaced.
- A log line shows the caller's command line, never what git was handed.

## See also

- [`testing.md`](./testing.md#what-git-was-run-with) - how the suite reads back what git resolved, and the Windows-only cases
- [`git-credentials.md`](./git-credentials.md) - the rest of the environment every invocation gets
