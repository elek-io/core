# Toolchain

What Core builds, tests, lints, formats and type checks with, and why each tool was picked
individually rather than taken as a bundle. Evaluated July 2026.

| Job        | Tool                         | Notes                                                                   |
| ---------- | ---------------------------- | ----------------------------------------------------------------------- |
| Build      | `tsdown` (rolldown, oxc)     | Four entry points, see [`peer-dependencies.md`](./peer-dependencies.md) |
| Test       | `vitest`                     | Real Projects and real git, see [`testing.md`](./testing.md)            |
| Lint       | `oxlint` + `oxlint-tsgolint` | Type aware, see [`linting.md`](./linting.md)                            |
| Format     | `prettier`                   | Also formats the 56 markdown docs and the JSON and YAML                 |
| Type check | `tsc --noEmit`               | typescript 6.x, `include: ["src"]`                                      |

Four of the five are already VoidZero projects. That happened one decision at a time, not by
adopting a bundle, and the sections below record why that stays the pattern.

## Why not Vite+

[Vite+](https://viteplus.dev) is the unified toolchain around the same tools. It wraps Vite,
Vitest, Oxlint, Oxfmt, Rolldown and tsdown behind a `vp` command, and adds task caching, monorepo
workspace execution, and its own dependency and runtime management.

Cost is not the question. Vite+ is MIT licensed and free. VoidZero
[dropped the planned paid tier](https://voidzero.dev/posts/announcing-vite-plus) in October 2025 and
has since joined Cloudflare. The reasons below are all technical.

### It would move the toolchain backwards and take the pins

`vite-plus` depends on its tools with exact pins, not ranges. As of 0.2.6:

| Tool              | Pinned by vite-plus | Available standalone |
| ----------------- | ------------------- | -------------------- |
| `oxlint`          | `=1.75.0`           | 1.76.0               |
| `oxfmt`           | `=0.60.0`           | 0.61.0               |
| `vitest`          | `4.1.10`            | 4.1.10               |
| `oxlint-tsgolint` | `=7.0.2001`         | 7.0.2001             |

Adopting it today downgrades oxlint. More importantly it hands the upgrade cadence of the whole
toolchain to vite-plus releases. Core pins every dependency exactly and records why each range was
chosen, which is the point of [`peer-dependencies.md`](./peer-dependencies.md). Putting a wrapper
between Core and those versions gives that up for nothing.

### It wants the package manager and the Node runtime

Vite+ manages the global Node runtime and the package manager unless you run `vp env off`, which is
opting out of most of what it does. Core's setup in that area is load bearing:

- [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) sets `allowBuilds`, where `dugite: true` is not
  optional. Its postinstall downloads the embedded git executable, and without it every git
  operation fails at runtime. `esbuild` and `sharp` are switched off there just as deliberately.
- `packageManager` pins pnpm, and `.node-version` pins Node 24, which CI consumes through
  `node-version-file` so it runs the version a contributor runs.

An auto-managed runtime also works against the rule that CI should reflect a real user's machine
rather than a tuned environment.

### The headline features do not apply

Task caching across workspaces and workspace-aware execution are the main wins, and Core is a single
package with no workspaces. Caching the test run would be unsound anyway: the suite creates real git
repositories on disk, so its result is not a pure function of the source tree.

Core is also not a web app. There is no dev server, no HMR, no browser bundle and no deploy target,
so `vp dev`, `vp preview` and the app side of `vp build` have nothing to act on. The build is four
library entry points, and it depends on tsdown being a _peer_ so tsdown externalizes itself and stays
out of `dist/cli`. That arrangement is verified and easy to break, so it is not worth routing through
another layer.

For dependency work, `pnpm outdated`, `pnpm dedupe` and `pnpm why` already cover what `vp outdated`,
`vp dedupe` and `vp why` would.

### Verdict

No. Adopting Vite+ would regress a tool version, surrender pin control, and wrap a pnpm
configuration that has to keep working, in exchange for monorepo and application features Core has no
use for. The individual tools are the right unit of adoption, and Core already takes them that way.
This is worth re-checking if Core ever becomes a workspace with the Desktop or Cloud packages beside
it, because that is the shape Vite+ is built for.

## Evaluated and deferred

Two swaps were measured and turned down. Both are close enough to be worth revisiting.

### oxfmt instead of prettier

[oxfmt](https://oxc.rs/docs/guide/usage/formatter) is the oxc formatter. It handles the file types
Core needs, `.ts`, `.md`, `.yml` and `.json`, which matters because `docs/` ships inside the package
and is 56 markdown files. It reads `.prettierignore` and has a `--migrate=prettier` command that
converts [`.prettierrc`](../.prettierrc) directly.

On defaults it wanted to rewrite 202 files. After `--migrate=prettier` that fell to 6. Those 6 are
the catch: they are exactly the files prettier 3.9 reformatted when it changed how union types wrap,
and oxfmt still emits the old shape.

```diff
 export type EntryReferenceIssue =
-  EntryReferenceNotFoundIssue | AssetMimeMismatchIssue;   // prettier 3.9
+  | EntryReferenceNotFoundIssue                            // oxfmt 0.61.0
+  | AssetMimeMismatchIssue;
```

So it is one prettier minor behind, at version 0.61.0, before 1.0. Stable output is the entire value
of a formatter, and a pre-1.0 one means repo-wide churn every time it converges or diverges.
Formatting is also not slow enough to be worth risk. Re-check at 1.0, and specifically re-run the
`--migrate=prettier` measurement above.

### oxlint `--type-check` instead of `tsc --noEmit`

oxlint can report TypeScript compiler diagnostics alongside lint results, through the same tsgolint
binary the type-aware rules use. The output matches `tsc` including the error codes:

```
tsc:    src/util/probe.ts(2,9): error TS2322: Type 'number' is not assignable to type 'string'.
oxlint: src/util/probe.ts:2:9: error typescript(TS2322): Type 'number' is not assignable to type 'string'.
```

Coverage matches too, because [`tsconfig.json`](../tsconfig.json) is `include: ["src"]` and oxlint's
`ignorePatterns` only exclude paths outside `src`. It is faster, and it folds two steps into one:

| Command                                       | Time |
| --------------------------------------------- | ---- |
| `tsc --noEmit`                                | 6.4s |
| `oxlint` (lint only, what `pnpm lint` runs)   | 2.4s |
| `oxlint --type-check` (lint plus diagnostics) | 2.8s |

That is roughly 8.8s of `lint` plus `check-types` down to 2.8s. It was still turned down, because
oxlint's own configuration schema describes the option as "Enable **experimental** type checking".
Core publishes `.d.ts` files, so type correctness is not the place to depend on a flag its authors
label experimental. `tsc` stays the authority. Re-check when the experimental label is dropped, since
this is the more attractive of the two.
