# Plans

Work that still has to happen. A plan is an idea written down before it vanishes, or a brief for work already scoped, and it may be captured on a branch that has nothing to do with its subject.

Plans are committed and reach `main`, so an idea survives until someone picks it up. Delete a plan once its work is implemented or dropped, folding anything durable into `docs/` or `contributing/` first.

## Open

- [`git-clone-progress.md`](./git-clone-progress.md) - report clone progress instead of asking git for it and discarding it
- [`destinations.md`](./destinations.md) - one mechanism that sends a Release to a website first and to third-party APIs later, through a contract and an editor-made mapping
- [`documentation-rule-gaps.md`](./documentation-rule-gaps.md) - three documentation checks that should have caught something and did not
- [`git-service-object-parameters.md`](./git-service-object-parameters.md) - give every public `GitService` method one props object, a breaking change
- [`gitignore-os-junk.md`](./gitignore-os-junk.md) - the non-dot OS files a generated Project `.gitignore` still misses
- [`git-lfs-auth-bound.md`](./git-lfs-auth-bound.md) - pin git-lfs 3.8.0's bound on credential retries in a test once dugite bundles it
- [`project-description-shape.md`](./project-description-shape.md) - whether a Project description becomes optional and translatable like a Collection's
- [`release-on-an-empty-remote.md`](./release-on-an-empty-remote.md) - a Release or preview made before the first push strands tags or lands `draft` alone
- [`reporting.md`](./reporting.md) - Core's half of in-app reporting, and the request shape elek.io Cloud should be built against
