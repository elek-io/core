# Linting

Core lints with [oxlint](https://oxc.rs/docs/guide/usage/linter). It replaced eslint plus typescript-eslint in July 2026. This doc records what the rule set is, why it is shaped that way and how to re-check it.

The config is [`.oxlintrc.json`](../.oxlintrc.json). `pnpm lint` runs `oxlint` with no arguments.

## Why oxlint

Two reasons, one practical and one structural:

- **The practical one.** typescript-eslint pins its typescript peer to `>=4.8.4 <6.1.0`, and it does not merely warn on a newer typescript, it breaks at runtime. `@typescript-eslint/typescript-estree` reads `ts.Extension.Cjs`, which typescript 7 removed, so loading the eslint config throws `Cannot read properties of undefined`.
  - That capped the typescript devDependency below 7 for as long as eslint stayed.
- **The structural one.** Core already builds on oxc. `tsdown` bundles with rolldown, which is oxc's bundler, so the parser and resolver oxlint uses are the ones the build already depends on.

For where oxlint sits in the wider stack, why the tools are adopted individually rather than through Vite+, and which further swaps were measured and deferred, see [`toolchain.md`](./toolchain.md).

## The rule set

`.oxlintrc.json` has three layers:

- **Parity.** The explicit `rules` block reproduces every rule the old eslint config enabled. That was `typescript-eslint`'s `recommendedTypeChecked` preset plus `consistent-type-imports` and a configured `no-unused-vars`, 48 active rules in total.
  - All 48 have an oxlint equivalent, so the migration lost nothing. The block is written out rather than pulled from a preset, so a future oxlint default change cannot silently drop one.
- **Categories.** `correctness` and `perf` are enabled on top. These are oxlint's own rules, which eslint had no equivalent for, and they found real cleanups (redundant spreads, an array used as a lookup table that should have been a Set).
- **Additions.** A few rules from the `suspicious` category that catch bug classes rather than style: `no-shadow`, `no-array-sort`, `no-array-reverse`, `no-unnecessary-type-parameters`, `no-unnecessary-template-expression` and `no-unsafe-type-assertion`, the last of which has its own section below.

### What is deliberately off

`no-await-in-loop` is off. Core awaits inside loops on purpose, because git operations against one Project have to run in sequence. The rule flagged 85 sites, all of them correct as written.

Three categories are not enabled. The counts below are what they flagged when the swap was made, and they are recorded so the trade-off is visible rather than re-measured each time:

| Category      | Flagged | Why not                                        |
| ------------- | ------- | ---------------------------------------------- |
| `suspicious`  | 195     | Its two best rules are pulled out individually |
| `restriction` | 583     | Opinionated bans, not correctness              |
| `pedantic`    | 1478    | API preference rules, would bury real findings |
| `style`       | 8544    | Formatting, which is prettier's job            |

The category stays off rather than on because of these two:

- `no-unsafe-type-assertion` is enabled on its own, see below.
- `no-underscore-dangle` (23 sites) contradicts the `^_` ignore pattern configured on `no-unused-vars`, so it would have to stay off even if the category went on.

## no-unsafe-type-assertion and its exemptions

This rule is the machine-checked form of the "avoid type casts" convention in [`AGENTS.md`](../AGENTS.md). It started at 65 sites. Seven were real and were fixed, and the rest are inherent to a public API or a library's shape, so they carry an inline disable naming the reason. Only test files are exempt wholesale.

### What was fixed rather than exempted

- Six `Object.keys` / `Object.entries` sites now go through [`src/util/typedObject.ts`](../src/util/typedObject.ts). TypeScript widens both to `string` because an object may carry keys its type does not mention, which is not true of the schema-built objects Core walks. The one remaining assertion lives inside those two helpers.
- `ProjectService.ensureProjectIsUpgradeable` asserted the shape of an `unsafeRead` result. It now parses with a `z.looseObject({ coreVersion: z.string() })`. That cast was hiding a real gap: a Project file with no `coreVersion` used to fail somewhere inside semver as a generic `Internal` error, and now fails as `UpgradeFailed`. `ProjectService.test.ts` covers it.

### The exemptions

Exactly one file glob turns the rule off in [`.oxlintrc.json`](../.oxlintrc.json): `**/*.test.ts` and `src/test/**`, covering 37 casts. Test fixtures are built to a partial shape on purpose and vitest matchers are typed `any`, so the rule would report noise rather than defects.

**Every file of product code keeps the rule on.** The 21 casts that survive there each carry an inline `// oxlint-disable-next-line typescript/no-unsafe-type-assertion` with its reason, so a new cast added anywhere in `src` outside a test still fails `pnpm lint`. A file-level exemption would have hidden new casts in the same file, which is exactly the coverage the rule is for.

| Where | Casts | Why it cannot be re-typed |
| --- | --- | --- |
| `CollectionService.ts`, `ComponentService.ts`, `EntryService.ts` | 12 | `return this.toCollection(file) as T`, the public generic-narrowing API |
| `buildMdAstSchema.ts` | 4 | `z.union` wants a tuple of at least two, built from runtime features |
| `LogService.ts` | 2 | winston's splat symbol key is absent from its `TransformableInfo` type |
| `api/lib/util.ts` | 2 | hono's `ContentfulStatusCode` union, from a plain number |
| `AbstractSlugIndexedEntityService.ts` | 1 | subclass schema and `TFile` agree by construction, not by type |

The three services are the group worth understanding, because it is twelve copies of one line. Their read and write methods are declared `<T extends Collection = Collection>(...): Promise<T>`, so a caller can pass a type generated by `generate:types` and get it back narrowed.

The method physically returns the broad type and trusts the caller's `T`. That assertion is the API, and `generate:types` exists to feed it, so removing it is a breaking public API change rather than a cleanup.

### A disable comment must sit on the line directly above the cast

`oxlint-disable-next-line` means the next line, not the next statement. A wrapped expression puts the cast a line below where it reads like it should go, and the disable silently does nothing:

```typescript
const statusCode =
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  currentStatus !== 200 ? (currentStatus as ContentfulStatusCode) : 500;
```

A reason is fine on the same line, after a `--` separator, which is how the twelve service casts carry theirs:

```typescript
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the caller's narrowing claim
return this.toEntry(entryFile) as T;
```

What does not work is wrapping the reason onto a line of its own _below_ the directive. That second comment line becomes the next line, so the directive suppresses the comment and the cast still reports. Put a longer reason above the directive instead, or use a `/* oxlint-disable ... */` and `/* oxlint-enable ... */` pair for a run of related casts, as `makeUnion` does.

## Type-aware linting

Type-aware rules run through [`oxlint-tsgolint`](https://github.com/oxc-project/tsgolint) and are switched on by `options.typeAware` in the config, so plain `oxlint` runs them and no CLI flag is needed. tsgolint implements 59 of typescript-eslint's 61 type-aware rules. Neither missing rule is one Core used.

**tsgolint does not read the `typescript` package.** It is typescript-go compiled to a Go binary and ships its own platform builds, so the `typescript` devDependency version is irrelevant to linting.

- The oxlint docs say type-aware linting "requires TypeScript 7.0 or newer", which describes what tsgolint is built from, not a dependency it resolves.
- This was verified by running the full type-aware lint against `typescript@6.0.3`, which passes, and by probing a file with a floating promise and an `any` member access to confirm the type-aware rules genuinely fire.

The practical consequence is that upgrading the `typescript` devDependency and changing the linter are independent decisions. Do not couple them.

tsgolint ships binaries for linux, darwin and win32 on x64 and arm64. There is no musl build, so type-aware linting does not run inside an Alpine container. Every platform in the CI matrix is covered.

## eslint-disable comments still work

oxlint reads `eslint-disable` and `eslint-disable-next-line` comments, including ones written against `@typescript-eslint/`-prefixed rule names.

The existing suppressions in [`src/index.cli.test.ts`](../src/index.cli.test.ts), [`src/api/lib/types.ts`](../src/api/lib/types.ts) and [`src/service/uniqueFieldEnforcement.test.ts`](../src/service/uniqueFieldEnforcement.test.ts) were left as they are. They are load bearing, not dead comments: stripping the four file level disables from `index.cli.test.ts` surfaces 37 errors.

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

`oxlint --fix` applies the autofixable subset. Run `pnpm format` afterwards, because some fixes (the boolean literal comparison rules in particular) leave spacing prettier then normalizes.

## See also

- [`toolchain.md`](./toolchain.md) - the rest of the stack, and why each tool is adopted on its own
- [`naming.md`](./naming.md) - the conventions no linter checks
- [`documentation.md`](./documentation.md) - the jsdoc rules, and what the test suite checks instead
- [`peer-dependencies.md`](./peer-dependencies.md) - why the `typescript` peer range does not follow the linter
