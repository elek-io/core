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
  'ipv4',
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
    valueType: z.literal(ValueTypeSchema.enum.string),
    defaultValue: z.string().nullable(),
  }
);

export const textFieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(FieldTypeSchema.enum.text),
    min: z.number().nullable(),
    max: z.number().nullable(),
  }
);
export type TextFieldDefinition = z.infer<typeof textFieldDefinitionSchema>;

export const textareaFieldDefinitionSchema =
  StringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.enum.textarea),
    min: z.number().nullable(),
    max: z.number().nullable(),
  });
export type TextareaFieldDefinition = z.infer<
  typeof textareaFieldDefinitionSchema
>;

export const emailFieldDefinitionSchema =
  StringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.enum.email),
    defaultValue: z.email().nullable(),
  });
export type EmailFieldDefinition = z.infer<typeof emailFieldDefinitionSchema>;

// @todo why should we support password Values? Client saves it in clear text anyways
// export const passwordFieldDefinitionSchema =
//   StringFieldDefinitionBaseSchema.extend({
//     fieldType: z.literal(FieldfieldTypeSchema.enum.password),
//   });

export const urlFieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend({
  fieldType: z.literal(FieldTypeSchema.enum.url),
  defaultValue: z.url().nullable(),
});
export type UrlFieldDefinition = z.infer<typeof urlFieldDefinitionSchema>;

export const ipv4FieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(FieldTypeSchema.enum.ipv4),
    defaultValue: z.ipv4().nullable(),
  }
);
export type Ipv4FieldDefinition = z.infer<typeof ipv4FieldDefinitionSchema>;

export const dateFieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(FieldTypeSchema.enum.date),
    defaultValue: z.iso.date().nullable(),
  }
);
export type DateFieldDefinition = z.infer<typeof dateFieldDefinitionSchema>;

export const timeFieldDefinitionSchema = StringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(FieldTypeSchema.enum.time),
    defaultValue: z.iso.time().nullable(),
  }
);
export type TimeFieldDefinition = z.infer<typeof timeFieldDefinitionSchema>;

export const datetimeFieldDefinitionSchema =
  StringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.enum.datetime),
    defaultValue: z.iso.datetime().nullable(),
  });
export type DatetimeFieldDefinition = z.infer<
  typeof datetimeFieldDefinitionSchema
>;

export const telephoneFieldDefinitionSchema =
  StringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.enum.telephone),
    defaultValue: z.e164().nullable(),
  });
export type TelephoneFieldDefinition = z.infer<
  typeof telephoneFieldDefinitionSchema
>;

export const stringFieldDefinitionSchema = z.union([
  textFieldDefinitionSchema,
  textareaFieldDefinitionSchema,
  emailFieldDefinitionSchema,
  urlFieldDefinitionSchema,
  ipv4FieldDefinitionSchema,
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
    valueType: z.literal(ValueTypeSchema.enum.number),
    min: z.number().nullable(),
    max: z.number().nullable(),
    isUnique: z.literal(false),
    defaultValue: z.number().nullable(),
  }
);

export const numberFieldDefinitionSchema =
  NumberFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.enum.number),
  });
export type NumberFieldDefinition = z.infer<typeof numberFieldDefinitionSchema>;

export const rangeFieldDefinitionSchema =
  NumberFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.enum.range),
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
    valueType: z.literal(ValueTypeSchema.enum.boolean),
    // Overwrite from nullable to required because a boolean needs a default to work and is required, since it always is either true or false
    isRequired: z.literal(true),
    defaultValue: z.boolean(),
    isUnique: z.literal(false),
  });

export const toggleFieldDefinitionSchema =
  BooleanFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.enum.toggle),
  });
export type ToggleFieldDefinition = z.infer<typeof toggleFieldDefinitionSchema>;

/**
 * Reference based Field definitions
 */

export const ReferenceFieldDefinitionBaseSchema =
  FieldDefinitionBaseSchema.extend({
    valueType: z.literal(ValueTypeSchema.enum.reference),
  });

export const assetFieldDefinitionSchema =
  ReferenceFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.enum.asset),
    min: z.number().nullable(),
    max: z.number().nullable(),
  });
export type AssetFieldDefinition = z.infer<typeof assetFieldDefinitionSchema>;

export const entryFieldDefinitionSchema =
  ReferenceFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(FieldTypeSchema.enum.entry),
    ofCollections: z.array(uuidSchema),
    min: z.number().nullable(),
    max: z.number().nullable(),
  });
export type EntryFieldDefinition = z.infer<typeof entryFieldDefinitionSchema>;

// export const sharedValueDefinitionSchema =
//   ReferenceValueDefinitionBaseSchema.extend({
//     fieldType: z.literal(ValueInputTypeSchema.enum.sharedValue),
//     // The shared Value can have any of the direct types
//     // but not any reference itself (a shared Value cannot have a reference to another shared Value / Asset or any other future reference)
//     sharedValueType: z.union([
//       z.literal(ValueTypeSchema.enum.boolean),
//       z.literal(ValueTypeSchema.enum.number),
//       z.literal(ValueTypeSchema.enum.string),
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
    case ValueTypeSchema.enum.boolean:
      return getBooleanValueContentSchema();
    case ValueTypeSchema.enum.number:
      return getNumberValueContentSchema(fieldDefinition);
    case ValueTypeSchema.enum.string:
      return getStringValueContentSchema(fieldDefinition);
    case ValueTypeSchema.enum.reference:
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
  let schema = null;

  switch (definition.fieldType) {
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

  if ('min' in definition && definition.min) {
    schema = schema.min(definition.min);
  }
  if ('max' in definition && definition.max) {
    schema = schema.max(definition.max);
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
