---
'@elek-io/core': minor
---

Core signs in to an elek.io account. `core.cloud.account` has `signUp()`, `signIn()`, `signOut()`, `read()`, `onTokenChange()` and `hasToken`, and every elek.io Cloud call that uses the session carries its token as a bearer token, reports included.

**Signing in.** `signIn({ email, password })` answers `{ token, account }`, keeps the token in memory and sets a `cloud` User with the account's id, name and email. The User keeps its language and its local API settings. A wrong address or password throws `Unauthorized`, and an address that is not verified yet throws `Conflict`, so a sign in form can tell the two apart.

**Signing up has two outcomes.** `signUp({ name, email, password })` answers `{ outcome: 'session', token, account }` and signs in the way `signIn()` does. Or it answers `{ outcome: 'verification' }` when the address has to be verified first, which carries no account, keeps no token and leaves the User as it was. A password has 12 to 128 characters.

**The token stays in memory.** Core never writes it into `user.json`, a log file or `core.options`. A host persists it and hands it back through the new `cloud.token` option, and a script through the new `ELEK_IO_CLOUD_TOKEN` environment variable. The option wins over the variable. `onTokenChange(listener)` tells the host every token Core keeps and drops, so its stored copy stays current. Signing in and signing up never send the token Core holds, so a mistyped password keeps it.

**Reading the account** answers the account of a live session and makes the User follow it, so a name or an address changed on the account reaches the next commit.

**When a session ends.** A 401 to any elek.io Cloud call that sends the token forgets it and throws `Unauthorized`. `read()` answers `null` and forgets the token when the session is not live. Either way the User stays `cloud`, and the host asks the person to sign in again.

**Signing out** sends the request, forgets the token and sets a `local` User that keeps the name and the email. When the request fails, Core still signs out on this machine, logs a warning and resolves.

**The committer follows the User.** Commits, merges, rebases, pulls and tags carry the current User as author, committer and tagger. A commit made after the User changed kept the committer from when the Project was created or cloned before.

**No identity in a Project's git config.** Core hands git the User through the environment of each command and no longer writes `user.name` and `user.email` into a Project's local git config. So `init` and `clone` need no User, and only a commit throws `Unauthorized` without one.

**A Project is changed through Core only.** Git run by hand, another git client or an editor writing a Project's files is not supported. Reading the files with any tool is safe.
