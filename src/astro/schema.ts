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
 * Each key is the field definition slug and each value schema
 * is the translatable content schema for that field type.
 */
export function buildEntryValuesSchema(fieldDefinitions: FieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const fieldDef of fieldDefinitions) {
    switch (fieldDef.valueType) {
      case ValueTypeSchema.enum.string:
        shape[fieldDef.slug] =
          getTranslatableStringValueContentSchemaFromFieldDefinition(fieldDef);
        break;
      case ValueTypeSchema.enum.number:
        shape[fieldDef.slug] =
          getTranslatableNumberValueContentSchemaFromFieldDefinition(fieldDef);
        break;
      case ValueTypeSchema.enum.boolean:
        shape[fieldDef.slug] =
          getTranslatableBooleanValueContentSchemaFromFieldDefinition();
        break;
      case ValueTypeSchema.enum.reference:
        shape[fieldDef.slug] =
          getTranslatableReferenceValueContentSchemaFromFieldDefinition(
            fieldDef
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
    `type SupportedLanguage = "bg" | "cs" | "da" | "de" | "el" | "en" | "es" | "et" | "fi" | "fr" | "hu" | "it" | "ja" | "ko" | "lt" | "lv" | "nb" | "nl" | "pl" | "pt" | "ro" | "ru" | "sk" | "sl" | "sv" | "tr" | "uk" | "zh";`,
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
    default:
      return 'unknown';
  }
}
