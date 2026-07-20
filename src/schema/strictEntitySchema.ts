/**
 * Strict entity schemas
 *
 * High-level schema factories that return a language-strict Zod schema for a
 * given entity (Collection / Component / Entry). "Strict" here means every
 * translatable field (name, description, field definition label, etc.) must
 * carry a value for every project-supported language, not just a subset.
 *
 * Services read the project's supported languages above `this.validated()`
 * and pass the resulting schema to it, so the whole call site is a single
 * validation pass.
 */

import { z } from '@hono/zod-openapi';
import {
  createCollectionSchema,
  updateCollectionSchema,
} from './collectionSchema.js';
import {
  createComponentSchema,
  updateComponentSchema,
} from './componentSchema.js';
import {
  createEntrySchema,
  entrySchema,
  updateEntrySchema,
} from './entrySchema.js';
import type { FieldDefinition } from './fieldSchema.js';
import type { ProjectLanguages } from './projectSchema.js';
import {
  type ComponentResolver,
  getValuesSchema,
} from './schemaFromFieldDefinition.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function strictTranslatableRecordOf<T extends z.ZodTypeAny>(
  schema: T,
  languages: ProjectLanguages
) {
  return z.record(z.enum(languages), schema);
}

/**
 * A record that must contain every project-supported language with a
 * non-empty string value.
 */
export function strictTranslatableString(languages: ProjectLanguages) {
  return strictTranslatableRecordOf(z.string().trim().min(1), languages);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function checkStrictTranslatable(
  value: unknown,
  ts: z.ZodTypeAny,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  nullable = false
) {
  if (nullable && value === null) return;
  const result = ts.safeParse(value);
  if (result.success) return;
  for (const issue of result.error.issues) {
    ctx.addIssue({ ...issue, path: [...path, ...issue.path] });
  }
}

/**
 * Checks the translatable admin metadata every labelled node carries, be it a
 * Field definition or a group wrapping them.
 */
function checkLabelAndDescription(
  node: { label: unknown; description: unknown },
  ts: z.ZodTypeAny,
  ctx: z.RefinementCtx,
  path: (string | number)[]
) {
  checkStrictTranslatable(node.label, ts, ctx, [...path, 'label']);
  checkStrictTranslatable(
    node.description,
    ts,
    ctx,
    [...path, 'description'],
    true
  );
}

function checkCollectionAdminMetadata(
  val: z.infer<typeof createCollectionSchema>,
  ctx: z.RefinementCtx,
  ts: z.ZodTypeAny
) {
  checkStrictTranslatable(val.name.singular, ts, ctx, ['name', 'singular']);
  checkStrictTranslatable(val.name.plural, ts, ctx, ['name', 'plural']);
  checkStrictTranslatable(val.description, ts, ctx, ['description']);

  // Walked rather than flattened, so issues land on the definition the user
  // edited. A group's own label and description are admin metadata too.
  for (const [i, fdOrGroup] of val.fieldDefinitions.entries()) {
    checkLabelAndDescription(fdOrGroup, ts, ctx, ['fieldDefinitions', i]);
    if ('isGroup' in fdOrGroup) {
      for (const [j, fd] of fdOrGroup.fieldDefinitions.entries()) {
        checkLabelAndDescription(fd, ts, ctx, [
          'fieldDefinitions',
          i,
          'fieldDefinitions',
          j,
        ]);
      }
    }
  }
}

function checkComponentAdminMetadata(
  val: z.infer<typeof createComponentSchema>,
  ctx: z.RefinementCtx,
  ts: z.ZodTypeAny
) {
  checkStrictTranslatable(val.name, ts, ctx, ['name']);
  checkStrictTranslatable(val.description, ts, ctx, ['description'], true);
  // Components hold a flat list, so the index is already the real path.
  for (const [i, fd] of val.fieldDefinitions.entries()) {
    checkLabelAndDescription(fd, ts, ctx, ['fieldDefinitions', i]);
  }
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export function getCreateCollectionSchemaFromLanguages(
  languages: ProjectLanguages
) {
  const ts = strictTranslatableString(languages);
  return createCollectionSchema.superRefine((val, ctx) => {
    checkCollectionAdminMetadata(val, ctx, ts);
  });
}

export function getUpdateCollectionSchemaFromLanguages(
  languages: ProjectLanguages
) {
  const ts = strictTranslatableString(languages);
  return updateCollectionSchema.superRefine((val, ctx) => {
    checkCollectionAdminMetadata(val, ctx, ts);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function getCreateComponentSchemaFromLanguages(
  languages: ProjectLanguages
) {
  const ts = strictTranslatableString(languages);
  return createComponentSchema.superRefine((val, ctx) => {
    checkComponentAdminMetadata(val, ctx, ts);
  });
}

export function getUpdateComponentSchemaFromLanguages(
  languages: ProjectLanguages
) {
  const ts = strictTranslatableString(languages);
  return updateComponentSchema.superRefine((val, ctx) => {
    checkComponentAdminMetadata(val, ctx, ts);
  });
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function getEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  languages: ProjectLanguages,
  componentResolver?: ComponentResolver
) {
  return z.object({
    ...entrySchema.shape,
    values: getValuesSchema(fieldDefinitions, languages, componentResolver),
  });
}

export function getCreateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  languages: ProjectLanguages,
  componentResolver?: ComponentResolver
) {
  return z.object({
    ...createEntrySchema.shape,
    values: getValuesSchema(fieldDefinitions, languages, componentResolver),
  });
}

export function getUpdateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  languages: ProjectLanguages,
  componentResolver?: ComponentResolver
) {
  return z.object({
    ...updateEntrySchema.shape,
    values: getValuesSchema(fieldDefinitions, languages, componentResolver),
  });
}
