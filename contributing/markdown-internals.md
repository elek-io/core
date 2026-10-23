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

[`mdastRender`](../src/util/mdastRender.ts) is a typed fold over an `MdAstRoot`. Every node type has a required handler in `MdastRenderersBase<T>`, which the depth first walk calls with the node, its rendered children where it has any, and last its `MdastNodeContext`.

It is framework-agnostic, `T` is the consumer's element type. A framework binding layers defaults on top and narrows what a consumer has to supply, which is what `@elek-io/core/astro` does. Both the primitive and its types reach consumers through `util/shared.ts`.

Exhaustiveness is the point. A node type added in a later Core release becomes a type error in a consumer's renderers rather than a silent gap, and the three keys in `REQUIRED_RENDERER_KEYS` stay required because no default is safe for them.

## How a handler learns where its node sits

A handler used to be given its node and its rendered children, and nothing else. That is not enough for a table: `table.align` reaches the `table` handler while the cell is what has to carry the alignment, and nothing on a `tableCell` says whether it heads a column.

The decision is an `MdastNodeContext`, handed to every handler as its last argument, holding `index` and `ancestors` with the root first and the direct parent last.

| Rejected | Why not |
| --- | --- |
| A `parent` field beside `ancestors` | `ancestors.at(-1)` already is it, and one fact under two names drifts |
| A dedicated `tableHeaderCell` renderer key | It fixes one node type and leaves `align` nowhere to come from. There is no `tableHeaderCell` node type either, so the `walk` switch would stop mapping one to one onto `node.type`, which is what the exhaustiveness check rests on. A 25th required key is also the bigger break: every object typed against `MdastRenderersBase` stops compiling |

What holds:

- **A handler that leaves out the context stays assignable to its type**, a parent with two parameters and a leaf with one, so every renderers object written before the context existed still compiles untouched. `mdastRender.test.ts` asserts both with `expectTypeOf` rather than leaving it to the eye.
- **Every handler is always handed a context**, so none has to guard for `undefined`. The root's is `index` 0 with no ancestors, which is the truth about the root rather than a placeholder.
- **One child walk**, `renderChildren`, is the only place the walk descends. Each parent case of the switch calls it, so a node's ancestors array is built once and shared by its children rather than built once per case.
- **The array is shared, so it is read only** in `MdastNodeContext`. Mutating it would reach a node's siblings.

`isTableHeaderCell` and `tableCellAlign` sit next to the fold and answer a cell's two questions from its context. They are exported, because a consumer overriding `tableCell` needs the same two answers and should not reimplement Core's default to get them.

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
