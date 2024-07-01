import z from 'zod';
import {
  objectTypeSchema,
  supportedIconSchema,
  translatableStringSchema,
  uuidSchema,
} from './baseSchema.js';
import { entryExportSchema } from './entrySchema.js';
import { baseFileSchema } from './fileSchema.js';
import { valueDefinitionSchema } from './valueSchema.js';

export const collectionFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.Enum.collection).readonly(),
  name: z.object({
    singular: translatableStringSchema,
    plural: translatableStringSchema,
  }),
  slug: z.object({
    singular: z.string(),
    plural: z.string(),
  }),
  description: translatableStringSchema,
  icon: supportedIconSchema,
  valueDefinitions: z.array(valueDefinitionSchema),
});
export type CollectionFile = z.infer<typeof collectionFileSchema>;

export const collectionSchema = collectionFileSchema.extend({});
export type Collection = z.infer<typeof collectionSchema>;

export const collectionExportSchema = collectionSchema.extend({
  entries: z.array(entryExportSchema),
});
export type CollectionExport = z.infer<typeof collectionExportSchema>;

export const createCollectionSchema = collectionSchema
  .omit({
    id: true,
    objectType: true,
    created: true,
    updated: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
  });
export type CreateCollectionProps = z.infer<typeof createCollectionSchema>;

export const readCollectionSchema = z.object({
  id: uuidSchema.readonly(),
  projectId: uuidSchema.readonly(),
});
export type ReadCollectionProps = z.infer<typeof readCollectionSchema>;

export const updateCollectionSchema = collectionFileSchema
  .pick({
    id: true,
    name: true,
    slug: true,
    description: true,
    icon: true,
    valueDefinitions: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
  });
export type UpdateCollectionProps = z.infer<typeof updateCollectionSchema>;

export const deleteCollectionSchema = readCollectionSchema.extend({});
export type DeleteCollectionProps = z.infer<typeof deleteCollectionSchema>;

export const countCollectionsSchema = z.object({
  projectId: uuidSchema.readonly(),
});
export type CountCollectionsProps = z.infer<typeof countCollectionsSchema>;
