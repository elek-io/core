# @elek-io/core

[![codecov](https://codecov.io/gh/elek-io/core/graph/badge.svg?token=GSZIZMVG6Q)](https://codecov.io/gh/elek-io/core)

Handles core functionality of elek.io Projects like file IO and version control as well as providing schemas, types and a local REST API.

## Installation

```bash
npm install @elek-io/core
```

## Exports

The package provides multiple entry points for different environments:

- **Node** (`@elek-io/core`) — The `ElekIoCore` main class with full access to services, API, schemas and utilities.
- **Browser** (`@elek-io/core`) — All schemas and types but without the `ElekIoCore` class, since it is not usable in a browser environment.
- **Astro** (`@elek-io/core/astro`) — Astro content loaders `elekAssets()` and `elekEntries()` for loading Project data into Astro.
- **CLI** (`elek`) — A command-line interface with commands for generating API clients, starting a local API and exporting Projects.

## Source structure

```
|-- src
|   |-- api
|   |   Local REST API built on Hono with OpenAPI documentation.
|   |   Provides routes for Projects, Collections, Entries and Assets.
|   |-- astro
|   |   Astro integration with content loaders and dynamic schema building
|   |   based on Collection Field definitions.
|   |-- cli
|   |   Command-line interface with commands:
|   |   generate:client, api:start and export.
|   |-- error
|   |   Different classes extending Error.
|   |-- schema
|   |   Zod schemas for validation and types.
|   |-- service
|   |   Contains CRUD logic that does file-io as well as utility functions.
|   |   The methods are mostly used as endpoints
|   |   so their input is validated against our zod schemas.
|   |   |-- migrations
|   |   |   Version-aware schema migrations for Projects, Assets,
|   |   |   Collections and Entries.
|   |-- test
|   |   Additional files and utility functions only used for testing.
|   |-- util
|   |   Utility functions like path generation.
|   |-- index.browser.ts
|   |   Exports all schemas and types as well as the ElekIoCore type
|   |   but does not export the ElekIoCore main class,
|   |   since it is not actually usable in a browser environment.
|   |-- index.node.ts
|   |   Exports the ElekIoCore main class which makes the services and API
|   |   endpoints accessible as well as schemas and utility functions.
|   |-- index.astro.ts
|   |   Exports the Astro content loaders for Assets and Entries.
|   |-- index.cli.ts
|   |   Entry point for the CLI binary.
```

## The concept behind Projects, Collections, Entries, Values, Assets and Releases

```
|-- Project - e.g. "Website"
|   |-- Collection - e.g. "Blog"
|   |   Contains Field definitions all Entries and Values of the Collection must follow.
|   |   |-- Entry - e.g "Post"
|   |   |   |-- Value - e.g for a post's title: "Quarterly results 7% higher than expected"
|   |   |   |-- Asset - a reference to a previously added Asset like image, PDF or ZIP
|   |   |   |-- Entry - a reference to another Entry e.g. to show the user related posts
|   |-- Release - e.g. "v1.0.0" - a tagged snapshot of the Project at a specific point in time
```

### Projects

Are a container for Collections, Entries, Values and Assets. Think of a folder containing all the relevant files. Projects are version controlled with git, so you can roll back to previous versions of files at any time.

### Collections

Contains Field definitions (a schema) for possible Values each Entry can or has to have.
e.g. for a Blog, it could have the following Field definition for each post / Entry:

- an image that is displayed on top of the post (Asset reference)
- a title to catch users attention (Value)
- content that contains multiple headlines and paragraphs (Value)
- an author that wrote the post (Entry reference)

Each definition like the title, contains additional information for the input Field, that is used to modify it's Value.
e.g. the title would be a simple one line input Field, that has a maximum length of 150 characters and is required for each post. But the content is a markdown editor to easily add formatting. The image let's the user select a jpeg or png from disk. And the author is a reference to another Collection's Entry, so the user is able to choose one of them.

### Entries

Contains Values and references that follow the Collection's Field definitions. Why references and not the Assets or Entries themself? To make Values reusable for different Entries and even Collections - so when you update an Asset or Entry, it updates everywhere you've referenced it.

### Values

Represent either a single piece of data like the string "How to be successful in 3 easy steps", a number or a boolean - or a reference to Assets or other Entries.

### Assets

Are files / blobs like images (png, jpeg etc.), documents (excel sheets etc.), music or a compressed folder.
Assets have two files inside the Project's repository - the actual file and additionally a file containing meta information like the size.

### Releases

Are tagged snapshots of a Project at a specific point in time, managed through git tags. They allow you to mark stable versions of your content that can be deployed or exported.

## CLI

The package includes a CLI accessible via the `elek` command:

- `elek generate:client` — Generate a JavaScript/TypeScript API client (ESM or CJS)
- `elek api:start` — Start a local REST API server (default port 31310)
- `elek export` — Export Projects to JSON (nested or as separate files)

## Documentation

The `docs/` folder contains additional in-depth documentation on specific topics like the migration and history reading flow.

## Development

```bash
pnpm install       # Install dependencies
pnpm dev           # Run tests in watch mode
pnpm test          # Run tests once
pnpm coverage      # Run tests with coverage
pnpm build         # Build all entry points
pnpm lint          # Lint
pnpm check-types   # Type check
pnpm check-format  # Check formatting
pnpm format        # Format code
```
