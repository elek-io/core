# AGENTS.md

Guidance for AI agents and contributors working on `@elek-io/core`.

Core handles file IO and git version control for elek.io Projects, a headless, git-backed CMS. It is published as a TypeScript library with Node, Browser, Astro and CLI entry points.

## Documentation

Core's docs live in two places, split by audience:

- [`docs/`](./docs/) - consumer documentation: the observable behavior and public API. It ships inside the published package (listed in `package.json` `files`), so keep it self-contained. A doc here must not link into `contributing/`, or the link dangles in the package. [`docs/index.md`](./docs/index.md) is the index and the topic-to-doc map, add new consumer docs to it.
- [`contributing/`](./contributing/) - contributor and design docs: the design and invariants behind the behavior, plus testing, how to add a field type, and the cross-CMS comparison. Never shipped, so these may link anywhere.

Two rules follow:

- **Read before you change.** Before working on an area, read its doc first so you change behavior on purpose, not by guesswork. The docs capture intent the source alone does not.
- **Write after you change.** When you add or change behavior users or maintainers should know about, or find behavior that is undocumented, update the matching doc in the same change. This is for meaningful changes only (a new or changed public API, a new field type or option, an observable default, an invariant a maintainer must respect), not every code change.

## Commands

- `pnpm install` - install dependencies (use pnpm, not npm)
- `pnpm dev` - run the test suite in watch mode (vitest)
- `pnpm test` - run the test suite once
- `pnpm coverage` - run the suite with coverage
- `pnpm build` - build all entry points with tsdown
- `pnpm lint` - run eslint
- `pnpm check-types` - type-check with tsc, no emit
- `pnpm format` - format with prettier

## Conventions

- Write tests first. Core is integration-test heavy and most behavior is proven through real Projects.
- Prefer a library's built-in feature over hand-rolled code.
- Avoid type casts. Shape the types so a cast is not needed.
- Keep comments short and put deeper detail in the docs. Avoid em-dashes and semicolons, use simple sentences for readability.
- Core has three peer dependencies (`zod`, `dugite`, `astro`). Before bumping any of them, or a dependency that pulls `zod` (`@scalar/*`, `@hono/zod-openapi`), read [`contributing/peer-dependencies.md`](./contributing/peer-dependencies.md) for why each version range was chosen and how to re-check it. The `pnpm test` suite guards zod's single-copy invariant through [`src/zod-single-copy.test.ts`](./src/zod-single-copy.test.ts).
- Core environment variables use the `ELEK_IO_` prefix, are read once at Core construction (never at module import) and are documented in the environment variables section of [`docs/usage.md`](./docs/usage.md).

## Testing notes

- The suite creates real Projects (real git repositories), so it is slow by design. Test files run in parallel, each in its own data directory under `~/elek.io-test`, nested beneath `ELEK_IO_DATA_DIR` if set. See [`contributing/testing.md`](./contributing/testing.md) for how that works and the CI timeout rationale.
- When running the suite inside a sandboxed git environment, unset the `GIT_CONFIG_*` variables first, or the bare-repository tests break.
