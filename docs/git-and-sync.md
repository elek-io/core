# Git & Synchronization

Every elek.io Project is a git repository, and Core drives git directly for every change. This document covers the branch model, how commits are authored, and how to synchronize a Project with a remote.

For the data model, see [`concepts.md`](./concepts.md). For how history is read, see [`usage.md`](./usage.md#reading-from-history).

## The git backend

Core runs git through [dugite](https://github.com/desktop/dugite) (the git bindings used by GitHub Desktop), declared as a peer dependency. All git commands for a Project are serialized through an internal queue, so operations never run concurrently against the same repository.

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
const { local, current } = await core.projects.branches.list({
  id: project.id,
});
// local -> ['production', 'work']

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

`synchronize()` pulls then pushes the current branch. That is `work` in day to day use. The `production` branch and the Release tags are published by `core.releases` instead, see below.

```typescript
await core.projects.synchronize({ id: project.id });
```

Because `pull.rebase` is set, local commits are replayed on top of the fetched remote commits. After pulling, Core fetches the full LFS history so every Asset stays available offline, then pushes (the LFS objects are uploaded first, see [Git LFS](#git-lfs)). Note that `synchronize()` does not pre-check for a remote or for a clean working tree - if there is no `origin`, no upstream, or a conflicting change, the underlying git command fails and surfaces as a `CoreError` of type `Internal` carrying git's own message. Commit or discard working-tree changes before synchronizing.

## Cloning an existing Project

`clone()` pulls a Project down from a URL into a temporary location, reads its `project.json`, and moves it into place. If a Project with the same id already exists locally, it throws `Conflict`.

```typescript
const project = await core.projects.clone({
  url: 'https://github.com/acme/website-content.git',
});
```

After cloning, Core fetches the whole LFS history into the local store and materializes the working-tree binaries, so all Assets (including older versions) are available offline. See [Git LFS](#git-lfs).

## Provisioning a Project for builds

`ensureFromRemote()` makes sure a Project is present in the data directory at a given content state, provisioning it from the remote when needed. It is the engine behind CI builds and is meant to run on a read-only Core, which clones and fetches without a User being set.

```typescript
const project = await core.projects.ensureFromRemote({
  id: '<project-id>',
  url: 'https://github.com/acme/website-content.git',
  ref: 'production', // 'production' | 'work' | a Release version - default 'production'
});
```

Three cases, decided by a provisioning marker file inside the Project directory:

- **Missing**: the Project is cloned in build mode - shallow, single ref, LFS objects of the checked-out ref only - and the marker is written.
- **Present with the marker**: the copy is fetched and hard-reset to the ref, so it always matches the remote.
- **Present without the marker**: the copy is managed by another application (for example the Desktop app) and is left untouched.

A `ref` naming a Release version checks out that Release's tag with a detached HEAD. An unknown version throws `NotFound` listing the available versions. Provisioning `production` from a remote that has no `production` branch throws `PreconditionFailed`, because no Release has been published yet.

Private remotes authenticate through the `ELEK_IO_TOKEN` environment variable, see [`usage.md`](./usage.md#environment-variables). The token is passed to git per invocation and never written into a URL or the repository config.

## Git LFS

Asset binaries are tracked with [Git LFS](https://git-lfs.com). It is always on - there is no per-Project toggle. git-lfs ships with dugite, so there is no extra dependency to install.

**What gets configured.** At `create()` Core writes a `.gitattributes` that tracks `lfs/**`, then runs `git lfs install --local` so the clean filter turns every binary added under `lfs/` into a small pointer. The pointer is committed to git history, the actual bytes go to the local LFS store (`.git/lfs/objects`). The working-tree file stays the real binary, so reading an Asset returns its content directly.

**Offline-first guarantee.** For full clones, Core keeps every LFS object for the whole history present locally, so reading any Asset (current or historical) never needs the network. A build-mode clone made by `ensureFromRemote()` intentionally opts out and only fetches the objects of the checked-out ref:

- Locally created Projects already have their objects (the clean filter writes them on commit).
- On `clone()`, Core runs `git lfs fetch --all` then `git lfs checkout` to pull every object across all refs and materialize the working tree.
- On `synchronize()`, Core runs `git lfs fetch --all` after the pull to complete any newly pulled history.

**Pushing.** `push()` (used by `synchronize()`) uploads the LFS objects in an explicit `git lfs push` step first, then pushes the refs. If the remote does not support Git LFS, has it disabled, or its LFS endpoint is unreachable, the upload fails and Core throws a `CoreError` of type `PreconditionFailed` naming the remote. Core tells this apart from a plain network or auth outage by probing the remote with `git ls-remote` - if git transport works but the LFS upload does not, it is an LFS endpoint problem. Choose a Git provider with LFS enabled.

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

When a remote `origin` is set, `core.releases` pushes at creation time: a full Release pushes `production` and its tag, a preview Release pushes its tag. Upgrade tags are not pushed. See [`releases.md`](./releases.md).

## Errors during git operations

| Error type                 | When                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Unauthorized` (401)       | A commit (or `init` / `clone` config) is attempted with no User set. In read-only mode, cloning needs no User, see [`usage.md`](./usage.md#options). |
| `PreconditionFailed` (412) | `getChanges()` or a guarded `delete()` runs without a remote `origin`, or a push fails because the remote does not support Git LFS. |
| `Conflict` (409)           | `clone()` targets an already-present Project, or a guarded `delete()` has unpushed commits.                                         |
| `Internal` (500)           | The underlying git command exits non-zero (no upstream, merge conflict, network, ...).                                              |

See [`error-handling.md`](./error-handling.md) for the full error model.

## See Also

- [`usage.md`](./usage.md) - setting the User, creating and reading content
- [`releases.md`](./releases.md) - promoting `work` to `production` as tagged, versioned snapshots- [`concepts.md`](./concepts.md) - Projects, Releases and the rest of the data model
- [`error-handling.md`](./error-handling.md) - `CoreError` types and patterns
