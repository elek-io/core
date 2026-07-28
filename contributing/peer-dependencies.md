# Peer dependencies

Core declares three peer dependencies, so the consumer supplies them and Core shares the
consumer's copy instead of bundling its own. This doc records why each version range was
chosen and how to re-check it when dependencies change.

| Peer     | Range                | Required | Used by                              |
| -------- | -------------------- | -------- | ------------------------------------ |
| `zod`    | `^4.3.6`             | yes      | every entry (schemas)                |
| `dugite` | `^3.0.0`             | yes      | the Node entry (git)                 |
| `astro`  | `^6.1.3 \|\| ^7.0.0` | no       | the `/astro` entry (content loaders) |

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
| `astro`             | `^4.3.6`        | the `/astro` entry's peer, measured against the current dev version 7.1.3 |

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

## astro (`^6.1.3 || ^7.0.0`, optional)

astro is an optional peer (`peerDependenciesMeta`), used only by the `/astro` entry. A consumer
using the Astro integration already provides it, and consumers of the Node or Browser entry never
install it. The entry uses `astro/loaders` (the Content Layer `Loader` type), `astro/astro-jsx` (the
`astroHTML.JSX.Element` type mdast rendering produces) and `astro/content/config` (for
`defineCollection`, see [`astro-entry.md`](./astro-entry.md)). It also depends on three of astro's
internals, all recorded there: the `__ASTRO_IMAGE_` marker, the resolved shape of `LoaderContext`,
and `renderTemplate` plus `addAttribute` from `astro/runtime/server/index.js`, which the mdast
defaults are built on. The last is the least fragile of the three, since it is the module every
compiled `.astro` file imports, but it is an internal path all the same. All three hold on 6 as well
as on 7: `astro/runtime/server/index.js` exports both functions in 6.1.3, `renderTemplate` returns
the same `RenderTemplateResult` and `addAttribute` still emits nothing for a nullish value, and a
site built against 6 renders the mdast defaults identically at page level and one component deep.

The major floor is 6. astro 6.0.0 added the `Loader.createSchema` method (returning
`{ schema, types }`) that `elekEntriesLoader` uses (`src/index.astro.ts`), and it switched the Loader's
schema typing from zod v3 to zod v4. Both are absent in every astro 5.x, so 5.x fails to type-check:
`createSchema does not exist in type 'Loader'`, plus a zod v3 vs v4 schema mismatch on the `schema`
field. `devDependencies` pins the latest 7.x for development, so the floor is spot-verified by
pinning rather than by a permanent CI matrix job. To re-verify, pin `astro` to a candidate version
and run `pnpm check-types` and `pnpm test`. The suite alone is not enough, it never renders a page,
so build and run a real site against the candidate as well.

### Why the patch floor is 6.1.3 and not 6.0.0

The Assets loader skips an Asset whose data has not changed, the same way astro's own `glob` loader
does, so a second sync writes nothing for it. Astro decides which images to emit from the imports its
loaders registered while running, and a store restored from disk starts with none of them. astro
6.1.3 made `writeAssetImports` rebuild that list from the restored entries, so the skip is free. On
6.0.0 through 6.1.2 it is not: the first `astro build` of a site emits its images, every build after
it writes an empty import map and fails with `LocalImageUsedWrongly`, naming the relative path the
loader stored. Deleting `.astro` buys exactly one more good build.

Core cannot close that gap itself. The escape astro's `glob` loader takes on its own skip path,
calling `store.addAssetImports` with what the entry already recorded, is missing from the public
`DataStore` type, so reaching for it would mean a cast and a fourth undocumented internal. Raising
the floor to the release where astro fixed it is the honest fix, and it costs consumers nothing: the
affected window is three weeks of March 2026 patches, superseded within the month.

`src/index.astro.assets.test.ts` guards the assumption from Core's side. It syncs a second time, when
every Asset is skipped, and asserts astro still holds the image import. It fails on 6.1.2 with the
empty map astro wrote, and passes from 6.1.3 on.

### Why a range of two majors and not `>=6.0.0`

`>=6.0.0` would allow astro 8, 9 and so on the moment they are published. The Content Layer `Loader`
API changes across astro majors (the `createSchema` method Core depends on did not exist before 6.0,
and the schema typing moved from zod v3 to v4), so a future major is likely to need Core changes and
re-verification. Naming the verified majors explicitly makes a consumer on the next one get a peer
warning that prompts that re-check, instead of silently claiming an untested major works. When a new
astro major is verified, widen the range to include it.

astro 7 was verified this way in July 2026 and the range widened to include it (the 6 floor moved to
6.1.3 afterwards, for the reason above).
It is a speed release: Rust compiler, a Rust markdown pipeline replacing remark and rehype, Vite 8 on
Rolldown, queued rendering. The content layer itself is untouched, `Loader.createSchema` and
`LoaderContext` (including `config: AstroConfig` and `DataEntry.filePath`) are unchanged from 6.4.8,
`astro/loaders`, `astro/jsx-runtime` and `astro/content/config` all exist with the same shapes,
the `__ASTRO_IMAGE_` marker is unchanged, and programmatic `sync` is unchanged. The zod dependency stays `^4.3.6`, so the
zod floor does not move. New in v7 is an optional `@astrojs/markdown-remark` peer for the opt-in
remark pipeline, which adds no install friction. Engines require Node >= 22.12, and CI runs the
version in `.node-version`. There is still no integration API for injecting content collections, so
nothing in v7 changes how the `/astro` entry is designed.

Note that astro depends on zod through a caret range, so its zod requirement feeds the zod floor above
(astro is currently the binding constraint at `^4.3.6`). Bumping astro can raise the zod floor, so
re-check the zod single-copy invariant whenever you bump astro.

The coupling is also a runtime one. Astro validates content collection schemas with zod 4, and the
schemas Core's loaders supply are consumed by astro's content layer. A second physical zod copy
therefore breaks the Astro integration at runtime, not only in type-checking. Astro 6 also removed
the `z` export from `astro:content`. Consumers author collection schemas with `astro/zod` or with the
`z` Core re-exports, and with the single-copy invariant intact both resolve to the same physical zod.

### The dev pin and pnpm's release-age cooldown

pnpm 11 holds freshly published versions back for a cooldown period. `pnpm add -D astro@<version>`
on a release younger than that writes a `minimumReleaseAgeExclude` entry into `pnpm-workspace.yaml`
to bypass it. Do not commit that entry: it is a permanent opt-out of a supply chain protection for a
condition that lasts a day, and it turns into stale cruft at the next bump. Pin the newest version
that is past the cooldown instead, and pick the newer one up with the next routine bump.
