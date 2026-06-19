# Language-Scoped Validation

How Core guarantees that translatable content - admin metadata and Entry values - carries exactly the languages a Project supports, both at runtime and in generated code. This is a design-level reference for the two-layer schema approach behind that guarantee.

For the field system this validates, see [`fields.md`](../docs/fields.md). For the Projects whose languages drive it, see [`concepts.md`](../docs/concepts.md).

## Problem

Translatable content was defined as `Partial<Record<SupportedLanguage, T>>`, making all 24 language keys optional. This meant:

- No runtime enforcement that a Project's supported languages are actually present
- No compile-time narrowing in generated code (CLI types, Astro integration)
- Developers always had to check for `undefined`, even for languages the Project supports

## Solution

Two layers of enforcement:

1. **Runtime validation** - a single `.validated()` call per public service method uses a language-aware strict schema that requires every Project-supported language key on translatable admin metadata and Entry values.
2. **Generated code** (CLI types, Astro) emits narrow `Record<ProjectLanguage, T>` types instead of `Partial<Record<SupportedLanguage, T>>`.

Core's exported TypeScript types remain broad (`Partial<Record<SupportedLanguage, T>>`) since Project languages are runtime data and cannot narrow static types.

## Architecture

### Two schema layers

There are two distinct schema layers for translatable content:

**Static schemas** (`baseSchema.ts`, `valueSchema.ts`) define the broad structural types used for file I/O, type exports, and the `.pipe()` step in dynamic schema generation. These use `z.partialRecord(supportedLanguageSchema, ...)` and accept any subset of the 24 supported languages.

**Strict entity schemas** (`strictEntitySchema.ts`) generate language-aware validation schemas at runtime using `z.record(z.enum(languages), ...)`. These require exactly the Project's supported languages to be present. Every factory in this file takes a required `languages: ProjectLanguages` parameter - a non-empty tuple type derived from the Project schema (`ProjectSettings['language']['supported']`) so the non-empty guarantee flows end-to-end without casts.

### Entry value validation flow

When an Entry is created or updated, validation happens in one pass:

```
Input data
    |
    v
Strict entity schema (z.record with Project languages)
  - Validates each field against its field definition
  - Enforces all Project language keys are present
  - Nullable content for optional fields (isRequired: false)
    |
    v
.pipe(z.record(slugSchema, valueSchema))
  - Re-validates through static valueSchema for type inference
  - Static schemas accept nullable content to accommodate optional fields
    |
    v
Validated output (typed as Record<string, Value>)
```

The `.pipe()` step exists purely for TypeScript type inference - it ensures the output type is `Record<string, Value>` rather than `Record<string, unknown>`. The static `valueSchema` must therefore accept nullable content values (see "Static value schemas accept nullable content" below).

### Admin metadata validation

Collection names, Component names, and field definition labels are validated using `.superRefine()` layered onto the existing static `createCollectionSchema` / `updateCollectionSchema` / `createComponentSchema` / `updateComponentSchema`. The refinement walks translatable admin fields and records a `ZodError` issue for any language key missing on any field:

```typescript
// In strictEntitySchema.ts
export function getCreateCollectionSchemaFromLanguages(
  languages: ProjectLanguages
) {
  const ts = strictTranslatableString(languages);
  return createCollectionSchema.superRefine((val, ctx) => {
    checkStrictTranslatable(val.name.singular, ts, ctx, ['name', 'singular']);
    checkStrictTranslatable(val.name.plural, ts, ctx, ['name', 'plural']);
    checkStrictTranslatable(val.description, ts, ctx, ['description']);
    for (const [i, fd] of flattenFieldDefinitions(
      val.fieldDefinitions
    ).entries()) {
      checkStrictTranslatable(fd.label, ts, ctx, [
        'fieldDefinitions',
        i,
        'label',
      ]);
      checkStrictTranslatable(
        fd.description,
        ts,
        ctx,
        ['fieldDefinitions', i, 'description'],
        true
      );
    }
  });
}
```

`.superRefine()` attaches to the existing schema (which is a `ZodEffects` once the internal `fieldDefinitionSlugUniquenessSuperRefinement` is added) without rewriting any field definition schema. Issue paths are preserved - a missing `de` key on `fieldDefinitions[2].label` reports at `['fieldDefinitions', 2, 'label', 'de']`. All issues aggregate into a single `ZodError`.

### Service-side preamble

Building the strict schema needs `languages` (and for entries, a `componentResolver`) - both runtime data that require async file reads. Each public service method hoists that async prep above `this.validated()` so the strict schema can be passed in directly:

```typescript
// CollectionService.create
const { projectId } = await this.parseOrThrow(
  'create',
  z.object({ projectId: uuidSchema }),
  props
);
const languages = await this.readProjectLanguages(projectId);

return this.validated(
  'create',
  getCreateCollectionSchemaFromLanguages(languages),
  props,
  async (validatedProps) => {
    /* domain logic */
  }
);
```

`parseOrThrow` (on `AbstractService`) and `readProjectFile` / `readProjectLanguages` (on `AbstractEntityService`) absorb the repeated preamble pattern.

### Generated code narrowing

The CLI type generator (`generateTypesAction.ts`) and Astro integration (`astro/schema.ts`) emit narrow types scoped to the Project's languages:

```typescript
// Generated types.ts
export type ProjectLanguage = 'en' | 'de';

// Entry values use narrowed content types
export interface BlogPostsValues {
  title: Omit<DirectStringValue, 'content'> & { content: Record<ProjectLanguage, string> };
}

// Collection and Component interfaces override translatable metadata
export type BlogPostsCollection = Omit<Collection, 'name' | 'description' | 'fieldDefinitions'> & {
  name: { singular: Record<ProjectLanguage, string>; plural: Record<ProjectLanguage, string> };
  description: Record<ProjectLanguage, string>;
  fieldDefinitions: [ ... ];
};
```

Values nested inside component items are narrowed too. The CLI generator emits a per-Component-per-field discriminated union for every dynamic field - both at the Collection level and inside Component value interfaces - so drilling into `xCollectionValues.blocks.content[0].values['<dynamic-field>'].content[0].values['<leaf>'].content` resolves to `Record<ProjectLanguage, T>`. The Astro integration emits named per-Component value types (`HeroComponentValues`) plus prefixed Item types (`BlogPostsBlocksItem`, `HeroSubBlocksItem`) referenced from a Zod discriminated union for `parseData` validation.

Item types use the same prefixing convention across both generators: collection-level dynamic fields produce `${CollectionPascal}${FieldPascal}Item`, and component-level dynamic fields produce `${ComponentPascal}${FieldPascal}Item`. If a referenced Component cannot be found in the Project, generation throws `Component "${id}" referenced by dynamic field "${slug}" not found in project` rather than silently emitting a permissive type.

The generated API client embeds the Project languages and passes them to `getEntrySchemaFromFieldDefinitions()` for strict runtime validation of API responses.

## Key design decisions

### Why static types remain broad

Project languages are runtime data (`project.settings.language.supported`). TypeScript cannot narrow types based on runtime values, so Core's exported types like `Collection`, `Entry`, `DirectStringValue` stay as `Partial<Record<SupportedLanguage, T>>`. Only generated code (which writes source files) can emit literal unions like `'en' | 'de'`.

### Why `.superRefine()` instead of rewriting static schemas

Field definition schemas use `.refine()` / `.superRefine()` internally (min/max, default-in-options, slug uniqueness), producing `ZodEffects` that cannot be `.extend()`-ed. Rewriting the ~15 field definition schemas as language-parameterised factories would be invasive and gains nothing observable. `.superRefine()` appends validation onto any schema - including existing `ZodEffects` - so the strict factories layer language-completeness checks on top without touching the underlying structure.

### Why the async preamble lives above `validated()`

Building the strict schema requires runtime data (languages, and for entries the Collection + Component resolver) that must be read from disk. Hoisting those reads above `this.validated()` lets the fully-strict schema be passed in, giving each method a single validation pass. `parseOrThrow` handles the tiny pre-parse needed to extract IDs for the reads, producing the same error log + `CoreError.badRequest` wrapping as `validated()` does.

### Static value schemas accept nullable content

`directStringValueSchema` and `directNumberValueSchema` use `.nullable()` for their content values (e.g., `z.string().trim().min(1).nullable()`). This is because:

- String and number fields can be optional (`isRequired: false`), producing `{ en: null, de: null }` in the strict schema
- The `.pipe(z.record(slugSchema, valueSchema))` step re-validates through the static schema
- If the static schema rejected `null`, optional field values would fail the pipe

`directBooleanValueSchema` does NOT use `.nullable()` because boolean fields are always required (`isRequired: z.literal(true)` in `fieldSchema.ts`), so their content is never null.

The strict schema is what enforces required-ness: required fields use `z.string().trim().min(1)` (rejects null), optional fields use `z.string().trim().min(1).nullable()` (allows null). Data always passes through the strict schema first, so a required field with null content is rejected before reaching the pipe.

### `z.record` enforces key completeness in Zod 4

`z.record(z.enum(['en', 'de']), valueSchema)` in Zod 4:

- Requires both `en` and `de` to be present
- Rejects extra keys (e.g., `fr` if not in the enum)
- Validates each value against `valueSchema`

### Project supported languages are non-empty

`project.settings.language.supported` uses `.nonempty()` with `.check()` (not `.refine()`, which loses the non-empty tuple type). This ensures at least one language is always present.

## Files overview

| File                                      | Role                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/schema/strictEntitySchema.ts`        | All strict entity schema factories (Collection / Component / Entry × Create / Update) + `strictTranslatableRecordOf` / `strictTranslatableString` primitives + `checkStrictTranslatable` helper |
| `src/schema/schemaFromFieldDefinition.ts` | Low-level value-from-FD builders used by the strict entity factories                                                                                                                            |
| `src/schema/valueSchema.ts`               | Static value schemas with nullable content for pipe compatibility                                                                                                                               |
| `src/schema/projectSchema.ts`             | `.nonempty()` on supported languages array. Exports `ProjectLanguages` type used by every strict factory                                                                                        |
| `src/service/AbstractService.ts`          | `parseOrThrow` helper, `validated()` delegates to it                                                                                                                                            |
| `src/service/AbstractEntityService.ts`    | `readProjectFile` / `readProjectLanguages` helpers                                                                                                                                              |
| `src/service/EntryService.ts`             | Preamble reads Project + Collection + builds ComponentResolver, passes strict Entry schema to `validated()`                                                                                     |
| `src/service/CollectionService.ts`        | Preamble reads Project languages, passes strict Collection schema to `validated()`                                                                                                              |
| `src/service/ComponentService.ts`         | Preamble reads Project languages, passes strict Component schema to `validated()`                                                                                                               |
| `src/astro/schema.ts`                     | Emits `Record<ProjectLanguage, T>` in generated Astro types                                                                                                                                     |
| `src/cli/generateTypesAction.ts`          | Emits `ProjectLanguage` type and narrowed interfaces                                                                                                                                            |
| `src/cli/generateApiClientAction.ts`      | Embeds Project languages in generated API client                                                                                                                                                |

## Adding a new translatable field

If you add a new translatable field to a schema (e.g., a new `subtitle` on Collections):

1. Add it to the static schema as usual (`partialTranslatableStringSchema` or `.nullable()` variant)
2. Add a `checkStrictTranslatable` call for it in the relevant factory in `strictEntitySchema.ts` (or in the shared `checkCollectionAdminMetadata` / `checkComponentAdminMetadata` helper)
3. Update `generateTypesAction.ts` if the field should appear in generated narrow types

## See Also

- [`fields.md`](../docs/fields.md) - the field system and translatable Value shapes
- [`concepts.md`](../docs/concepts.md) - Projects and their supported languages
- [`api-clients.md`](../docs/api-clients.md) - the narrowed types and clients this enables
- [`error-handling.md`](../docs/error-handling.md) - how validation failures surface as `CoreError`
