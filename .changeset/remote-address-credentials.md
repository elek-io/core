---
'@elek-io/core': minor
---

**No message and no log line Core writes repeats the user or the password of a remote address.** An address can carry both, which git accepts and elek.io does not use as a way to authenticate. Every place that names an address now redacts it: cloning a Project that is already on the computer, provisioning a Project the remote does not hold, a Git LFS upload a remote would not take, a remote pointing at another git host than the one it belongs to, and the line the Astro integration writes before every provision. All but the last travel in a `CoreError` message, which is what an error screen shows and somebody pastes into a report, and every one of them also reaches a log file, Core's own or a hosted build's.

- Where a message names an address it writes `https://[redacted]@host/org/repo.git`. The host and the path stay, so the line still says which remote it was about.
- `clone()` leaves the address out instead. Its `Conflict` reads `Cannot clone Project "<id>": it already exists locally. Delete it before cloning it again.`, which no longer hands you back the URL you just passed in.
- An address counts as carrying a credential with a user alone, with a token alone and percent encoded. A password holding an `@` goes whole, where it used to keep everything after the first one: `https://nils:p@ssw0rd@host/repo.git` was written as `https://[redacted]@ssw0rd@host/repo.git`. The SSH shorthand `git@host:org/repo` keeps its user, which is part of the address there rather than a credential.

**`core.logger.mask()` masks a text with the rules a log tail runs over its records**, so an application that shows text Core wrote keeps no copy of them. It is the call for an error screen, a copied stack or a dialog. It needs no Project and no User, it reads the home directory of the running process, and it throws on no string.

```typescript
core.logger.mask('Cloning https://nils:ghp_x@github.com/org/repo.git failed');
// 'Cloning https://[redacted]@github.com/org/repo.git failed'
```

- The home directory becomes `~`. On Windows in either case and either separator spelling, and everywhere percent encoded as a `file://` address spells it, which is the spelling a renderer loaded from a file puts in its own stack frames.
- The user and the password of an address become `[redacted]`, an email address becomes `[email]` and a git signature on a command line becomes `[redacted]`.
- Call it where Core runs, which in a desktop application is the main process rather than a renderer.

**A log tail masks two more shapes**, both of them text git wrote rather than records Core authored: an email address a colon directly follows, as in `mara@autohaus-ebersfelde.de: Permission denied`, and the home directory percent encoded. The SSH shorthand stays, there the colon carries a path.

What none of this masks is a shape it cannot see: a token on its own, a name somebody typed, or the content of an Entry. Those are kept out where a record is written, which has not changed. See `docs/usage.md`.
