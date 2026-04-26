import { z } from '@hono/zod-openapi';
import {
  objectTypeSchema,
  slugSchema,
  uuidSchema,
  partialTranslatableRecordOf,
} from './baseSchema.js';

export const valueTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'reference',
  'component',
]);
export type ValueType = z.infer<typeof valueTypeSchema>;

export const valueContentReferenceBase = z.object({
  id: uuidSchema,
});

export const valueContentReferenceToAssetSchema =
  valueContentReferenceBase.extend({
    objectType: z.literal(objectTypeSchema.enum.asset),
  });
export type ValueContentReferenceToAsset = z.infer<
  typeof valueContentReferenceToAssetSchema
>;

export const valueContentReferenceToCollectionSchema =
  valueContentReferenceBase.extend({
    objectType: z.literal(objectTypeSchema.enum.collection),
  });
export type ValueContentReferenceToCollection = z.infer<
  typeof valueContentReferenceToCollectionSchema
>;

export const valueContentReferenceToEntrySchema =
  valueContentReferenceBase.extend({
    objectType: z.literal(objectTypeSchema.enum.entry),
    collectionId: uuidSchema,
  });
export type ValueContentReferenceToEntry = z.infer<
  typeof valueContentReferenceToEntrySchema
>;

export const valueContentReferenceSchema = z.union([
  valueContentReferenceToAssetSchema,
  valueContentReferenceToCollectionSchema,
  valueContentReferenceToEntrySchema,
]);
export type ValueContentReference = z.infer<typeof valueContentReferenceSchema>;

export const directValueBaseSchema = z.object({
  objectType: z.literal(objectTypeSchema.enum.value).readonly(),
});

export const directStringValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(valueTypeSchema.enum.string).readonly(),
  content: partialTranslatableRecordOf(z.string().trim().min(1).nullable()),
});
export type DirectStringValue = z.infer<typeof directStringValueSchema>;

export const directNumberValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(valueTypeSchema.enum.number).readonly(),
  content: partialTranslatableRecordOf(z.number().nullable()),
});
export type DirectNumberValue = z.infer<typeof directNumberValueSchema>;

export const directBooleanValueSchema = directValueBaseSchema.extend({
  valueType: z.literal(valueTypeSchema.enum.boolean).readonly(),
  // A boolean Value is never nullable, since it's always either true or false
  content: partialTranslatableRecordOf(z.boolean()),
});
export type DirectBooleanValue = z.infer<typeof directBooleanValueSchema>;

export const directValueSchema = z.union([
  directStringValueSchema,
  directNumberValueSchema,
  directBooleanValueSchema,
]);
export type DirectValue = z.infer<typeof directValueSchema>;

export const referencedValueSchema = z.object({
  objectType: z.literal(objectTypeSchema.enum.value).readonly(),
  valueType: z.literal(valueTypeSchema.enum.reference).readonly(),
  content: partialTranslatableRecordOf(z.array(valueContentReferenceSchema)),
});
export type ReferencedValue = z.infer<typeof referencedValueSchema>;

export const componentItemSchema = z.object({
  id: uuidSchema.readonly(),
  componentId: uuidSchema,
  get values() {
    return z.record(slugSchema, valueSchema);
  },
});
export type ComponentItem = z.infer<typeof componentItemSchema>;

export const componentValueSchema = z.object({
  objectType: z.literal(objectTypeSchema.enum.value).readonly(),
  valueType: z.literal(valueTypeSchema.enum.component).readonly(),
  content: z.array(componentItemSchema),
});
export type ComponentValue = z.infer<typeof componentValueSchema>;

export const valueSchema = z.union([
  directValueSchema,
  referencedValueSchema,
  componentValueSchema,
]);
export type Value = z.infer<typeof valueSchema>;
