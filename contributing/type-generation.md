# Type generation

Design notes and invariants behind the TypeScript Core hands its consumers. Three layers type the same content and they deliberately do not agree on shape. The consumer-facing version of that split is [which types describe what](../docs/api-clients.md#which-types-describe-what), this is the rule that decides it and the two divergences it produced.

## The three layers

| Layer               | Built by                                                                                 | Width                                      |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| Core's static types | `z.infer` over the schemas in [`src/schema/`](../src/schema/)                            | Every Project, every supported language    |
| The CLI generators  | [`src/cli/generateTypesAction.ts`](../src/cli/generateTypesAction.ts), `generate:client` | One Project, its languages and field slugs |
| The Astro loaders   | [`src/astro/schema.ts`](../src/astro/schema.ts)                                          | One Collection, injected by Astro          |

The static types are the only hand-written ones, in the sense that they follow the schemas. The other two are generated per Project from field definitions, which is what narrows `Partial<Record<SupportedLanguage, T>>` down to `Record<ProjectLanguage, T>`. That narrowing is [`language-scoped-validation.md`](./language-scoped-validation.md).

## The rule

**A type over a wire format mirrors that format exactly. A type over a transform describes the transform's output and may carry fields the stored data does not have.**

The CLI generators type what Core hands back verbatim: `core.entries.read()`, a local API response, an export. A field invented there would describe something that is not in the payload, and `generate:client` validates responses against a zod schema built the same way, so it would fail at runtime as well as mislead. That is why the CLI's `EntryValues` keeps the Value envelope, `sections: { objectType: 'value'; valueType: 'component'; content: PagesSectionsItem[] }`.

The Astro loaders own the only transform that sits between stored content and what a consumer reads, [`src/astro/transform.ts`](../src/astro/transform.ts). (The transforms in [`src/util/`](../src/util/) rewrite content on disk when a model changes, see [`migration-and-history-flow.md`](./migration-and-history-flow.md), they do not reshape what a reader gets.) It strips the envelopes and flattens `content` before Astro sees an Entry, so both artifacts the loader supplies through `createSchema`, the zod schema for `parseData` and the type string, describe the transformed shape rather than the stored one. Derived fields are legitimate there, and the schema is what keeps them honest: `parseData` fails the sync when the transform and the schema disagree, so the two are edited together or not at all. [`src/index.astro.components.test.ts`](../src/index.astro.components.test.ts) is the end-to-end guard.

`componentSlug`, the Component's slug on every item of a `dynamic` field, exists on the Astro side for exactly this reason and does not belong on the CLI side. It is named for what it holds, next to the `componentId` it sits beside, which is the same pairing [`src/schema/entrySchema.ts`](../src/schema/entrySchema.ts) uses for a component item in `ReferenceComponentPathSegment`. See [`naming.md`](./naming.md).

## The discriminant divergence

Both generators emit a discriminated union per `dynamic` field, on different discriminants:

```typescript
// generate:types
export const HeroComponentId = '4cd8cadc-…' as const;
export const QuoteComponentId = '4e84089d-…' as const;
export type PagesSectionsItem =
  | {
      id: string;
      componentId: typeof HeroComponentId;
      values: HeroComponentValues;
    }
  | {
      id: string;
      componentId: typeof QuoteComponentId;
      values: QuoteComponentValues;
    };

// The Astro loaders
type PagesSectionsItem =
  | {
      id: string;
      componentId: '4cd8cadc-…';
      componentSlug: 'hero';
      values: HeroComponentValues;
    }
  | {
      id: string;
      componentId: '4e84089d-…';
      componentSlug: 'quote';
      values: QuoteComponentValues;
    };
```

Not an oversight. The CLI writes a module to a path the consumer chose and imports, so it can export values, and a named id constant is readable and survives a slug rename. The Astro type string is injected into `.astro/loaders/<collectionKey>.ts`, a build artifact rather than a stable import path, and `entry.data` arrives from the content store rather than from a module the site imports. The only place a human-readable discriminant can live there is in the data itself, which is what the transform puts there.

The trade-off differs accordingly and is worth knowing before changing either side. Renaming a Component's slug leaves the CLI constant's value untouched, only its name changes on the next generate. On the Astro side the same rename changes what a site sees on the next sync, so a `case 'hero':` stops matching. The stored reference is the UUID in both cases (`componentItemSchema` in [`src/schema/valueSchema.ts`](../src/schema/valueSchema.ts)), so nothing on disk breaks either way.

Component slugs are unique within a Project, enforced by `ComponentService` on create and update through the slug index. The Astro union relies on that, a duplicate slug would make two members of a `z.discriminatedUnion` indistinguishable.

## Adding to either side

Decide which side a new field belongs to before writing it:

- **It exists on disk.** Then it belongs to the schemas first, and both generators follow. See [`adding-a-field-type.md`](./adding-a-field-type.md), whose last step is exactly this.
- **It is derived while reading.** Then it is Astro only, and three things move together: the transform, the zod schema and the emitted type string. Miss the schema and every sync of an affected Entry fails, miss the type string and the schema accepts what the types deny.

Unit coverage for the generators lives in [`src/astro/schema.test.ts`](../src/astro/schema.test.ts), [`src/astro/transform.test.ts`](../src/astro/transform.test.ts) and [`src/cli/generateTypesAction.test.ts`](../src/cli/generateTypesAction.test.ts). A generated type string that has to compile is put through `expectTranspiles` from [`src/test/util.ts`](../src/test/util.ts), which is also what pins the `typescript` dev dependency, see [`peer-dependencies.md`](./peer-dependencies.md).

## See Also

- [`../docs/api-clients.md`](../docs/api-clients.md) - the consumer documentation for both CLI generators and the comparison
- [`astro-entry.md`](./astro-entry.md) - the Astro entry's internals, including why a model change stops a reload
- [`language-scoped-validation.md`](./language-scoped-validation.md) - where the per-Project language narrowing comes from
- [`adding-a-field-type.md`](./adding-a-field-type.md) - the checklist a new field type follows
