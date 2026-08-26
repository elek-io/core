# AGENTS.md

Guidance for AI agents and contributors working on `@elek-io/core`.

Core handles file IO and git version control for elek.io Projects, a headless, git-backed CMS. It is published as a TypeScript library with Node, Browser, Astro and CLI entry points.

## Documentation

Core documents on four surfaces, each written for a different reader:

- [`docs/`](./docs/) - consumer documentation, ships inside the published package
- [`contributing/`](./contributing/) - contributor and design docs, never shipped
- JSDoc in `src/` - on an export it reaches the consumer through the `.d.ts`, on an internal it does not
- [`plans/`](./plans/) - work that still has to happen, deleted before its branch merges

Two rules:

- **Read before you change.** Before working on an area, read its doc first, so you change behavior on purpose rather than by guesswork. The docs capture intent the source alone does not.
- **Write after you change.** When you add or change behavior a user or a maintainer should know about, or find behavior that is undocumented, update the matching doc in the same change.

**Before writing or editing any documentation, JSDoc included, read [`contributing/documentation.md`](./contributing/documentation.md).** It defines what belongs on each surface and how to write it. `pnpm test` and `pnpm lint` enforce the mechanical half, so a failure there points back at that doc.

## Commands

- `pnpm install` - install dependencies (use pnpm, not npm)
- `pnpm dev` - run the test suite in watch mode (vitest)
- `pnpm test` - run the test suite once
- `pnpm coverage` - run the suite with coverage
- `pnpm build` - build all entry points with tsdown
- `pnpm lint` - run oxlint, including its type-aware rules
- `pnpm check-types` - type-check with tsc, no emit
- `pnpm format` - format with prettier

## Conventions

- Write tests first. Core is integration-test heavy and most behavior is proven through real Projects.
- Prefer a library's built-in feature over hand-rolled code.
- Avoid type casts. Shape the types so a cast is not needed. `pnpm lint` enforces this through `no-unsafe-type-assertion` across all of `src` except tests. The few casts that survive are inherent to a public API or a library's shape and each carries an inline disable naming the reason, see [`contributing/linting.md`](./contributing/linting.md).
- Boolean keys use an `is` or `has` prefix (`isReadOnly`, `hasToken`). Keys that mirror an external tool's name keep that name instead, like git flags (`detach`, `forceCreate`) or slugify options (`lowercase`). See [`contributing/naming.md`](./contributing/naming.md).
- Core's log files can be handed to someone else, so they carry ids, paths and what happened, never authored content and never a name a User typed. Read [`contributing/logging.md`](./contributing/logging.md) before adding or changing a log call.
- Linting is oxlint, configured in [`.oxlintrc.json`](./.oxlintrc.json). Before changing the rule set, read [`contributing/linting.md`](./contributing/linting.md) for what each layer of the config is for, which rules are off on purpose and why the linter is independent of the `typescript` version.
- [`contributing/toolchain.md`](./contributing/toolchain.md) covers the stack as a whole (tsdown, vitest, oxlint, prettier, tsc), why the tools are adopted one at a time rather than through Vite+, and which swaps were measured and deferred. Read it before proposing a tooling change.
- Core has five peer dependencies (`zod`, `dugite`, `astro`, `tsdown`, `typescript`). Read [`contributing/peer-dependencies.md`](./contributing/peer-dependencies.md) before bumping any of them, or any dependency that pulls `zod`. The CLI must only ever import `tsdown` lazily, so it does not bundle a peer.
- Core environment variables use the `ELEK_IO_` prefix, are read once at Core construction (never at module import) and are documented in the environment variables section of [`docs/usage.md`](./docs/usage.md).

## Testing notes

- The suite creates real Projects (real git repositories), so it is slow by design. Test files run in parallel, each in its own data directory under `~/elek.io-test`, nested beneath `ELEK_IO_DATA_DIR` if set. See [`contributing/testing.md`](./contributing/testing.md) for how that works and the CI timeout rationale.
- When running the suite inside a sandboxed git environment, unset the `GIT_CONFIG_*` variables first, or the bare-repository tests break.
