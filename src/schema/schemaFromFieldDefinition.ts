/**
 * Dynamic zod schema generation
 *
 * Altough everything is already strictly typed, a type of string might not be an email or text of a certain length.
 * To validate this, we need to generate zod schemas based on Field definitions the user created.
 */

import z from 'zod';
import { supportedLanguageSchema } from './baseSchema.js';
import { createEntrySchema, updateEntrySchema } from './entrySchema.js';
import {
  AssetFieldDefinition,
  EntryFieldDefinition,
  FieldDefinition,
  FieldTypeSchema,
  NumberFieldDefinition,
  RangeFieldDefinition,
  StringFieldDefinition,
} from './fieldSchema.js';
import {
  directBooleanValueSchema,
  directNumberValueSchema,
  directStringValueSchema,
  referencedValueSchema,
  Value,
  valueContentReferenceToAssetSchema,
  valueContentReferenceToEntrySchema,
  ValueTypeSchema,
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
  fieldDefinition: NumberFieldDefinition | RangeFieldDefinition
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
    case FieldTypeSchema.enum.email:
      schema = z.email();
      break;
    case FieldTypeSchema.enum.url:
      schema = z.url();
      break;
    case FieldTypeSchema.enum.ipv4:
      schema = z.ipv4();
      break;
    case FieldTypeSchema.enum.date:
      schema = z.iso.date();
      break;
    case FieldTypeSchema.enum.time:
      schema = z.iso.time();
      break;
    case FieldTypeSchema.enum.datetime:
      schema = z.iso.datetime();
      break;
    case FieldTypeSchema.enum.telephone:
      schema = z.e164();
      break;
    case FieldTypeSchema.enum.text:
    case FieldTypeSchema.enum.textarea:
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

  return schema.min(1, 'shared.stringValueRequired'); // @see https://github.com/colinhacks/zod/issues/2466
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
    case FieldTypeSchema.enum.asset:
      {
        schema = z.array(valueContentReferenceToAssetSchema);
      }
      break;
    case FieldTypeSchema.enum.entry:
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
    schema = schema.min(1, 'shared.referenceRequired');
  }

  if (fieldDefinition.min) {
    schema = schema.min(fieldDefinition.min);
  }

  if (fieldDefinition.max) {
    schema = schema.max(fieldDefinition.max);
  }

  return schema;
}

function getTranslatableStringValueContentSchemaFromFieldDefinition(
  fieldDefinition: StringFieldDefinition
) {
  return z.partialRecord(
    supportedLanguageSchema,
    getStringValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

function getTranslatableNumberValueContentSchemaFromFieldDefinition(
  fieldDefinition: NumberFieldDefinition | RangeFieldDefinition
) {
  return z.partialRecord(
    supportedLanguageSchema,
    getNumberValueContentSchemaFromFieldDefinition(fieldDefinition)
  );
}

function getTranslatableBooleanValueContentSchemaFromFieldDefinition() {
  return z.partialRecord(
    supportedLanguageSchema,
    getBooleanValueContentSchemaFromFieldDefinition()
  );
}

function getTranslatableReferenceValueContentSchemaFromFieldDefinition(
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
    case ValueTypeSchema.enum.boolean:
      return directBooleanValueSchema.extend({
        content: getTranslatableBooleanValueContentSchemaFromFieldDefinition(),
      });
    case ValueTypeSchema.enum.number:
      return directNumberValueSchema.extend({
        content:
          getTranslatableNumberValueContentSchemaFromFieldDefinition(
            fieldDefinition
          ),
      });
    case ValueTypeSchema.enum.string:
      return directStringValueSchema.extend({
        content:
          getTranslatableStringValueContentSchemaFromFieldDefinition(
            fieldDefinition
          ),
      });
    case ValueTypeSchema.enum.reference:
      return referencedValueSchema.extend({
        content:
          getTranslatableReferenceValueContentSchemaFromFieldDefinition(
            fieldDefinition
          ),
      });
    default:
      throw new Error(
        // @ts-expect-error
        `Error generating schema for unsupported ValueType "${fieldDefinition.valueType}"`
      );
  }
}

/**
 * Generates a schema for creating a new Entry based on the given Field definitions and Values
 */
export function getCreateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  values: Value[]
) {
  return {
    ...createEntrySchema,
    values: values.map((value) => {
      const fieldDefinition = fieldDefinitions.find(
        (fieldDefinition) => fieldDefinition.id === value.fieldDefinitionId
      );
      if (!fieldDefinition) {
        throw new Error(
          `Field definition with ID "${value.fieldDefinitionId}" not found`
        );
      }

      return getValueSchemaFromFieldDefinition(fieldDefinition);
    }),
  };
}

/**
 * Generates a schema for updating an existing Entry based on the given Field definitions and Values
 */
export function getUpdateEntrySchemaFromFieldDefinitions(
  fieldDefinitions: FieldDefinition[],
  values: Value[]
) {
  return {
    ...updateEntrySchema,
    values: values.map((value) => {
      const fieldDefinition = fieldDefinitions.find(
        (fieldDefinition) => fieldDefinition.id === value.fieldDefinitionId
      );
      if (!fieldDefinition) {
        throw new Error(
          `Field definition with ID "${value.fieldDefinitionId}" not found`
        );
      }

      return getValueSchemaFromFieldDefinition(fieldDefinition);
    }),
  };
}
