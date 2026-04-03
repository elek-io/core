import { z } from '@hono/zod-openapi';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import {
  getTranslatableBooleanValueContentSchemaFromFieldDefinition,
  getTranslatableNumberValueContentSchemaFromFieldDefinition,
  getTranslatableReferenceValueContentSchemaFromFieldDefinition,
  getTranslatableStringValueContentSchemaFromFieldDefinition,
} from '../schema/schemaFromFieldDefinition.js';
import { valueTypeSchema } from '../schema/valueSchema.js';
import { supportedLanguageSchema } from '../schema/baseSchema.js';

/**
 * Generates a flat Zod object schema from collection field definitions
 * for use with Astro's `parseData` validation.
 *
 * Each key is the field definition slug and each value schema
 * is the translatable content schema for that field type.
 */
export function buildEntryValuesSchema(fieldDefinitions: FieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const fieldDef of fieldDefinitions) {
    switch (fieldDef.valueType) {
      case valueTypeSchema.enum.string:
        shape[fieldDef.slug] =
          getTranslatableStringValueContentSchemaFromFieldDefinition(fieldDef);
        break;
      case valueTypeSchema.enum.number:
        shape[fieldDef.slug] =
          getTranslatableNumberValueContentSchemaFromFieldDefinition(fieldDef);
        break;
      case valueTypeSchema.enum.boolean:
        shape[fieldDef.slug] =
          getTranslatableBooleanValueContentSchemaFromFieldDefinition();
        break;
      case valueTypeSchema.enum.reference:
        shape[fieldDef.slug] =
          getTranslatableReferenceValueContentSchemaFromFieldDefinition(
            fieldDef
          );
        break;
      case valueTypeSchema.enum.component:
        shape[fieldDef.slug] = z.array(
          z.object({
            id: z.string(),
            componentId: z.string(),
            values: z.record(z.string(), z.unknown()),
          })
        );
        break;
    }
  }

  return z.object(shape);
}

/**
 * Generates a TypeScript type string from collection field definitions
 * for use with Astro's `createSchema` API.
 *
 * The generated string is written by Astro to a `.ts` file and imported
 * as the `Entry` type for the collection.
 */
export function buildEntryValuesTypeString(
  fieldDefinitions: FieldDefinition[]
): string {
  if (fieldDefinitions.length === 0) {
    return 'export type Entry = Record<string, never>;';
  }

  const fields = fieldDefinitions.map((fieldDef) => {
    const tsType = valueTypeToTsType(fieldDef.valueType);
    return `  "${fieldDef.slug}": Partial<Record<SupportedLanguage, ${tsType}>>`;
  });

  return [
    `type SupportedLanguage = ${supportedLanguageSchema.options.map((language) => `"${language}"`).join(' | ')};`,
    `export type Entry = {`,
    fields.join(';\n') + ';',
    `};`,
  ].join('\n');
}

function valueTypeToTsType(valueType: string): string {
  switch (valueType) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'reference':
      return 'Array<{ id: string; objectType: string }>';
    case 'component':
      return 'Array<{ id: string; componentId: string; values: Record<string, Partial<Record<SupportedLanguage, unknown>>> }>';
    default:
      return 'unknown';
  }
}
