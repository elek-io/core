/**
 * Dynamic zod schema generation
 *
 * Altough everything is already strictly typed, a type of string might not be an email or text of a certain length.
 * To validate this, we need to generate zod schemas based on Field definitions the user created.
 */

import { z } from '@hono/zod-openapi';
import { supportedLanguageSchema } from './baseSchema.js';
import {
  createEntrySchema,
  entrySchema,
  updateEntrySchema,
} from './entrySchema.js';
import type {
  AssetFieldDefinition,
  EntryFieldDefinition,
  FieldDefinition,
  NumberFieldDefinition,
  NumberSelectFieldDefinition,
  RangeFieldDefinition,
  StringFieldDefinition,
} from './fieldSchema.js';
import { fieldTypeSchema } from './fieldSchema.js';
import {
  directBooleanValueSchema,
  directNumberValueSchema,
  directStringValueSchema,
  referencedValueSchema,
  valueContentReferenceToAssetSchema,
  valueContentReferenceToEntrySchema,
  valueTypeSchema,
} from './valueSchema.js';

/**
 * Boolean Values are always either true or false, so we don't need the Field definition here
 */
function getBooleanValueContentSchemaFromFieldDefinition() {
  return z.boolean();
}

/**
 * Number Values can have min and max values and can be required or not
 */
function getNumberValueContentSchemaFromFieldDefinition(
  fieldDefinition:
    | NumberFieldDefinition
    | RangeFieldDefinition
    | NumberSelectFieldDefinition
) {
  let schema = z.number();

  if (fieldDefinition.min) {
    schema = schema.min(fieldDefinition.min);
  }
  if (fieldDefinition.max) {
    schema = schema.max(fieldDefinition.max);
  }

  if (fieldDefinition.isRequired === false) {
    return schema.nullable();
  }

  return schema;
}

/**
 * String Values can have different formats (email, url, ipv4, date, time, ...)
 * and can have min and max length and can be required or not
 */
function getStringValueContentSchemaFromFieldDefinition(
  fieldDefinition: StringFieldDefinition
) {
  let schema = null;

  switch (fieldDefinition.fieldType) {
    case fieldTypeSchema.enum.email:
      schema = z.email();
      break;
    case fieldTypeSchema.enum.url:
      schema = z.url();
      break;
    case fieldTypeSchema.enum.ipv4:
      schema = z.ipv4();
      break;
    case fieldTypeSchema.enum.date:
      schema = z.iso.date();
      break;
    case fieldTypeSchema.enum.time:
      schema = z.iso.time();
      break;
    case fieldTypeSchema.enum.datetime:
      schema = z.iso.datetime();
      break;
    case fieldTypeSchema.enum.telephone:
      schema = z.e164();
      break;
    case fieldTypeSchema.enum.text:
    case fieldTypeSchema.enum.textarea:
    case fieldTypeSchema.enum.select:
      schema = z.string().trim();
      break;
  }

  if ('min' in fieldDefinition && fieldDefinition.min) {
    schema = schema.min(fieldDefinition.min);
  }
  if ('max' in fieldDefinition && fieldDefinition.max) {
    schema = schema.max(fieldDefinition.max);
  }

  if (fieldDefinition.isRequired === false) {
    return schema.nullable();
  }

  return schema.min(1); // @see https://github.com/colinhacks/zod/issues/2466
}

/**
 * Reference Values can reference either Assets or Entries (or Shared Values in the future)
 * and can have min and max number of references and can be required or not
 */
function getReferenceValueContentSchemaFromFieldDefinition(
  fieldDefinition: AssetFieldDefinition | EntryFieldDefinition // | SharedValueFieldDefinition
) {
  let schema;

  switch (fieldDefinition.fieldType) {
    case fieldTypeSchema.enum.asset:
      {
        schema = z.array(valueContentReferenceToAssetSchema);
      }
      break;
    case fieldTypeSchema.enum.entry:
      {
        schema = z.array(valueContentReferenceToEntrySchema);
      }
      break;
    // case ValueInputTypeSchema.enum.sharedValue: {
    //   let schema = valueContentReferenceToSharedValueSchema.extend({}); // Deep copy to not overwrite the base schema
    //   if (definition.isRequired) {
    //     const requiredReferences = schema.shape.references.min(
    //       1,
    //       'shared.assetValueRequired'
    //     );
    //     schema = schema.extend({
    //       references: requiredReferences,
    //     });
    //   }
    //   return valueContentReferenceToSharedValueSchema;
    // }
  }

  if (fieldDefinition.isRequired) {
    schema = schema.min(1);
  }

  if (fieldDefinition.min) {
    schema = schema.min(fieldDefinition.min);
  }

  if (fieldDefinition.max) {
    schema = schema.max(fieldDefinition.max);
  }

  return schema;
}

export function getTranslatableStringValueContentSchemaFromFieldDefinition(
  fieldDefinition: StringFieldDefinition
) {
  return z.partialRecord(
    supportedLanguageSchema,
    getStringValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

export function getTranslatableNumberValueContentSchemaFromFieldDefinition(
  fieldDefinition:
    | NumberFieldDefinition
    | RangeFieldDefinition
    | NumberSelectFieldDefinition
) {
  return z.partialRecord(
    supportedLanguageSchema,
    getNumberValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

export function getTranslatableBooleanValueContentSchemaFromFieldDefinition() {
  return z.partialRecord(
    supportedLanguageSchema,
    getBooleanValueContentSchemaFromFieldDefinition()
  );
}

export function getTranslatableReferenceValueContentSchemaFromFieldDefinition(
  fieldDefinition: AssetFieldDefinition | EntryFieldDefinition
) {
  return z.partialRecord(
    supportedLanguageSchema,
    getReferenceValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

/**
 * Generates a zod schema to check a Value based on given Field definition
 */
export function getValueSchemaFromFieldDefinition(
  fieldDefinition: FieldDefinition
) {
  switch (fieldDefinition.valueType) {
    case valueTypeSchema.enum.boolean:
      return directBooleanValueSchema.extend({
        content: getTranslatableBooleanValueContentSchemaFromFieldDefinition(),
      });
    case valueTypeSchema.enum.number:
      return directNumberValueSchema.extend({
        content:
          getTranslatableNumberValueContentSchemaFromFieldDefinition(
            fieldDefinition
          ),
      });
    case valueTypeSchema.enum.string:
      return directStringValueSchema.extend({
        content:
          getTranslatableStringValueContentSchemaFromFieldDefinition(
            fieldDefinition
          ),
      });
    case valueTypeSchema.enum.reference:
      return referencedValueSchema.extend({
        content:
          getTranslatableReferenceValueContentSchemaFromFieldDefinition(
            fieldDefinition
          ),
      });
    default:
      throw new Error(
        // @ts-expect-error Code cannot be reached, but if we add a new ValueType and forget to update this function, we want to be notified about it
        `Error generating schema for unsupported ValueType "${fieldDefinition.valueType}"`
      );
  }
}

/**
 * Builds a z.object shape from field definitions, keyed by slug
 */
function getValuesShapeFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[]
) {
  const shape: Record<
    string,
    ReturnType<typeof getValueSchemaFromFieldDefinition>
  > = {};
  for (const fieldDef of fieldDefinitions) {
    shape[fieldDef.slug] = getValueSchemaFromFieldDefinition(fieldDef);
  }
  return shape;
}

/**
 * Generates a schema for an Entry based on the given Field definitions and Values
 */
export function getEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[]
) {
  return z.object({
    ...entrySchema.shape,
    values: z.object(getValuesShapeFromFieldDefinitions(fieldDefinitions)),
  });
}

/**
 * Generates a schema for creating a new Entry based on the given Field definitions and Values
 */
export function getCreateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[]
) {
  return z.object({
    ...createEntrySchema.shape,
    values: z.object(getValuesShapeFromFieldDefinitions(fieldDefinitions)),
  });
}

/**
 * Generates a schema for updating an existing Entry based on the given Field definitions and Values
 */
export function getUpdateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[]
) {
  return z.object({
    ...updateEntrySchema.shape,
    values: z.object(getValuesShapeFromFieldDefinitions(fieldDefinitions)),
  });
}
