# Linting

Core lints with [oxlint](https://oxc.rs/docs/guide/usage/linter). It replaced eslint plus
typescript-eslint in July 2026. This doc records what the rule set is, why it is shaped that way
and how to re-check it.

The config is [`.oxlintrc.json`](../.oxlintrc.json). `pnpm lint` runs `oxlint` with no arguments.

## Why oxlint

Two reasons, one practical and one structural.

The practical one is that typescript-eslint pins its typescript peer to `>=4.8.4 <6.1.0`. It does
not merely warn on a newer typescript, it breaks at runtime: `@typescript-eslint/typescript-estree`
reads `ts.Extension.Cjs`, which typescript 7 removed, so loading the eslint config throws
`Cannot read properties of undefined`. That capped the typescript devDependency below 7 for as long
as eslint stayed.

The structural one is that Core already builds on oxc. `tsdown` bundles with rolldown, which is
oxc's bundler, so the parser and resolver oxlint uses are the ones the build already depends on.

## The rule set

`.oxlintrc.json` has three layers.

**Parity.** The explicit `rules` block reproduces every rule the old eslint config enabled. That was
`typescript-eslint`'s `recommendedTypeChecked` preset plus `consistent-type-imports` and a
configured `no-unused-vars`, 48 active rules in total. All 48 have an oxlint equivalent, so the
migration lost nothing. The block is written out rather than pulled from a preset so a future
oxlint default change cannot silently drop one.

**Categories.** `correctness` and `perf` are enabled on top. These are oxlint's own rules, which
eslint had no equivalent for, and they found real cleanups (redundant spreads, an array used as a
lookup table that should have been a Set).

**Additions.** A few rules from the `suspicious` category that catch bug classes rather than style:
`no-shadow`, `no-array-sort`, `no-array-reverse`, `no-unnecessary-type-parameters` and
`no-unnecessary-template-expression`.

### What is deliberately off

`no-await-in-loop` is off. Core awaits inside loops on purpose, because git operations against one
Project have to run in sequence. The rule flagged 85 sites, all of them correct as written.

Three categories are not enabled. The counts below are what they flagged when the swap was made,
and they are recorded so the trade-off is visible rather than re-measured each time:

| Category      | Flagged | Why not                                        |
| ------------- | ------- | ---------------------------------------------- |
| `suspicious`  | 195     | Mostly good, but see the two rules below       |
| `restriction` | 583     | Opinionated bans, not correctness              |
| `pedantic`    | 1478    | API preference rules, would bury real findings |
| `style`       | 8544    | Formatting, which is prettier's job            |

Two rules inside `suspicious` are worth naming, because they are the reason the whole category is
off rather than on:

- `no-unsafe-type-assertion` (65 sites) enforces the "avoid type casts" convention in
  [`AGENTS.md`](../AGENTS.md), which nothing checks today. Turning it on is a real tightening and a
  real cleanup, so it is a deliberate follow-up rather than something to enable in passing.
- `no-underscore-dangle` (23 sites) contradicts the `^_` ignore pattern configured on
  `no-unused-vars`, so it would have to stay off even if the category went on.

## Type-aware linting

Type-aware rules run through [`oxlint-tsgolint`](https://github.com/oxc-project/tsgolint) and are
switched on by `options.typeAware` in the config, so plain `oxlint` runs them and no CLI flag is
needed. tsgolint implements 59 of typescript-eslint's 61 type-aware rules. Neither missing rule is
one Core used.

**tsgolint does not read the `typescript` package.** It is typescript-go compiled to a Go binary and
ships its own platform builds, so the `typescript` devDependency version is irrelevant to linting.
The oxlint docs say type-aware linting "requires TypeScript 7.0 or newer", which describes what
tsgolint is built from, not a dependency it resolves. This was verified by running the full
type-aware lint against `typescript@6.0.3`, which passes, and by probing a file with a floating
promise and an `any` member access to confirm the type-aware rules genuinely fire.

The practical consequence is that upgrading the `typescript` devDependency and changing the linter
are independent decisions. Do not couple them.

tsgolint ships binaries for linux, darwin and win32 on x64 and arm64. There is no musl build, so
type-aware linting does not run inside an Alpine container. Every platform in the CI matrix is
covered.

## eslint-disable comments still work

oxlint reads `eslint-disable` and `eslint-disable-next-line` comments, including ones written
against `@typescript-eslint/`-prefixed rule names. The existing suppressions in
[`src/index.cli.test.ts`](../src/index.cli.test.ts),
[`src/api/lib/types.ts`](../src/api/lib/types.ts) and
[`src/service/uniqueFieldEnforcement.test.ts`](../src/service/uniqueFieldEnforcement.test.ts) were
left as they are. They are load bearing, not dead comments: stripping the four file level disables
from `index.cli.test.ts` surfaces 37 errors.

## How to re-check

```bash
pnpm lint          # must exit 0
pnpm check-types   # tsc is a separate check, oxlint does not replace it
```

To see what a category would cost before enabling it, copy the config, set the category and count:

```bash
node -e "const c=require('./.oxlintrc.json');c.categories.pedantic='error';
  require('fs').writeFileSync('/tmp/try.json',JSON.stringify(c))"
npx oxlint -c /tmp/try.json | grep -cE '^src/.*: (error|warning)'
```

`oxlint --fix` applies the autofixable subset. Run `pnpm format` afterwards, because some fixes
(the boolean literal comparison rules in particular) leave spacing prettier then normalizes.
