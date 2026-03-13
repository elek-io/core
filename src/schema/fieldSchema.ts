import { z } from '@hono/zod-openapi';
import {
  slugSchema,
  translatableStringSchema,
  uuidSchema,
} from './baseSchema.js';
import { valueTypeSchema } from './valueSchema.js';

export const fieldTypeSchema = z.enum([
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
  // Select Values (string or number)
  'select',
  // Reference Values
  'asset',
  'entry',
  // 'sharedValue', // @todo
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const fieldWidthSchema = z.enum(['12', '6', '4', '3']);

/**
 * Shared select helpers reused by both string and number select schemas
 */
const selectOptionSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({ value: valueSchema, label: translatableStringSchema });

const selectDefaultValueRefinement: [
  (data: {
    defaultValue: string | number | null;
    options: { value: string | number }[];
  }) => boolean,
  { message: string; path: string[] },
] = [
  (data) =>
    data.defaultValue === null ||
    data.options.some((o) => o.value === data.defaultValue),
  {
    message: 'defaultValue must be one of the defined options',
    path: ['defaultValue'],
  },
];

/**
 * Base Field definition
 * Contains all common properties across all Field definitions
 */
export const fieldDefinitionBaseSchema = z.object({
  id: uuidSchema.readonly(),
  slug: slugSchema,
  label: translatableStringSchema,
  description: translatableStringSchema.nullable(),
  isRequired: z.boolean(),
  isDisabled: z.boolean(),
  isUnique: z.boolean(),
  inputWidth: fieldWidthSchema,
});
export type FieldDefinitionBase = z.infer<typeof fieldDefinitionBaseSchema>;

/**
 * String based Field definitions
 */

export const stringFieldDefinitionBaseSchema = fieldDefinitionBaseSchema.extend(
  {
    valueType: z.literal(valueTypeSchema.enum.string),
    defaultValue: z.string().nullable(),
  }
);

export const textFieldDefinitionSchema = stringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(fieldTypeSchema.enum.text),
    min: z.number().nullable(),
    max: z.number().nullable(),
  }
);
export type TextFieldDefinition = z.infer<typeof textFieldDefinitionSchema>;

export const textareaFieldDefinitionSchema =
  stringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.textarea),
    min: z.number().nullable(),
    max: z.number().nullable(),
  });
export type TextareaFieldDefinition = z.infer<
  typeof textareaFieldDefinitionSchema
>;

export const emailFieldDefinitionSchema =
  stringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.email),
    defaultValue: z.email().nullable(),
  });
export type EmailFieldDefinition = z.infer<typeof emailFieldDefinitionSchema>;

// @todo why should we support password Values? Client saves it in clear text anyways
// export const passwordFieldDefinitionSchema =
//   stringFieldDefinitionBaseSchema.extend({
//     fieldType: z.literal(FieldfieldTypeSchema.enum.password),
//   });

export const urlFieldDefinitionSchema = stringFieldDefinitionBaseSchema.extend({
  fieldType: z.literal(fieldTypeSchema.enum.url),
  defaultValue: z.url().nullable(),
});
export type UrlFieldDefinition = z.infer<typeof urlFieldDefinitionSchema>;

export const ipv4FieldDefinitionSchema = stringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(fieldTypeSchema.enum.ipv4),
    defaultValue: z.ipv4().nullable(),
  }
);
export type Ipv4FieldDefinition = z.infer<typeof ipv4FieldDefinitionSchema>;

export const dateFieldDefinitionSchema = stringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(fieldTypeSchema.enum.date),
    defaultValue: z.iso.date().nullable(),
  }
);
export type DateFieldDefinition = z.infer<typeof dateFieldDefinitionSchema>;

export const timeFieldDefinitionSchema = stringFieldDefinitionBaseSchema.extend(
  {
    fieldType: z.literal(fieldTypeSchema.enum.time),
    defaultValue: z.iso.time().nullable(),
  }
);
export type TimeFieldDefinition = z.infer<typeof timeFieldDefinitionSchema>;

export const datetimeFieldDefinitionSchema =
  stringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.datetime),
    defaultValue: z.iso.datetime().nullable(),
  });
export type DatetimeFieldDefinition = z.infer<
  typeof datetimeFieldDefinitionSchema
>;

export const telephoneFieldDefinitionSchema =
  stringFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.telephone),
    defaultValue: z.e164().nullable(),
  });
export type TelephoneFieldDefinition = z.infer<
  typeof telephoneFieldDefinitionSchema
>;

export const stringSelectFieldDefinitionSchema = stringFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.select),
    options: z.array(selectOptionSchema(z.string())).min(1),
  })
  .refine(...selectDefaultValueRefinement);
export type StringSelectFieldDefinition = z.infer<
  typeof stringSelectFieldDefinitionSchema
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
  stringSelectFieldDefinitionSchema,
]);
export type StringFieldDefinition = z.infer<typeof stringFieldDefinitionSchema>;

/**
 * Number based Field definitions
 */

export const numberFieldDefinitionBaseSchema = fieldDefinitionBaseSchema.extend(
  {
    valueType: z.literal(valueTypeSchema.enum.number),
    min: z.number().nullable(),
    max: z.number().nullable(),
    isUnique: z.literal(false),
    defaultValue: z.number().nullable(),
  }
);

export const numberFieldDefinitionSchema =
  numberFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.number),
  });
export type NumberFieldDefinition = z.infer<typeof numberFieldDefinitionSchema>;

export const rangeFieldDefinitionSchema =
  numberFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.range),
    // Overwrite from nullable to required because a range needs min, max and default to work and is required, since it always returns a number
    isRequired: z.literal(true),
    min: z.number(),
    max: z.number(),
    defaultValue: z.number(),
  });
export type RangeFieldDefinition = z.infer<typeof rangeFieldDefinitionSchema>;

export const numberSelectFieldDefinitionSchema = numberFieldDefinitionBaseSchema
  .extend({
    fieldType: z.literal(fieldTypeSchema.enum.select),
    options: z.array(selectOptionSchema(z.number())).min(1),
    // min/max don't apply to a fixed option list
    min: z.literal(null),
    max: z.literal(null),
  })
  .refine(...selectDefaultValueRefinement);
export type NumberSelectFieldDefinition = z.infer<
  typeof numberSelectFieldDefinitionSchema
>;

/**
 * Boolean based Field definitions
 */

export const booleanFieldDefinitionBaseSchema =
  fieldDefinitionBaseSchema.extend({
    valueType: z.literal(valueTypeSchema.enum.boolean),
    // Overwrite from nullable to required because a boolean needs a default to work and is required, since it always is either true or false
    isRequired: z.literal(true),
    defaultValue: z.boolean(),
    isUnique: z.literal(false),
  });

export const toggleFieldDefinitionSchema =
  booleanFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.toggle),
  });
export type ToggleFieldDefinition = z.infer<typeof toggleFieldDefinitionSchema>;

/**
 * Reference based Field definitions
 */

export const referenceFieldDefinitionBaseSchema =
  fieldDefinitionBaseSchema.extend({
    valueType: z.literal(valueTypeSchema.enum.reference),
    isUnique: z.literal(false),
  });

export const assetFieldDefinitionSchema =
  referenceFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.asset),
    min: z.number().nullable(),
    max: z.number().nullable(),
  });
export type AssetFieldDefinition = z.infer<typeof assetFieldDefinitionSchema>;

export const entryFieldDefinitionSchema =
  referenceFieldDefinitionBaseSchema.extend({
    fieldType: z.literal(fieldTypeSchema.enum.entry),
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
//       z.literal(valueTypeSchema.enum.boolean),
//       z.literal(valueTypeSchema.enum.number),
//       z.literal(valueTypeSchema.enum.string),
//     ]),
//   });
// export type SharedValueValueDefinition = z.infer<
//   typeof sharedValueDefinitionSchema
// >;

export const fieldDefinitionSchema = z.union([
  stringFieldDefinitionSchema,
  numberFieldDefinitionSchema,
  rangeFieldDefinitionSchema,
  numberSelectFieldDefinitionSchema,
  toggleFieldDefinitionSchema,
  assetFieldDefinitionSchema,
  entryFieldDefinitionSchema,
  // sharedValueDefinitionSchema,
]);
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
