---
'@elek-io/core': minor
---

`elek generate:types` and `elek generate:client` now admit `null` for optional fields, matching the schema the types are generated from and the Astro loaders' generated types. A language slot an editor left empty holds `null`, which the Entry schema has always accepted for a field the Collection does not require, while the generated type declared a plain `string`.

An optional `string` field is now `content: Record<ProjectLanguage, string | null>` and an optional `number` field `content: Record<ProjectLanguage, number | null>`. A **required** `markdown` field loses the `| null` it always carried and becomes `content: Record<ProjectLanguage, MdAstRoot>`. Required string and number fields, `boolean` fields and `reference` fields are unchanged, none of them is ever null.

Type-checking against regenerated types may surface real null cases that were previously hidden. Guard them, or mark the field required in the Collection.
