import z from 'zod';
import { assetSchema, type Asset } from './assetSchema.js';
import {
  objectTypeSchema,
  translatableArrayOf,
  translatableBooleanSchema,
  translatableNumberSchema,
  translatableStringSchema,
  uuidSchema,
} from './baseSchema.js';
import { entrySchema, type Entry } from './entrySchema.js';

export const ValueTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'reference',
]);
export type ValueType = z.infer<typeof ValueTypeSchema>;

export const valueContentReferenceBase = z.object({
  id: uuidSchema,
});

export const valueContentReferenceToAssetSchema =
  valueContentReferenceBase.extend({
    objectType: z.literal(objectTypeSchema.Enum.asset),
  });
export type ValueContentReferenceToAsset = z.infer<
  typeof valueContentReferenceToAssetSchema
>;

export const valueContentReferenceToCollectionSchema =
  valueContentReferenceBase.extend({
    objectType: z.literal(objectTypeSchema.Enum.collection),
  });
export type ValueContentReferenceToCollection = z.infer<
  typeof valueContentReferenceToCollectionSchema
>;

export const valueContentReferenceToEntrySchema =
  valueContentReferenceBase.extend({
    objectType: z.literal(objectTypeSchema.Enum.entry),
  });
export type ValueContentReferenceToEntry = z.infer<
  typeof valueContentReferenceToEntrySchema
>;

// export const valueContentReferenceToSharedValueSchema = z.object({
//   referenceObjectType: z.literal(objectTypeSchema.Enum.sharedValue),
//   references: z.object({
//     id: uuidSchema,
//     language: supportedLanguageSchema,
//   }),
// });
// export type ValueContentReferenceToSharedValue = z.infer<
//   typeof valueContentReferenceToSharedValueSchema
// >;

// export const sharedValueFileSchema = baseFileWithLanguageSchema.extend({
//   objectType: z.literal(objectTypeSchema.Enum.sharedValue).readonly(),
//   valueType: ValueTypeSchema.exclude(['reference']).readonly(),
//   // valueType: ValueTypeSchema.readonly(), @todo do we allow shared Values to reference assets or others?
//   content: z.union([
//     z.string(),
//     z.number(),
//     z.boolean(),
//     z.string().optional(),
//     z.number().optional(),
//     z.boolean().optional(),
//     // valueContentReferenceToAssetSchema, @todo do we allow shared Values to reference assets or others?
//     // valueContentReferenceToSharedValueSchema,
//   ]),
// });
// export type SharedValueFile = z.infer<typeof sharedValueFileSchema>;

// export const sharedValueSchema = sharedValueFileSchema.extend({});
// export type SharedValue = z.infer<typeof sharedValueSchema>;

// export const sharedValueExportSchema = sharedValueSchema.extend({});
// export type SharedValueExport = z.infer<typeof sharedValueExportSchema>;

// export const resolvedValueContentReferenceToSharedValueSchema =
//   valueContentReferenceToSharedValueSchema.extend({
//     references: z.object({
//       id: uuidSchema,
//       language: supportedLanguageSchema,
//       resolved: sharedValueSchema,
//     }),
//   });
// export type ResolvedValueContentReferenceToSharedValue = z.infer<
//   typeof resolvedValueContentReferenceToSharedValueSchema
// >;

export const valueContentReferenceSchema = z.union([
  valueContentReferenceToAssetSchema,
  valueContentReferenceToCollectionSchema,
  valueContentReferenceToEntrySchema,
  // valueContentReferenceToSharedValueSchema,
]);
export type ValueContentReference = z.infer<typeof valueContentReferenceSchema>;

export const resolvedValueContentReferenceSchema: z.ZodUnion<
  [z.ZodType<Asset>, z.ZodType<Entry>]
> = z.union([
  assetSchema,
  z.lazy(() => entrySchema), // Circular dependency / recursive type @see https://github.com/colinhacks/zod?tab=readme-ov-file#recursive-types
  // resolvedValueContentReferenceToSharedValueSchema,
]);
export type ResolvedValueContentReference = z.infer<
  typeof resolvedValueContentReferenceSchema
>;

export const directValueBaseSchema = z.object({
  objectType: z.literal(objectTypeSchema.Enum.value).readonly(),
  fieldDefinitionId: uuidSchema.readonly(),
});

export const directStringValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(ValueTypeSchema.Enum.string).readonly(),
  content: translatableStringSchema,
});
export type DirectStringValue = z.infer<typeof directStringValueSchema>;

export const directNumberValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(ValueTypeSchema.Enum.number).readonly(),
  content: translatableNumberSchema,
});
export type DirectNumberValue = z.infer<typeof directNumberValueSchema>;

export const directBooleanValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(ValueTypeSchema.Enum.boolean).readonly(),
  content: translatableBooleanSchema,
});
export type DirectBooleanValue = z.infer<typeof directBooleanValueSchema>;

export const directValueSchema = z.union([
  directStringValueSchema,
  directNumberValueSchema,
  directBooleanValueSchema,
]);
export type DirectValue = z.infer<typeof directValueSchema>;

export const referencedValueSchema = z.object({
  objectType: z.literal(objectTypeSchema.Enum.value).readonly(),
  fieldDefinitionId: uuidSchema.readonly(),
  valueType: z.literal(ValueTypeSchema.Enum.reference).readonly(),
  content: translatableArrayOf(valueContentReferenceSchema),
});
export type ReferencedValue = z.infer<typeof referencedValueSchema>;

export const valueSchema = z.union([directValueSchema, referencedValueSchema]);
export type Value = z.infer<typeof valueSchema>;

export const resolvedReferencedValueSchema = referencedValueSchema.extend({
  content: translatableArrayOf(resolvedValueContentReferenceSchema),
});
export type ResolvedReferencedValue = z.infer<
  typeof resolvedReferencedValueSchema
>;

export const resolvedValueSchema = z.union([
  directValueSchema,
  resolvedReferencedValueSchema,
]);
export type ResolvedValue = z.infer<typeof resolvedValueSchema>;

/**
 * ---
 */

// export const createSharedValueSchema = sharedValueFileSchema
//   .pick({
//     valueType: true,
//     content: true,
//     language: true,
//   })
//   .extend({
//     projectId: uuidSchema.readonly(),
//   });
// export type CreateSharedValueProps = z.infer<typeof createSharedValueSchema>;

// export const readSharedValueSchema = sharedValueFileSchema
//   .pick({
//     id: true,
//     language: true,
//   })
//   .extend({
//     projectId: uuidSchema.readonly(),
//   });
// export type ReadSharedValueProps = z.infer<typeof readSharedValueSchema>;

// export const updateSharedValueSchema = sharedValueFileSchema
//   .pick({
//     id: true,
//     language: true,
//     content: true,
//   })
//   .extend({
//     projectId: uuidSchema.readonly(),
//   });
// export type UpdateSharedValueProps = z.infer<typeof updateSharedValueSchema>;

// export const deleteSharedValueSchema = sharedValueFileSchema
//   .pick({
//     id: true,
//     language: true,
//   })
//   .extend({
//     projectId: uuidSchema.readonly(),
//   });
// export type DeleteSharedValueProps = z.infer<typeof deleteSharedValueSchema>;

/**
 * @todo maybe we need to validate Values and shared Values
 */
// export const validateValueSchema = sharedValueFileSchema
//   .pick({
//     id: true,
//     language: true,
//   })
//   .extend({
//     projectId: uuidSchema.readonly(),
//     definition: FieldDefinitionSchema.readonly(),
//   });
// export type ValidateValueProps = z.infer<typeof validateValueSchema>;

// export const countValuesSchema = z.object({ projectId: uuidSchema.readonly() });
// export type CountValuesProps = z.infer<typeof countValuesSchema>;
