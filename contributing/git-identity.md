# Git identity

Why a Project is changed through Core only, and who a commit, a merge and a tag are signed as. For what a consumer sees, read [`../docs/git-and-sync.md`](../docs/git-and-sync.md#change-a-project-only-through-core).

## Core is the only writer of a Project

A Project is changed through Core only. Git run by hand, another git client or an editor writing its files is unsupported, and Core configures a repository for nobody but itself.

Core makes its guarantees at its own writes, and a writer that skips Core breaks them in ways Core cannot detect afterwards:

- `log()` and every `history()` read only commits carrying Core's trailers.
- References, unique fields and field definitions are checked when Core writes, not when it reads.
- An upgrade migrates files from the shapes an earlier Core wrote.
- The caches are cleared whenever Core's own git commands change a working tree.

Supporting other writers would mean reading every commit and every file defensively. So nothing in a Project's git config exists for a person at a terminal. The identity was the one setting that did, and it is gone.

## The decision

The current User reaches git as `GIT_AUTHOR_*` and `GIT_COMMITTER_*` in the environment of every command that may write a commit or a tag. [`recordsGitIdentity`](../src/util/git.ts) decides which commands those are, and the runner in [`GitService`](../src/service/GitService.ts) applies it.

| Rejected | Why |
| --- | --- |
| `user.name` and `user.email` in the local config, written on `init` and `clone` | A copy of `user.json` nothing updated. After a sign in, commits carried the new author and the old committer |
| Rewriting the config whenever the User changes | It ties `UserService` to every Project, can fail halfway, and keeps a second copy in step for no reader |
| `--author`, or `-c user.name=` | It puts the identity on a command line, which is logged and has to be redacted |
| A flag each call opts in with | A command added later that forgets it signs with whatever git finds on the machine |

## Invariants

- **`user.json` is the only identity.** Nothing writes a second copy into a Project.
- **A changing command records the User unless it is named as anonymous.** Add a command to `ANONYMOUS_GIT_COMMANDS` only when it can never write a commit or a tag. A wrong entry signs commits with the machine's identity, or fails them in CI, which has none.
- **`commit()` refuses without a User before git runs.** Without that check git would fall back to the machine's identity instead of failing.
- **The User is read when the command is queued**, so a call is signed as the User it was made under.
- **`init` and `clone` need no User.** Only a commit does.

## See also

- [`../docs/git-and-sync.md`](../docs/git-and-sync.md#commits-and-the-user-signature) - the signature as a consumer sees it
- [`logging.md`](./logging.md#redacting-a-command-line) - the redaction that stays as a backstop
- [`git-credentials.md`](./git-credentials.md) - the credentials, which reach git through Core's own helper rather than a command line
