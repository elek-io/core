# Markdown internals

How a `markdown` field's mdast tree is validated, rendered and kept in step with the upstream spec. For what a consumer stores and how they render it, see [`../docs/markdown-content.md`](../docs/markdown-content.md).

## Where each check lives

A `markdown` field is validated in two passes, and the split follows what needs IO:

| Check | Where | Why there |
| --- | --- | --- |
| Allowed node types, heading depths, block count, `ofCollections` | `buildMdAstSchema.ts` | structural, decidable from the value alone |
| Referenced file exists, `ofAssetMimeTypes` | `EntryService.validateValueReferences` | has to read the target file |

`buildMdAstSchemaForFeatures` narrows the permissive tree schema in `valueSchema.ts` down to the node types a field's `features` config enables. `null` is accepted when the field is not required, the same way a text, number or boolean field accepts it.

The block count floor is `min ?? (isRequired ? 1 : 0)`, so a required markdown field behaves like `.min(1)` on a required string. A tree holding only empty paragraphs is rejected, because elek.io Desktop normalizes that to `null`.

## The render fold

[`mdastRender`](../src/util/mdastRender.ts) is a typed fold over an `MdAstRoot`. Every node type has a required handler in `MdastRenderersBase<T>`, the walk descends depth first and calls each parent handler with its already rendered children, then the root handler combines.

It is framework-agnostic, `T` is the consumer's element type. A framework binding layers defaults on top and narrows what a consumer has to supply, which is what `@elek-io/core/astro` does. Both the primitive and its types reach consumers through `util/shared.ts`.

Exhaustiveness is the point. A node type added in a later Core release becomes a type error in a consumer's renderers rather than a silent gap, and the three keys in `REQUIRED_RENDERER_KEYS` stay required because no default is safe for them.

## Drift against `@types/mdast`

Core's mdast types are hand written for Zod, and the inferred types come from `z.infer`, never from `@types/mdast`. That package stays a devDependency for one reason: [`mdast-upstream-compat.ts`](../src/schema/mdast-upstream-compat.ts) asserts at compile time that the two have not drifted.

What the assertions catch:

- A new required scalar field on a node type Core models.
- A changed shape on an existing scalar field, a narrowed `depth` for example.
- A renamed field.

What they let through on purpose:

- A new optional field upstream, which is additive and can wait until it is needed.
- A removed field, which Core may keep deliberately.
- A change in a children shape. Core's recursive types omit `position` and `data` from every node, so they are structurally distinct from upstream's and a deep comparison would be fragile. Only the non-recursive, non-metadata fields are compared per node.

## See also

- [`../docs/markdown-content.md`](../docs/markdown-content.md) - the consumer facing model and how to render a tree
- [`astro-entry.md`](./astro-entry.md) - the Astro binding of the fold, and why its defaults avoid `astro/jsx-runtime`
- [`adding-a-field-type.md`](./adding-a-field-type.md) - where a field's schema is declared
- [`reference-integrity.md`](./reference-integrity.md) - the reference checks a tree is subject to
- [`openapi-document.md`](./openapi-document.md) - why the two recursive node unions carry an OpenAPI component name
