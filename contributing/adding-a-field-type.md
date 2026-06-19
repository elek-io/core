# Adding a Field Type

How to add a new field type to Core. Field types are declared in code, there is no plugin or marketplace system. For the consumer-facing field reference, see [`../docs/fields.md`](../docs/fields.md).

To add a field type:

1. Add the identifier to the `fieldTypeSchema` enum in `src/schema/fieldSchema.ts`.
2. Define the field's Zod schema, extending the appropriate base (`stringFieldDefinitionBaseSchema`, `numberFieldDefinitionBaseSchema`, `referenceFieldDefinitionBaseSchema`, or `fieldDefinitionBaseSchema` directly).
3. Add the new schema to the relevant union (`stringFieldDefinitionSchema` / `directFieldDefinitionSchema` / `referenceFieldDefinitionSchema`) and to `fieldDefinitionSchema` if it introduces a new top-level branch.
4. Update `src/schema/schemaFromFieldDefinition.ts` to handle the new field type when generating runtime value validation.
5. Add a migration step if existing Projects need their field definitions transformed (see [`migration-and-history-flow.md`](./migration-and-history-flow.md)).
6. Update CLI/Astro generators if the new field type changes the emitted client types.
