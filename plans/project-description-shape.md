# Project description shape

`Project.description` is a required, single language string, while `Collection.description` and `Component.description` are translatable. The same person edits both in the same application. This is the one half of an old design question, captured in the test suite and answered "yes" inline, that never reached the schema.

## Current state

Verified in the schemas:

| Entity | Type today | Optional | Translatable |
| --- | --- | --- | --- |
| Collection | `partialTranslatableStringSchema` | no | yes |
| Component | `partialTranslatableStringSchema.nullable()` | yes | yes |
| Project | `z.string().trim().min(1)` | no | no |
| Asset | `z.string().trim().min(1)` | no | no |

Asset is deliberate and already documented. [`../docs/asset-management.md`](../docs/asset-management.md) states that an Asset's `name` and `description` are plain strings rather than translatable, because an Asset is a file rather than authored content.

Project has no such note and no such argument. It is the open question.

## What to do

1. Decide whether `Project.description` becomes `partialTranslatableStringSchema.nullable()`, matching Component, or stays as it is with the reason written into [`../docs/concepts.md`](../docs/concepts.md).
2. If it changes, the field sits in `projectFileSchema` (`src/schema/projectSchema.ts`), so every existing `project.json` needs a migration step that moves the current string under the Project's default language.
3. `createProjectSchema` and `updateProjectSchema` both pick `description`, so both move with it.
4. `docs/concepts.md` and `docs/usage.md` show `description` as a plain string in their examples.

## What it costs

A breaking change for every consumer that reads `project.description`, elek.io Desktop included, plus the first real migration. That is why it is a plan rather than a small fix.

Worth deciding alongside the same question for `Project.name`, which is a plain string for the same unexamined reason.

## See also

- [`../contributing/migration-and-history-flow.md`](../contributing/migration-and-history-flow.md) - the migration chain a shape change needs
- [`../contributing/language-scoped-validation.md`](../contributing/language-scoped-validation.md) - how a translatable field is made to carry the Project's languages
