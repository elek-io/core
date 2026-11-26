# Concepts

The data model behind elek.io Core: Projects, Collections, Components, Entries, Values, Assets and Releases, and how they relate.

```
|-- Project - e.g. "Website"
|   |-- Component - e.g. "Author"
|   |   Reusable, named groups of field definitions that can be referenced by Collections.
|   |-- Collection - e.g. "Blog"
|   |   Contains field definitions all Entries and Values of the Collection must follow.
|   |   Can reference Components to reuse shared field definitions.
|   |   |-- Entry - e.g "Post"
|   |   |   |-- Value - e.g for a post's title: "Quarterly results 7% higher than expected"
|   |   |   |-- Asset - a reference to a previously added Asset like image, PDF or ZIP
|   |   |   |-- Entry - a reference to another Entry e.g. to show the user related posts
|   |-- Release - e.g. "v1.0.0" - a tagged snapshot of the Project at a specific point in time
|   |-- Contract - e.g. "@acme/dealer-site" - what a theme needs, as Collections and Components
|   |-- Destination - e.g. "autohaus-ebersfelde.de" - one place content goes, and the Mapping that fills it
```

## Projects

Are a container for Collections, Components, Entries, Values and Assets. Think of a folder containing all the relevant files. Projects are version controlled with git, so you can roll back to previous versions of files at any time. Change a Project only through Core, never with git or an editor by hand, see [`git-and-sync.md`](./git-and-sync.md#change-a-project-only-through-core).

Each Project declares its supported languages in its settings, along with one of them as the default. Translatable content (admin metadata and Entry Values) is validated against those languages, not the full universe of supported language codes.

## Collections

Contains field definitions (a schema) for possible Values each Entry can or has to have. e.g. for a Blog, it could have the following field definition for each post / Entry:

- an image that is displayed on top of the post (Asset reference), which lets the user pick a jpeg or png from disk
- a title to catch users attention (Value), a single line input that is required and at most 150 characters long
- content that contains multiple headlines and paragraphs (Value), a markdown editor so the text can carry formatting
- an author that wrote the post (Entry reference), which lets the user pick an Entry of another Collection

A definition says more than the type. It also says what the input field looks like and what a Value has to satisfy.

A Collection can be limited to one Entry, which makes it a Single Entry. That is where one-off content lives, such as contact details or the logo, and a site reads it as one item rather than a list. Whether a Collection is one is decided when it is created, see [`usage.md`](./usage.md#creating-a-collection).

For the full catalogue of field types and their constraints, see [`fields.md`](./fields.md).

## Components

Are reusable, named groups of field definitions that can be referenced by one or more Collections. Instead of duplicating the same field definitions across Collections, you define them once as a Component and reference it through a `dynamic` field. When you update a Component's field definitions, the change propagates to all Collections that use it.

See [Composing with Components](./fields.md#composing-with-components) for a worked example.

## Entries

Contains Values and references that follow the Collection's field definitions. Why references and not the Assets or Entries themself? To make Values reusable for different Entries and even Collections - so when you update an Asset or Entry, it updates everywhere you've referenced it.

## Values

Represent either a single piece of data like the string "How to be successful in 3 easy steps", a number or a boolean - or a reference to Assets or other Entries. Rich body content is stored as a structured markdown abstract syntax tree (mdast) rather than a markdown string. See [`markdown-content.md`](./markdown-content.md).

Direct Values (`string` / `number` / `boolean`), `reference` and `mdast` Values store per-language content. `component` Values store an ordered, language-independent array of items. The full `Value` union lives in `src/schema/valueSchema.ts` and is documented in [`fields.md`](./fields.md#value-structure).

## Assets

Are files / blobs like images (png, jpeg etc.), documents (excel sheets etc.), music or a compressed folder. Assets have two files inside the Project's repository - the actual file and a file containing meta information like the size.

## Releases

Are tagged snapshots of a Project at a specific point in time, managed through git tags. They allow you to mark stable versions of your content that can be deployed or exported.

## Contracts and Destinations

A Destination is one place a Project's content goes, a website first, shown by its own name. A Contract is what the place it goes to needs, as Collections and Components in Core's own schemas, and a theme states one in its own repository. A Mapping says which Project Collection fills which Collection of the Contract, which of its Entries the website takes, and how each field of it is filled.

A Project keeps each Contract once, with where it comes from and a copy of every version a Destination uses, so it stays self-contained. See [`destinations.md`](./destinations.md).

## See also

- [`destinations.md`](./destinations.md) - Contracts, websites and the Mapping between them
- [`fields.md`](./fields.md) - full field type reference and the Value structure
- [`schema-changes.md`](./schema-changes.md) - how editing field definitions cascades into existing Entries
- [`markdown-content.md`](./markdown-content.md) - how rich `markdown` Values are stored and rendered
- [`asset-management.md`](./asset-management.md) - the two-file Asset model, creating, reading and deleting Assets
- [`git-and-sync.md`](./git-and-sync.md) - the branch model and synchronizing with a remote
- [`releases.md`](./releases.md) - tagged snapshots and promoting `draft` into `main`
- [`storage-layout.md`](./storage-layout.md) - where Projects and their files live on disk
- [`error-handling.md`](./error-handling.md) - `CoreError` and validation error patterns
