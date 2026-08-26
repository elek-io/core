# elek.io Core contributor documentation

Contributor and design documentation for `@elek-io/core`. These docs stay in the repository and never ship, so they may link anywhere, including into `src/` and into [`../docs/`](../docs/index.md).

They record what the source cannot hold: why an area is built the way it is, which invariants a change has to respect, and what breaks when one is violated. For how to use Core, read [`../docs/index.md`](../docs/index.md) instead.

About to change an area? Read its doc first, so you change behavior on purpose rather than by guesswork.

## Start here

- [`documentation.md`](./documentation.md) - how to write on each documentation surface, and what the tools enforce
- [`naming.md`](./naming.md) - how things are named in the source, and the exceptions that mirror external tools
- [`testing.md`](./testing.md) - how the suite creates real Projects, and why it is slow by design
- [`toolchain.md`](./toolchain.md) - what Core builds, tests, lints and formats with, and why each tool was picked

## Content and schemas

- [`adding-a-field-type.md`](./adding-a-field-type.md) - the steps to add a field type, from schema to migration
- [`language-scoped-validation.md`](./language-scoped-validation.md) - how translatable content is guaranteed to carry the Project's languages
- [`migration-and-history-flow.md`](./migration-and-history-flow.md) - how Projects are upgraded, and how objects are read out of git history
- [`markdown-internals.md`](./markdown-internals.md) - how an mdast tree is validated, rendered and kept in step with upstream
- [`reference-integrity.md`](./reference-integrity.md) - the three gates that stop a reference from dangling

## Platform

- [`git-credentials.md`](./git-credentials.md) - why git authenticates through an askpass helper, and what to keep intact
- [`error-handling-internals.md`](./error-handling-internals.md) - how `CoreError` and validation work inside Core
- [`logging.md`](./logging.md) - what a log file may contain, and why names never appear in one
- [`astro-entry.md`](./astro-entry.md) - the design and invariants behind `@elek-io/core/astro`

## Dependencies and tooling

- [`peer-dependencies.md`](./peer-dependencies.md) - why each peer range was chosen, and how to re-check it before bumping
- [`linting.md`](./linting.md) - what each layer of the oxlint config is for, and which rules are off on purpose

## Comparisons

- [`comparisons/fields.md`](./comparisons/fields.md) - Core's field types against Strapi, Directus, Payload and TinaCMS
- [`comparisons/astro-integrations.md`](./comparisons/astro-integrations.md) - Core's Astro entry against the integrations it borrows from
