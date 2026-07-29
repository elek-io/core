---
'@elek-io/core': minor
---

The TypeScript types the Astro loaders generate now admit `null` for optional fields, matching the schema they are generated from. A language slot an editor left empty holds `null`, which the loader-supplied schema has always accepted, while the generated type declared a plain `string`. So `entry.data.slug.de` read as a string and was `null` at runtime, in exactly the case `elekSlugPaths()` exists for.

An optional `string` field is now `Record<ProjectLanguage, string | null>` and an optional `number` field `Record<ProjectLanguage, number | null>`. The reverse applies to markdown: a **required** `markdown` field is now `Record<ProjectLanguage, MdAstRoot>` instead of always carrying `| null`. Nullability is unchanged for required string and number fields, `boolean` fields and `reference` fields, none of which is ever null. The shape of a `reference` field does change in this release, separately from nullability.

Type-checking a site against the new types may surface real null cases that were previously hidden, in templates reading an optional field. Guard them, or mark the field required in the Collection:

```astro
{post.data.subtitle.en && <p>{post.data.subtitle.en}</p>}
```

The same rule applies to fields inside a Component.
