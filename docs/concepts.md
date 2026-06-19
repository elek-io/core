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
```

## Projects

Are a container for Collections, Components, Entries, Values and Assets. Think of a folder containing all the relevant files. Projects are version controlled with git, so you can roll back to previous versions of files at any time.

Each Project declares its supported languages in its settings. Translatable content (admin metadata and Entry Values) is validated against those languages, not the full universe of supported language codes.

## Collections

Contains field definitions (a schema) for possible Values each Entry can or has to have.
e.g. for a Blog, it could have the following field definition for each post / Entry:

- an image that is displayed on top of the post (Asset reference)
- a title to catch users attention (Value)
- content that contains multiple headlines and paragraphs (Value)
- an author that wrote the post (Entry reference)

Each definition like the title, contains additional information for the input field, that is used to modify it's Value.
e.g. the title would be a simple one line input field, that has a maximum length of 150 characters and is required for each post. But the content is a markdown editor to easily add formatting. The image let's the user select a jpeg or png from disk. And the author is a reference to another Collection's Entry, so the user is able to choose one of them.

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

Are files / blobs like images (png, jpeg etc.), documents (excel sheets etc.), music or a compressed folder.
Assets have two files inside the Project's repository - the actual file and additionally a file containing meta information like the size.

## Releases

Are tagged snapshots of a Project at a specific point in time, managed through git tags. They allow you to mark stable versions of your content that can be deployed or exported.

## See Also

- [`fields.md`](./fields.md) - full field type reference and the Value structure
- [`schema-changes.md`](./schema-changes.md) - how editing field definitions cascades into existing Entries
- [`markdown-content.md`](./markdown-content.md) - how rich `markdown` Values are stored and rendered
- [`asset-management.md`](./asset-management.md) - the two-file Asset model, creating, reading and deleting Assets
- [`git-and-sync.md`](./git-and-sync.md) - the branch model and synchronizing with a remote
- [`releases.md`](./releases.md) - tagged snapshots and promoting `work` to `production`
- [`storage-layout.md`](./storage-layout.md) - where Projects and their files live on disk- [`error-handling.md`](./error-handling.md) - `CoreError` and validation error patterns
