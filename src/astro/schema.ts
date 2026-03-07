import { z } from '@hono/zod-openapi';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import {
  getTranslatableBooleanValueContentSchemaFromFieldDefinition,
  getTranslatableNumberValueContentSchemaFromFieldDefinition,
  getTranslatableReferenceValueContentSchemaFromFieldDefinition,
  getTranslatableStringValueContentSchemaFromFieldDefinition,
} from '../schema/schemaFromFieldDefinition.js';
import { ValueTypeSchema } from '../schema/valueSchema.js';

/**
 * Generates a flat Zod object schema from collection field definitions
 * for use with Astro's `parseData` validation.
 *
 * Each key is the field definition ID (UUID) and each value schema
 * is the translatable content schema for that field type.
 */
export function buildEntryValuesSchema(fieldDefinitions: FieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const fieldDef of fieldDefinitions) {
    switch (fieldDef.valueType) {
      case ValueTypeSchema.enum.string:
        shape[fieldDef.id] =
          getTranslatableStringValueContentSchemaFromFieldDefinition(fieldDef);
        break;
      case ValueTypeSchema.enum.number:
        shape[fieldDef.id] =
          getTranslatableNumberValueContentSchemaFromFieldDefinition(fieldDef);
        break;
      case ValueTypeSchema.enum.boolean:
        shape[fieldDef.id] =
          getTranslatableBooleanValueContentSchemaFromFieldDefinition();
        break;
      case ValueTypeSchema.enum.reference:
        shape[fieldDef.id] =
          getTranslatableReferenceValueContentSchemaFromFieldDefinition(
            fieldDef
          );
        break;
    }
  }

  return z.object(shape);
}
