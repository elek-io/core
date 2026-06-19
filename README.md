# @elek-io/core

[![codecov](https://codecov.io/gh/elek-io/core/graph/badge.svg?token=GSZIZMVG6Q)](https://codecov.io/gh/elek-io/core)

Handles core functionality of elek.io Projects like file IO and version control as well as providing schemas, types and a local REST API.

## Features

- **Own your content** - every Project is a git repository of plain JSON files. No proprietary database, no lock-in, readable and diffable on disk.
- **Work offline** - Core runs fully locally and needs no server to create, edit or read content. Sync with any git provider (GitHub, GitLab, Bitbucket) when you want.
- **Model content precisely** - typed Collections, reusable Components, 17 field types across 6 value types, references, and polymorphic page-builder blocks.
- **Translate everything** - multilingual content is first-class, validated against each Project's supported languages.
- **Ship type-safe content** - Zod-validated schemas, typed errors, and generated TypeScript types and API clients straight from your content models.
- **Never lose a change** - full git history, read any version of any object, transactional writes with automatic rollback, and tagged Releases.
- **Integrate anywhere** - a local REST API, JSON export, an Astro integration, and structured (mdast) rich text you can render in any framework.

See [`features.md`](./docs/features.md) for the full capability reference, including current limitations.

## Installation

```bash
npm install @elek-io/core
```

## Exports

The package provides multiple entry points for different environments:

- **Node** (`@elek-io/core`) - The `ElekIoCore` main class with full access to services, API, schemas and utilities.
- **Browser** (`@elek-io/core`) - All schemas and types but without the `ElekIoCore` class, since it is not usable in a browser environment.
- **Astro** (`@elek-io/core/astro`) - Astro content loaders `elekAssets()` and `elekEntries()` for loading Project data into Astro.
- **CLI** (`elek`) - A command-line interface with commands for generating API clients, generating TypeScript types, starting a local API and exporting Projects.

## Concepts

elek.io Core organises content into a small set of nested concepts:

```
|-- Project - e.g. "Website" - a git-versioned container for everything below
|   |-- Component - e.g. "Author" - reusable group of field definitions
|   |-- Collection - e.g. "Blog" - Field definitions Entries must follow
|   |   |-- Entry - e.g. "Post" - content following the Collection's definitions
|   |   |   |-- Value - a single piece of data, e.g. a post's title
|   |   |   |-- Asset - a reference to a file like an image, PDF or ZIP
|   |   |   |-- Entry - a reference to another Entry, e.g. related posts
|   |-- Release - e.g. "v1.0.0" - a tagged snapshot of the Project
```

- **Project** - a container for Collections, Components, Entries, Values and Assets, version controlled with git.
- **Collection** - field definitions (a schema) every Entry and its Values must follow.
- **Component** - a reusable, named group of field definitions shared across Collections via `dynamic` fields.
- **Entry** - Values and references that follow a Collection's field definitions.
- **Value** - a single string, number or boolean, or a reference to Assets or other Entries.
- **Asset** - a file / blob (image, document, archive) plus a metadata file.
- **Release** - a tagged snapshot of a Project at a point in time, managed through git tags.

For the full data model and how these relate, see [`docs/concepts.md`](./docs/concepts.md). For the field types a Collection can define, see [`docs/fields.md`](./docs/fields.md).

## Usage

Install the package and instantiate the Node entry point. A User must be set before any write, since every change is committed to git.

```typescript
import ElekIoCore, { uuid } from '@elek-io/core';

const core = new ElekIoCore();

// Required before writing - git needs a signature for commits
await core.user.set({
  userType: 'local',
  name: 'John Doe',
  email: 'john.doe@example.com',
  language: 'en',
  localApi: { isEnabled: false, port: 31310 },
});

// Create a Project (a git-versioned container for your content)
const project = await core.projects.create({
  name: 'Website',
  description: 'The official website',
  settings: { language: { default: 'en', supported: ['en', 'de'] } },
});

// Define a Collection with a single text Field
const collection = await core.collections.create({
  projectId: project.id,
  icon: 'home',
  name: {
    singular: { en: 'Product', de: 'Produkt' },
    plural: { en: 'Products', de: 'Produkte' },
  },
  slug: { singular: 'product', plural: 'products' },
  description: {
    en: 'The products we offer',
    de: 'Die Produkte, die wir anbieten',
  },
  fieldDefinitions: [
    {
      id: uuid(),
      slug: 'name',
      valueType: 'string',
      fieldType: 'text',
      label: { en: 'Name', de: 'Name' },
      description: null,
      inputWidth: '12',
      isRequired: true,
      isDisabled: false,
      isUnique: false,
      min: null,
      max: 70,
      defaultValue: null,
    },
  ],
});

// Add an Entry following the Collection's definitions
const entry = await core.entries.create({
  projectId: project.id,
  collectionId: collection.id,
  values: {
    name: {
      objectType: 'value',
      valueType: 'string',
      content: { en: 'My first product', de: 'Mein erstes Produkt' },
    },
  },
});

// Read it back
const { list, total } = await core.entries.list({
  projectId: project.id,
  collectionId: collection.id,
  limit: 0,
});
```

For the full guide - options, Assets, references, reading from history, error handling, the local API, the CLI and the Astro integration - see [`docs/usage.md`](./docs/usage.md).

## CLI

The package includes a CLI accessible via the `elek` command:

- `elek generate:client` - Generate a JavaScript/TypeScript API client (ESM or CJS)
- `elek generate:types` - Generate TypeScript type definitions from Project content models
- `elek api:start` - Start a local REST API server (default port 31310)
- `elek export` - Export Projects to JSON (nested or as separate files)

## Documentation

The [`docs/`](./docs/) folder is the consumer documentation and ships inside the published package, see [Using Core with AI agents](#using-core-with-ai-agents). New to elek.io Core? Start with [`concepts.md`](./docs/concepts.md) for the data model and [`usage.md`](./docs/usage.md) for a runnable walkthrough, then reach for the reference docs below. [`docs/index.md`](./docs/index.md) indexes them all.

Docs for working on Core itself live in [`contributing/`](./contributing/) and are not published: testing, design references (language-scoped validation, migration and history flow), how to add a field type, error-handling internals, and a cross-CMS field comparison.

### Using Core with AI agents

Core ships its consumer documentation inside the package at `node_modules/@elek-io/core/docs/`, so an AI coding agent works from references matched to the installed version rather than stale training data, with no network lookup. Point your agent at it by adding the following to your project's `AGENTS.md` (Claude Code, Cursor, GitHub Copilot and others read that file automatically):

```md
## elek.io Core

When working with `@elek-io/core`, read the relevant doc under
`node_modules/@elek-io/core/docs/` before writing code, starting from
`docs/index.md`. These docs are matched to the installed version and are
the source of truth.
```

## Source structure

```
|-- src
|   |-- api
|   |   Local REST API built on Hono with OpenAPI documentation.
|   |   Provides routes for Projects, Collections, Components, Entries and Assets.
|   |-- astro
|   |   Astro integration with content loaders and dynamic schema building
|   |   based on Collection field definitions.
|   |-- cli
|   |   Command-line interface with commands:
|   |   generate:client, generate:types, api:start and export.
|   |-- schema
|   |   Zod schemas for validation and types.
|   |-- service
|   |   Contains CRUD logic that does file-io as well as utility functions.
|   |   The methods are mostly used as endpoints
|   |   so their input is validated against our zod schemas.
|   |   |-- migrations
|   |   |   Version-aware schema migrations for Projects, Assets,
|   |   |   Collections, Components and Entries.
|   |-- test
|   |   Additional files and utility functions only used for testing.
|   |-- util
|   |   Utility functions like path generation
|   |   and shared code such as the CoreError class.
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
