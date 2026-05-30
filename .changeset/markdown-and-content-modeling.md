---
'@elek-io/core': minor
---

Richer content modeling and a typed client workflow:

- **Markdown fields** (`markdown` field type) store structured content (mdast) instead of raw strings, with per-field toggles for which features are allowed (headings, lists, tables, emphasis, links, images, and references to Assets/Entries). New framework-agnostic `mdastRender` and `extractText` helpers, plus an Astro renderer (`@elek-io/core/astro`), turn that content into your own markup.
- **Components** are reusable, separately-defined sets of field definitions that you embed in Collections (or other Components) through `dynamic` fields, so a single field can hold an ordered list of mixed component blocks. Replaces the previous shared-value approach.
- **Select fields** (`select` field type) let editors pick from predefined string or number options with translatable labels.
- **Field definition groups** organise fields into named fieldsets for display in the UI without affecting stored data.
- **Type generation**: a new `elek generate:types` CLI command emits project-scoped TypeScript types, and the generated API client now accesses Collections by slug and understands nested Component values.
- **Language-scoped validation**: translatable content (names, labels, entry values) is validated against the Project's supported languages, and generated types narrow to `Record<ProjectLanguage, T>`.
- **Automatic Entry migration**: changing a Collection's or Component's field definitions migrates existing Entries automatically where the change is unambiguous, and otherwise returns a list of issues for you to resolve and re-apply.
- **Safer writes**: a failed operation now rolls back to a clean git working tree.
