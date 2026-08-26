# Git and synchronization

Every elek.io Project is a git repository, and Core drives git directly for every change. This document covers the branch model, how commits are authored, and how to synchronize a Project with a remote.

For the data model, see [`concepts.md`](./concepts.md). For how history is read, see [`usage.md`](./usage.md#reading-from-history).

## The git backend

Core runs git through [dugite](https://github.com/desktop/dugite) (the git bindings used by GitHub Desktop), declared as a peer dependency. All git commands for a Project are serialized through an internal queue, so two operations never overlap on the same repository.

Two levels of API are available:

- **`core.projects`** - the high-level interface (`clone`, `synchronize`, `getChanges`, `setRemoteOriginUrl`, `branches.*`, `delete`, `history`). Use this in normal application code.
- **`core.git`** - the lower-level `GitService` (`add`, `commit`, `status`, `branches.*`, `remotes.*`, `tags.*`, `getFileContentAtCommit`, ...). An escape hatch for advanced use.

## The branch model

A Project uses exactly two branches, defined by `projectBranchSchema` (`src/schema/projectSchema.ts`):

- **`production`** - the stable, released state of the content.
- **`work`** - where all editing happens.

When `core.projects.create()` runs, it initializes the repository with `production` as the initial branch, makes the first commit there, then creates and switches to `work`. After creation you are on `work`, and every subsequent content change is committed there.

`work` is promoted to `production` through **Releases** (tagged snapshots managed by `core.releases`). Day-to-day create / update / delete operations never touch `production` directly.

```typescript
const { local, remote } = await core.projects.branches.list({
  id: project.id,
});
// local  -> ['production', 'work']
// remote -> ['origin/production', 'origin/work'], empty without an origin

const branch = await core.projects.branches.current({ id: project.id });
// branch -> 'work'

await core.projects.branches.switch({ id: project.id, branch: 'production' });
```

## Commits and the User signature

Every create, update and delete commits to git, and git needs an author. Core takes the author from the configured User (see [`usage.md`](./usage.md#setting-the-user-required-before-writing)). Committing with no User set throws a `CoreError` of type `Unauthorized`.

The User's `name` and `email` are written into the repository's local git config on `init` and `clone`, along with two settings Core relies on:

- `push.autoSetupRemote = true` - new branches get an upstream automatically on first push.
- `pull.rebase = true` - `pull` rebases local commits rather than creating merge commits.

Commit messages are structured: a human-readable subject line followed by git trailers that record what changed.

```
Create project 550e8400-e29b-41d4-a716-446655440000

Method: create
Object-Type: project
Object-Id: 550e8400-e29b-41d4-a716-446655440000
```

For Entry commits a `Collection-Id` trailer is added. These trailers are what `history()` and the tag readers parse back out.

## Connecting a remote

A freshly created Project is local-only. Point it at a remote with `setRemoteOriginUrl` - it adds the `origin` remote if absent, or updates the URL if it already exists. The remote can be any git provider (GitHub, GitLab, Bitbucket, a bare repo on disk).

```typescript
await core.projects.setRemoteOriginUrl({
  id: project.id,
  url: 'https://github.com/acme/website-content.git',
});
```

## Inspecting changes against the remote

`getChanges()` requires an `origin` (throws `PreconditionFailed` if none is set). It fetches, then returns the commits the local branch is `behind` and `ahead` of its remote counterpart.

```typescript
const { ahead, behind } = await core.projects.getChanges({ id: project.id });
// ahead  -> local commits not yet pushed
// behind -> remote commits not yet pulled
```

## Synchronizing

`synchronize()` integrates `origin` into the current branch, then pushes it. That is `work` in day to day use. The `production` branch and the Release tags are published by `core.releases` instead, see below.

```typescript
await core.projects.synchronize({ id: project.id });
```

One call, four steps, and nothing reaches the remote until the last:

1. **Refuse a dirty working tree** with `PreconditionFailed`. A rebase against uncommitted changes fails and could cost you work, so commit or discard first.
2. **Fetch and rebase** onto `origin/<branch>` rather than pulling, then top up the LFS objects of every ref so switching branches works offline.
3. **Scan the integrated tree** for dangling references, throwing `Conflict` if it finds any. The integrated commits stay local, so you can repair them through Core's own update or delete and synchronize again.
4. **Push**, uploading the LFS objects first, see [Git LFS](#git-lfs).

A remote that advanced between the fetch and the push rejects the push as non-fast-forward. Core answers that by re-integrating and trying again, up to five attempts before the `PreconditionFailed` reaches you.

There is still no pre-check for a remote. Without an `origin` or an upstream the underlying git command fails and surfaces as `Internal` carrying git's own message.

## Cloning an existing Project

`clone()` pulls a Project down from a URL into a temporary location, reads its `project.json`, and moves it into place. If a Project with the same id already exists locally, it throws `Conflict`. Cloning creates a working copy for editing. To consume content in a build instead, see [Provisioning a copy for builds](#provisioning-a-copy-for-builds).

```typescript
const project = await core.projects.clone({
  url: 'https://github.com/acme/website-content.git',
});
```

After cloning, Core fetches the whole LFS history into the local store and materializes the working-tree binaries, so all Assets (including older versions) are available offline. See [Git LFS](#git-lfs).

## Provisioning a copy for builds

`provision()` ensures a provisioned copy of a Project is present in the data directory at a given content state, provisioning it from the remote when needed. It is the engine behind CI builds and is meant to run on a read-only Core, which clones and fetches without a User being set.

A local copy of a Project is one of two kinds. A **working copy** is created by `clone()` or `create()`, is managed by an application like the Desktop app, and is where editing happens. A **provisioned copy** is created by `provision()`, consumes content, and is disposable: every provision run hard-resets it to match the remote.

```typescript
const { project, source, warning } = await core.projects.provision({
  id: '<project-id>',
  url: 'https://github.com/acme/website-content.git',
  // A channel ('production' | 'preview' | 'draft') or an exact
  // Release version - default 'production'
  ref: 'production',
});
```

The channels resolve against the tags the remote advertises: `production` checks out the newest Release tag, `preview` the newest preview Release tag (both by semver, with a detached HEAD), and `draft` follows the `work` branch. An exact version checks out that Release's tag.

Three cases, decided by a provisioning marker file inside the Project directory:

- **Missing**: the Project is cloned in build mode - shallow, single ref, LFS objects of the checked-out ref only - and the marker is written.
- **Present with the marker**: the copy is fetched and hard-reset to the ref, so a reachable remote decides what it holds.
- **Present without the marker**: a working copy managed by another application (for example the Desktop app), left untouched.

An unknown version throws `NotFound` listing the available versions. Provisioning the `production` or `preview` channel of a Project that never published a Release or preview throws `PreconditionFailed` naming the fix.

The returned `source` states where the content came from, and a refresh keeps building when the remote cannot be reached:

- An exact version the copy already holds skips the network (`local-pin`).
- A failed fetch falls back to the copy on disk with a `warning` (`local-fallback`).
- A missing copy, an authentication failure and a pin the copy does not hold stay hard failures.

See [Building offline](./provisioning.md#building-offline).

**Provisioned copies are read-only for everyone.** Every `Project` carries a computed `isProvisioned` boolean, so applications like the Desktop app can recognize and label a provisioned copy. Without this guard, edits would be silently destroyed by the next provision run.

- Any operation that would mutate one, content create, update or delete, synchronizing, setting a remote, switching branches, releasing, upgrading, throws a `CoreError` of type `PreconditionFailed`, also on a writable Core.
- The git layer backstops callers that bypass the services. A direct `git.commit`, `git.tags.create` or `git.push` against a provisioned copy throws the same error.
- The escape hatch is `projects.delete()`, which removes a provisioned copy without any unpushed-changes check, because it is disposable by definition. After that the Project can be cloned as a working copy.

Private remotes authenticate through the `ELEK_IO_REMOTE_ACCESS_TOKEN` environment variable, see [`usage.md`](./usage.md#environment-variables). The token is passed to git per invocation and never written into a URL or the repository config.

It applies to HTTP(S) remotes only. SSH remotes authenticate through the ambient SSH setup instead, for example keys loaded into ssh-agent, and an SSH failure raises an `Unauthorized` error naming the SSH setup rather than the token.

## Git LFS

Asset binaries are tracked with [Git LFS](https://git-lfs.com). It is always on - there is no per-Project toggle. git-lfs ships with dugite, so there is no extra dependency to install.

**What gets configured.** At `create()` Core writes a `.gitattributes` that tracks `lfs/**`, then runs `git lfs install --local`:

- The clean filter turns every binary added under `lfs/` into a small pointer, and that pointer is committed to git history.
- The actual bytes go to the local LFS store (`.git/lfs/objects`).
- The working-tree file stays the real binary, so reading an Asset returns its content directly.

**Offline-first guarantee.** For full clones, Core keeps every LFS object for the whole history present locally, so reading any Asset (current or historical) never needs the network. A build-mode clone made by `provision()` intentionally opts out and only fetches the objects of the checked-out ref:

- Locally created Projects already have their objects (the clean filter writes them on commit).
- On `clone()`, Core runs `git lfs fetch --all` then `git lfs checkout` to pull every object across all refs and materialize the working tree.
- On `synchronize()`, Core runs `git lfs fetch --all` after the pull to complete any newly pulled history.

**Pushing.** `push()` (used by `synchronize()`) uploads the LFS objects in an explicit `git lfs push` step first, then pushes the refs.

If the remote does not support Git LFS, has it disabled, or its LFS endpoint is unreachable, the upload fails and Core throws a `CoreError` of type `PreconditionFailed` naming the remote.

Core tells that apart from a plain network or auth outage by probing the remote with `git ls-remote`. If git transport works but the LFS upload does not, it is an LFS endpoint problem, so choose a Git provider with LFS enabled.

## Deleting safely

`delete()` removes the entire Project folder, including its history - so by default it guards against losing unsynchronized work:

- No `origin` and `force !== true` → throws `PreconditionFailed` (the Project exists only locally).
- Has `origin`, `force !== true`, and local commits are ahead of the remote → throws `Conflict` (unpushed changes).
- `force: true` skips both checks and deletes unconditionally.

```typescript
await core.projects.delete({ id: project.id }); // guarded
await core.projects.delete({ id: project.id, force: true }); // unconditional
```

## Tags

Releases, preview releases and Core upgrades are recorded as annotated git tags via `GitTagService` (`core.git.tags`). The tag message encodes its kind through trailers:

- `Type: release` / `Type: preview` with a `Version:` trailer
- `Type: upgrade` with a `Core-Version:` trailer

This is how `core.releases` and the Project upgrade flow mark points in history.

A tag is named with a fresh UUID rather than with its version, so the version lives in the `Version:` trailer and nowhere else. Two Releases can never collide on a name, and a tag is addressed by that UUID in `read()` and `delete()`.

The trailers are the whole contract, which decides what Core can see:

- `list()`, `count()` and `read()` drop any tag whose `Type:` trailer is missing or is not one of the three, and log a warning naming what they saw.
- A `v1.2.3` tag pushed by hand, and any lightweight tag, is therefore invisible to Core. `count()` counts Core's own tags rather than the repository's.
- Tags come back newest first, sorted by the author date of the commit they point at rather than by when the tag was written, and `list()` returns all of them in one page.

When a remote `origin` is set, `core.releases` pushes at creation time: a full Release pushes `production` and its tag, a preview Release pushes its tag. Upgrade tags are not pushed. See [`releases.md`](./releases.md).

## Errors during git operations

| Error type | When |
| --- | --- |
| `Unauthorized` (401) | A commit (or `init` / `clone` config) is attempted with no User set, or the remote rejects the credentials on a push. In read-only mode, cloning needs no User, see [`usage.md`](./usage.md#options). |
| `PreconditionFailed` (412) | `getChanges()` or a guarded `delete()` runs without a remote `origin`, a write is attempted on a read-only Core or against a provisioned copy, a push is rejected as non-fast-forward, `synchronize()` meets a dirty working tree or a rebase conflict, or a push fails because the remote does not support Git LFS. |
| `Conflict` (409) | `clone()` targets an already-present Project, a guarded `delete()` has unpushed commits, or `synchronize()` would integrate dangling references. |
| `BadRequest` (400) | A `core.git.push()` combines the `all` and `refs` options, which are mutually exclusive. |
| `Internal` (500) | The underlying git command exits non-zero (no upstream, merge conflict, network, ...). |

The read-only and provisioned-copy pair is the one to expect first, because it guards `init`, `commit` and `push` alike, at the git layer as well as in the services.

See [`error-handling.md`](./error-handling.md) for the full error model.

## See also

- [`usage.md`](./usage.md) - setting the User, creating and reading content
- [`releases.md`](./releases.md) - promoting `work` to `production` as tagged, versioned snapshots- [`concepts.md`](./concepts.md) - Projects, Releases and the rest of the data model
- [`error-handling.md`](./error-handling.md) - `CoreError` types and patterns
