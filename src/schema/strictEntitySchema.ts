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
import { type SupportedLanguage } from './baseSchema.js';
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
import { flattenFieldDefinitions } from './fieldSchema.js';
import {
  type ComponentResolver,
  getValuesSchema,
} from './schemaFromFieldDefinition.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function strictTranslatableRecordOf<T extends z.ZodTypeAny>(
  schema: T,
  languages: SupportedLanguage[]
) {
  return z.record(
    z.enum(languages as [SupportedLanguage, ...SupportedLanguage[]]),
    schema
  );
}

/**
 * A record that must contain every project-supported language with a
 * non-empty string value.
 */
export function strictTranslatableString(languages: SupportedLanguage[]) {
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

function checkCollectionAdminMetadata(
  val: z.infer<typeof createCollectionSchema>,
  ctx: z.RefinementCtx,
  ts: z.ZodTypeAny
) {
  checkStrictTranslatable(val.name.singular, ts, ctx, ['name', 'singular']);
  checkStrictTranslatable(val.name.plural, ts, ctx, ['name', 'plural']);
  checkStrictTranslatable(val.description, ts, ctx, ['description']);
  for (const [i, fd] of flattenFieldDefinitions(
    val.fieldDefinitions
  ).entries()) {
    checkStrictTranslatable(fd.label, ts, ctx, ['fieldDefinitions', i, 'label']);
    checkStrictTranslatable(
      fd.description,
      ts,
      ctx,
      ['fieldDefinitions', i, 'description'],
      true
    );
  }
}

function checkComponentAdminMetadata(
  val: z.infer<typeof createComponentSchema>,
  ctx: z.RefinementCtx,
  ts: z.ZodTypeAny
) {
  checkStrictTranslatable(val.name, ts, ctx, ['name']);
  checkStrictTranslatable(val.description, ts, ctx, ['description'], true);
  for (const [i, fd] of val.fieldDefinitions.entries()) {
    checkStrictTranslatable(fd.label, ts, ctx, ['fieldDefinitions', i, 'label']);
    checkStrictTranslatable(
      fd.description,
      ts,
      ctx,
      ['fieldDefinitions', i, 'description'],
      true
    );
  }
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export function getCreateCollectionSchemaFromLanguages(
  languages: SupportedLanguage[]
) {
  const ts = strictTranslatableString(languages);
  return createCollectionSchema.superRefine((val, ctx) => {
    checkCollectionAdminMetadata(val, ctx, ts);
  });
}

export function getUpdateCollectionSchemaFromLanguages(
  languages: SupportedLanguage[]
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
  languages: SupportedLanguage[]
) {
  const ts = strictTranslatableString(languages);
  return createComponentSchema.superRefine((val, ctx) => {
    checkComponentAdminMetadata(val, ctx, ts);
  });
}

export function getUpdateComponentSchemaFromLanguages(
  languages: SupportedLanguage[]
) {
  const ts = strictTranslatableString(languages);
  return updateComponentSchema.superRefine((val, ctx) => {
    checkComponentAdminMetadata(val, ctx, ts);
  });
}

// ---------------------------------------------------------------------------
// Entry (moved from schemaFromFieldDefinition.ts — bodies unchanged)
// ---------------------------------------------------------------------------

export function getEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  languages: SupportedLanguage[],
  componentResolver?: ComponentResolver
) {
  return z.object({
    ...entrySchema.shape,
    values: getValuesSchema(fieldDefinitions, languages, componentResolver),
  });
}

export function getCreateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  languages: SupportedLanguage[],
  componentResolver?: ComponentResolver
) {
  return z.object({
    ...createEntrySchema.shape,
    values: getValuesSchema(fieldDefinitions, languages, componentResolver),
  });
}

export function getUpdateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  languages: SupportedLanguage[],
  componentResolver?: ComponentResolver
) {
  return z.object({
    ...updateEntrySchema.shape,
    values: getValuesSchema(fieldDefinitions, languages, componentResolver),
  });
}
