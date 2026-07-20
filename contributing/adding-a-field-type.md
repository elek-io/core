# Adding a Field Type

How to add a new field type to Core. Field types are declared in code, there is no plugin or marketplace system. For the consumer-facing field reference, see [`../docs/fields.md`](../docs/fields.md).

To add a field type:

1. Add the identifier to the `fieldTypeSchema` enum in `src/schema/fieldSchema.ts`.
2. Define the field's Zod schema, extending the appropriate base (`stringFieldDefinitionBaseSchema`, `numberFieldDefinitionBaseSchema`, `referenceFieldDefinitionBaseSchema`, or `fieldDefinitionBaseSchema` directly). A per-field rule belongs on the lowest schema that declares every key it reads, so each field type inherits the rules that apply to it. The string base carries "a unique field cannot have a default value", the number base carries "min must be less than or equal to max" and "the default value must be within the range". Rules that read a key only some types declare (string length bounds, select options) stay on those types. Because those rules are refinements and zod refuses to overwrite a key on a refined schema through `.extend()`, narrowing an inherited key (a stricter `defaultValue`, for example) needs `.safeExtend()`.
3. Add the new schema to the relevant union (`stringFieldDefinitionSchema` / `directFieldDefinitionSchema` / `referenceFieldDefinitionSchema`) and to `fieldDefinitionSchema` if it introduces a new top-level branch.
4. Update `src/schema/schemaFromFieldDefinition.ts` to handle the new field type when generating runtime value validation.
5. Add a migration step if existing Projects need their field definitions transformed (see [`migration-and-history-flow.md`](./migration-and-history-flow.md)).
6. Update CLI/Astro generators if the new field type changes the emitted client types.
