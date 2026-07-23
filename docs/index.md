# elek.io Core Documentation

Consumer documentation for `@elek-io/core`. These docs ship inside the published package, so a developer or AI coding agent always has version-matched references for the exact Core version in use, with no network lookup.

They cover how to use Core: the data model, the public API, the local REST API, the CLI and the Astro integration. They do not cover how to develop Core itself, that lives in the repository's `contributing/` folder and is not published.

New to elek.io Core? Read [`concepts.md`](./concepts.md) for the data model, then [`usage.md`](./usage.md) for a runnable walkthrough. Reach for the reference docs below as needed.

## Start here

- [`features.md`](./features.md) - capability overview for evaluating Core, including current limitations
- [`concepts.md`](./concepts.md) - the data model: Projects, Collections, Components, Entries, Values, Assets and Releases
- [`usage.md`](./usage.md) - programmatic usage, the local API, the CLI and the Astro integration

## Content modeling

- [`fields.md`](./fields.md) - the field type reference and how Entry Values are stored
- [`schema-changes.md`](./schema-changes.md) - what happens to existing content when you edit field definitions
- [`references.md`](./references.md) - typed pointers between content and how Core keeps them intact
- [`markdown-content.md`](./markdown-content.md) - storing and rendering rich `markdown` content as an mdast tree
- [`asset-management.md`](./asset-management.md) - the two-file Asset model, creating, reading and deleting Assets

## Reading and shipping content

- [`local-api.md`](./local-api.md) - the read-only REST API: endpoints, pagination and the OpenAPI docs
- [`api-clients.md`](./api-clients.md) - generating typed JS/TS clients and standalone TypeScript types
- [`export.md`](./export.md) - exporting Projects to plain JSON
- [`releases.md`](./releases.md) - tagged, versioned snapshots and promoting `work` to `production`
- [`ci-builds.md`](./ci-builds.md) - building sites in CI/CD, where the data directory starts empty

## Platform

- [`git-and-sync.md`](./git-and-sync.md) - the branch model, commits and synchronizing with a remote
- [`storage-layout.md`](./storage-layout.md) - where Projects and their files live on disk
- [`error-handling.md`](./error-handling.md) - `CoreError` and how to catch failures
