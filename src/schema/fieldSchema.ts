import { z } from 'zod';
import { translatableStringSchema, uuidSchema } from './baseSchema.js';
import {
  valueContentReferenceToAssetSchema,
  valueContentReferenceToEntrySchema,
  ValueTypeSchema,
} from './valueSchema.js';

export const FieldTypeSchema = z.enum([
  // String Values
  'text',
  'textarea',
  'email',
  // 'password', @todo maybe if there is a usecase
  'url',
  'ip',
  'date',
  'time',
  'datetime',
  'telephone',
  // Number Values
  'number',
  'range',
  // Boolean Values
  'toggle',
  // Reference Values
  'asset',
  'entry',
  // 'sharedValue', // @todo
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const FieldWidthSchema = z.enum(['12', '6', '4', '3']);

export const FieldDefinitionBaseSchema = z.object({
  id: uuidSchema.readonly(),
  label: translatableStringSchema,
  description: translatableStringSchema,
  isRequired: z.boolean(),
  isDisabled: z.boolean(),
  isUnique: z.boolean(),
  inputWidth: FieldWidthSchema,
});
export type FieldDefinitionBase = z.infer<typeof FieldDefinitionBaseSchema>;

/**
 * String based Field definitions
 */

export const StringFieldDefinitionBaseSchema = FieldDefinitionBaseSchema.extend(
  {
    valueType: z.literal(ValueTypeSchema.Enum.string),
    defaultValue: z.string().nullable(),
  }
);

export const textFieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(FieldTypeSchema.Enum.text),
    min: z.number().nullable(),
    max: z.number().nullable(),
  }
);
export type TextFieldDefinition = z.infer<typeof textFieldDefinitionSchema>;

export const textareaFieldDefinitionSchema =
  StringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.Enum.textarea),
    min: z.number().nullable(),
    max: z.number().nullable(),
  });
export type TextareaFieldDefinition = z.infer<
  typeof textareaFieldDefinitionSchema
>;

export const emailFieldDefinitionSchema =
  StringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.Enum.email),
    defaultValue: z.string().email().nullable(),
  });
export type EmailFieldDefinition = z.infer<typeof emailFieldDefinitionSchema>;

// @todo why should we support password Values? Client saves it in clear text anyways
// export const passwordFieldDefinitionSchema =
//   StringFieldDefinitionBaseSchema.extend({
//     fieldType: z.literal(FieldfieldTypeSchema.Enum.password),
//   });

export const urlFieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend({
  fieldType: z.literal(FieldTypeSchema.Enum.url),
  defaultValue: z.string().url().nullable(),
});
export type UrlFieldDefinition = z.infer<typeof urlFieldDefinitionSchema>;

export const ipFieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend({
  fieldType: z.literal(FieldTypeSchema.Enum.ip),
  defaultValue: z.string().ip().nullable(),
});
export type IpFieldDefinition = z.infer<typeof ipFieldDefinitionSchema>;

export const dateFieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(FieldTypeSchema.Enum.date),
    defaultValue: z.string().date().nullable(),
  }
);
export type DateFieldDefinition = z.infer<typeof dateFieldDefinitionSchema>;

export const timeFieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(FieldTypeSchema.Enum.time),
    defaultValue: z.string().time().nullable(),
  }
);
export type TimeFieldDefinition = z.infer<typeof timeFieldDefinitionSchema>;

export const datetimeFieldDefinitionSchema =
  StringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.Enum.datetime),
    defaultValue: z.string().datetime().nullable(),
  });
export type DatetimeFieldDefinition = z.infer<
  typeof datetimeFieldDefinitionSchema
>;

export const telephoneFieldDefinitionSchema =
  StringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.Enum.telephone),
    // defaultValue: z.string().e164(), @todo when zod v4 releases @see https://github.com/colinhacks/zod/pull/3476
  });
export type TelephoneFieldDefinition = z.infer<
  typeof telephoneFieldDefinitionSchema
>;

export const stringFieldDefinitionSchema = z.union([
  textFieldDefinitionSchema,
  textareaFieldDefinitionSchema,
  emailFieldDefinitionSchema,
  urlFieldDefinitionSchema,
  ipFieldDefinitionSchema,
  dateFieldDefinitionSchema,
  timeFieldDefinitionSchema,
  datetimeFieldDefinitionSchema,
  telephoneFieldDefinitionSchema,
]);
export type StringFieldDefinition = z.infer<typeof stringFieldDefinitionSchema>;

/**
 * Number based Field definitions
 */

export const NumberFieldDefinitionBaseSchema = FieldDefinitionBaseSchema.extend(
  {
    valueType: z.literal(ValueTypeSchema.Enum.number),
    min: z.number().nullable(),
    max: z.number().nullable(),
    isUnique: z.literal(false),
    defaultValue: z.number().nullable(),
  }
);

export const numberFieldDefinitionSchema =
  NumberFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.Enum.number),
  });
export type NumberFieldDefinition = z.infer<typeof numberFieldDefinitionSchema>;

export const rangeFieldDefinitionSchema =
  NumberFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.Enum.range),
    // Overwrite from nullable to required because a range needs min, max and default to work and is required, since it always returns a number
    isRequired: z.literal(true),
    min: z.number(),
    max: z.number(),
    defaultValue: z.number(),
  });
export type RangeFieldDefinition = z.infer<typeof rangeFieldDefinitionSchema>;

/**
 * Boolean based Field definitions
 */

export const BooleanFieldDefinitionBaseSchema =
  FieldDefinitionBaseSchema.extend({
    valueType: z.literal(ValueTypeSchema.Enum.boolean),
    // Overwrite from nullable to required because a boolean needs a default to work and is required, since it always is either true or false
    isRequired: z.literal(true),
    defaultValue: z.boolean(),
    isUnique: z.literal(false),
  });

export const toggleFieldDefinitionSchema =
  BooleanFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.Enum.toggle),
  });
export type ToggleFieldDefinition = z.infer<typeof toggleFieldDefinitionSchema>;

/**
 * Reference based Field definitions
 */

export const ReferenceFieldDefinitionBaseSchema =
  FieldDefinitionBaseSchema.extend({
    valueType: z.literal(ValueTypeSchema.Enum.reference),
  });

export const assetFieldDefinitionSchema =
  ReferenceFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.Enum.asset),
    min: z.number().nullable(),
    max: z.number().nullable(),
  });
export type AssetFieldDefinition = z.infer<typeof assetFieldDefinitionSchema>;

export const entryFieldDefinitionSchema =
  ReferenceFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.Enum.entry),
    ofCollections: z.array(uuidSchema),
    min: z.number().nullable(),
    max: z.number().nullable(),
  });
export type EntryFieldDefinition = z.infer<typeof entryFieldDefinitionSchema>;

// export const sharedValueDefinitionSchema =
//   ReferenceValueDefinitionBaseSchema.extend({
//     fieldType: z.literal(ValueInputTypeSchema.Enum.sharedValue),
//     // The shared Value can have any of the direct types
//     // but not any reference itself (a shared Value cannot have a reference to another shared Value / Asset or any other future reference)
//     sharedValueType: z.union([
//       z.literal(ValueTypeSchema.Enum.boolean),
//       z.literal(ValueTypeSchema.Enum.number),
//       z.literal(ValueTypeSchema.Enum.string),
//     ]),
//   });
// export type SharedValueValueDefinition = z.infer<
//   typeof sharedValueDefinitionSchema
// >;

export const fieldDefinitionSchema = z.union([
  stringFieldDefinitionSchema,
  numberFieldDefinitionSchema,
  rangeFieldDefinitionSchema,
  toggleFieldDefinitionSchema,
  assetFieldDefinitionSchema,
  entryFieldDefinitionSchema,
  // sharedValueDefinitionSchema,
]);
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

/**
 * Dynamic zod schema generation
 */

/**
 * Generates a zod schema to check a Values content, based on given Fields definition
 */
export function getValueContentSchemaFromFieldDefinition(
  fieldDefinition: FieldDefinition
) {
  switch (fieldDefinition.valueType) {
    case ValueTypeSchema.Enum.boolean:
      return getBooleanValueContentSchema();
    case ValueTypeSchema.Enum.number:
      return getNumberValueContentSchema(fieldDefinition);
    case ValueTypeSchema.Enum.string:
      return getStringValueContentSchema(fieldDefinition);
    case ValueTypeSchema.Enum.reference:
      return getReferenceValueContentSchema(fieldDefinition);
    default:
      throw new Error(
        // @ts-expect-error
        `Error generating schema for unsupported ValueType "${fieldDefinition.valueType}"`
      );
  }
}

function getBooleanValueContentSchema() {
  return z.boolean();
}

function getNumberValueContentSchema(
  definition: NumberFieldDefinition | RangeFieldDefinition
) {
  let schema = z.number();

  if (definition.min) {
    schema = schema.min(definition.min);
  }
  if (definition.max) {
    schema = schema.max(definition.max);
  }

  if (definition.isRequired === false) {
    return schema.nullable();
  }

  return schema;
}

function getStringValueContentSchema(definition: StringFieldDefinition) {
  let schema = z.string().trim(); // Additionally trim whitespace

  if ('min' in definition && definition.min) {
    schema = schema.min(definition.min);
  }
  if ('max' in definition && definition.max) {
    schema = schema.max(definition.max);
  }

  switch (definition.fieldType) {
    case FieldTypeSchema.Enum.email:
      schema = schema.email();
      break;
    case FieldTypeSchema.Enum.url:
      schema = schema.url();
      break;
    case FieldTypeSchema.Enum.ip:
      schema = schema.ip();
      break;
    case FieldTypeSchema.Enum.date:
      schema = schema.date();
      break;
    case FieldTypeSchema.Enum.time:
      schema = schema.time();
      break;
    case FieldTypeSchema.Enum.datetime:
      schema = schema.datetime();
      break;
    case FieldTypeSchema.Enum.telephone:
      // @todo z.string().e164() when zod v4 releases @see https://github.com/colinhacks/zod/pull/3476
      break;
  }

  if (definition.isRequired === false) {
    return schema.nullable();
  }

  return schema.min(1, 'shared.stringValueRequired'); // @see https://github.com/colinhacks/zod/issues/2466
}

function getReferenceValueContentSchema(
  definition: AssetFieldDefinition | EntryFieldDefinition // | SharedValueFieldDefinition
) {
  let schema;

  switch (definition.fieldType) {
    case FieldTypeSchema.Enum.asset:
      {
        schema = z.array(valueContentReferenceToAssetSchema);
      }
      break;
    case FieldTypeSchema.Enum.entry:
      {
        schema = z.array(valueContentReferenceToEntrySchema);
      }
      break;
    // case ValueInputTypeSchema.Enum.sharedValue: {
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

  if (definition.isRequired) {
    schema = schema.min(1, 'shared.referenceRequired');
  }

  if (definition.min) {
    schema = schema.min(definition.min);
  }

  if (definition.max) {
    schema = schema.max(definition.max);
  }

  return schema;
}
