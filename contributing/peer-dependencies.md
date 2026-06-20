# Peer dependencies

Core declares three peer dependencies, so the consumer supplies them and Core shares the
consumer's copy instead of bundling its own. This doc records why each version range was
chosen and how to re-check it when dependencies change.

| Peer     | Range    | Required | Used by                              |
| -------- | -------- | -------- | ------------------------------------ |
| `zod`    | `^4.3.6` | yes      | every entry (schemas)                |
| `dugite` | `^3.0.0` | yes      | the Node entry (git)                 |
| `astro`  | `^6.0.0` | no       | the `/astro` entry (content loaders) |

The general rule for a floor: it is the lowest version whose API Core actually uses.
Verify a candidate by installing it and running the suite. `zod` carries an extra
constraint (a single physical copy), explained below.

## zod (`^4.3.6`, required)

### Why it is a peer, and the single-copy invariant

zod v4 brands every schema with its exact version at `_zod.version`. If two physical zod
copies end up in the tree, a schema built with one copy is not assignable to anything typed
against the other, even across two 4.x minors. Downstream this breaks type-checking hard.
The original symptom was `@elek-io/client` feeding Core schemas into `@hookform/resolvers`'
`zodResolver`, which failed with `TS2769` (`_zod.version.minor` incompatible) and `TS2719`
(two unrelated `Resolver` types).

Declaring `zod` as a peer makes the consumer supply the single shared copy, so Core and the
consumer always brand-match. The whole tree, Core plus the consumer plus their shared
transitive dependencies, must resolve to exactly one physical zod. Core also re-exports `z`
(from `src/schema/index.ts` and `src/index.astro.ts`) so consumers can author brand-matching
schemas without importing their own zod.

The automated guard is `src/zod-single-copy.test.ts`. It reads `pnpm-lock.yaml` and fails if
more than one zod version resolves. It runs as part of `pnpm test`.

### The floor is the maximum of every zod floor in the graph

The floor is not a free choice. It is the highest zod floor among everything in the tree that
depends on zod. Pick anything lower and that dependency pulls its own newer zod, which splits
the tree. As of this writing the contributors are:

| Source              | zod requirement | Notes                                                                     |
| ------------------- | --------------- | ------------------------------------------------------------------------- |
| Core's own schemas  | `>=4.1.0`       | `z.hash('sha1')` in `src/schema/gitSchema.ts` does not exist before 4.1.0 |
| `@hono/zod-openapi` | `^4.0.0`        | peer dependency                                                           |
| `@scalar/types`     | `^4.3.5`        | via `@scalar/hono-api-reference`, a runtime dependency                    |
| `astro`             | `^4.3.6`        | the `/astro` entry's peer, measured against the current dev version 6.4.8 |

The maximum is `4.3.6`, so the peer range is `^4.3.6`. `devDependencies` pins the latest 4.x
(`zod@4.4.3`) so Core develops against the newest patch, while the declared floor stays at the
lowest version the graph can share.

### The caret caveat: why `pnpm dedupe` is sometimes needed

`astro` and `@scalar/*` depend on zod through caret ranges (`^4.3.6`, `^4.3.5`). With pnpm's
default highest-version resolution these resolve up to the newest zod available. A fresh or
frozen install lands on a single copy, but a partial install (for example after bumping one
dependency) can leave the newest zod alongside the version Core pins, giving two copies. The
fix is `pnpm dedupe`, which collapses them back to one. The guard test fails until you do.

### When to re-check, and what to do if the floor rises

Re-check whenever you bump `zod`, `astro`, `@scalar/*`, `@hono/zod-openapi`, or add any
dependency that pulls zod. If a dependency now needs a higher zod than the current floor:

1. Raise `peerDependencies.zod` to the new floor.
2. Update the floor in the consumer docs (`README.md` and `docs/usage.md`).
3. Run `pnpm dedupe` and confirm the guard passes.
4. Add a changeset. Raising the floor is a breaking change for consumers pinned below it.

## dugite (`^3.0.0`, required)

dugite is the git bindings the Node entry runs every Project operation through (see
`src/service/GitService.ts`). It does not brand its types by version, so there is no
single-copy problem here. A range is still better than the old exact `3.2.2` pin, because an
exact peer forces every consumer onto one release and risks a peer conflict.

The floor is the functional `exec` API (`exec`, `IGitStringResult`, `parseError`, `GitError`),
which replaced the old `GitProcess` class in dugite 3.0.0. Nothing transitive pulls dugite, so
the floor is purely Core's own usage. Each dugite release ships an embedded git binary (the 3.x
line bundles git 2.47.x), so the test suite, which runs real git and Git LFS, is the real check.
`devDependencies` pins the latest 3.x for development, like the other peers.

To re-verify the floor, pin the dev version to it and run the suite:

```bash
pnpm add -D dugite@3.0.0   # the floor; restore to the latest 3.x afterwards
pnpm why dugite            # expect one version
pnpm check-types && pnpm build && pnpm test
```

## astro (`^6.0.0`, optional)

astro is an optional peer (`peerDependenciesMeta`), used only by the `/astro` entry. A consumer
using the Astro integration already provides it, and consumers of the Node or Browser entry never
install it. The entry uses `astro/loaders` (the Content Layer `Loader` type) and `astro/jsx-runtime`
(for rendering mdast to Astro JSX).

The floor is 6.0.0, verified two ways. astro 6.0.0 added the `Loader.createSchema` method (returning
`{ schema, types }`) that `elekEntries` uses (`src/index.astro.ts`), and it switched the Loader's
schema typing from zod v3 to zod v4. Both are absent in every astro 5.x, so 5.x fails to type-check:
`createSchema does not exist in type 'Loader'`, plus a zod v3 vs v4 schema mismatch on the `schema`
field. `devDependencies` pins the latest 6.x for development. To re-verify, pin `astro` to a candidate
version and run `pnpm check-types` and `pnpm test`.

### Why `^6.0.0` and not `>=6.0.0`

`^6.0.0` allows any astro 6.x but not a future astro 7. `>=6.0.0` would also allow astro 7, 8 and so
on the moment they are published. The Content Layer `Loader` API changes across astro majors (the
`createSchema` method Core depends on did not exist before 6.0, and the schema typing moved from zod v3
to v4), so a future major is likely to need Core changes and re-verification. Capping at `^6.0.0` makes
a consumer on astro 7 get a peer warning that prompts that re-check, instead of silently claiming an
untested major works. When a new astro major is verified, widen the range to include it.

Note that astro depends on zod through a caret range, so its zod requirement feeds the zod floor above
(astro is currently the binding constraint at `^4.3.6`). Bumping astro can raise the zod floor, so
re-check the zod single-copy invariant whenever you bump astro.
