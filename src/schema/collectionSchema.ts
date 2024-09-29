import { z } from '@hono/zod-openapi';
import {
  objectTypeSchema,
  supportedIconSchema,
  translatableStringSchema,
  uuidSchema,
} from './baseSchema.js';
import { entryExportSchema } from './entrySchema.js';
import { fieldDefinitionSchema } from './fieldSchema.js';
import { baseFileSchema } from './fileSchema.js';
import { gitCommitSchema } from './gitSchema.js';

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
  fieldDefinitions: z.array(fieldDefinitionSchema),
});
export type CollectionFile = z.infer<typeof collectionFileSchema>;

export const collectionSchema = collectionFileSchema
  .extend({
    /**
     * Commit history of this Collection
     */
    history: z.array(gitCommitSchema),
  })
  .openapi('Collection');
export type Collection = z.infer<typeof collectionSchema>;

export const collectionExportSchema = collectionSchema.extend({
  entries: z.array(entryExportSchema),
});
export type CollectionExport = z.infer<typeof collectionExportSchema>;

export const createCollectionSchema = collectionFileSchema
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
  commitHash: z.string().optional().readonly(),
});
export type ReadCollectionProps = z.infer<typeof readCollectionSchema>;

export const updateCollectionSchema = collectionFileSchema
  .pick({
    id: true,
    name: true,
    slug: true,
    description: true,
    icon: true,
    fieldDefinitions: true,
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
