import { z } from '@hono/zod-openapi';
import {
  objectTypeSchema,
  slugSchema,
  supportedIconSchema,
  translatableStringSchema,
  uuidSchema,
} from './baseSchema.js';
import { entryExportSchema } from './entrySchema.js';
import {
  fieldDefinitionOrGroupSchema,
  fieldDefinitionSlugUniquenessSuperRefinement,
} from './fieldSchema.js';
import { baseFileSchema } from './fileSchema.js';

export const collectionFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.enum.collection).readonly(),
  name: z.object({
    singular: translatableStringSchema,
    plural: translatableStringSchema,
  }),
  slug: z.object({
    singular: slugSchema,
    plural: slugSchema,
  }),
  description: translatableStringSchema,
  icon: supportedIconSchema,
  fieldDefinitions: z
    .array(fieldDefinitionOrGroupSchema)
    .superRefine(fieldDefinitionSlugUniquenessSuperRefinement),
});
export type CollectionFile = z.infer<typeof collectionFileSchema>;

export const collectionSchema = collectionFileSchema.openapi('Collection');
export type Collection = z.infer<typeof collectionSchema>;

export const collectionHistorySchema = z.object({
  id: uuidSchema.readonly(),
  projectId: uuidSchema.readonly(),
});
export type CollectionHistoryProps = z.infer<typeof collectionHistorySchema>;

export const collectionExportSchema = collectionSchema.extend({
  entries: z.array(entryExportSchema),
});
export type CollectionExport = z.infer<typeof collectionExportSchema>;

export const createCollectionSchema = collectionFileSchema
  .omit({
    id: true,
    objectType: true,
    coreVersion: true,
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

export const readBySlugCollectionSchema = z.object({
  slug: slugSchema,
  projectId: uuidSchema.readonly(),
  commitHash: z.string().optional().readonly(),
});
export type ReadBySlugCollectionProps = z.infer<
  typeof readBySlugCollectionSchema
>;

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

export const migrateCollectionSchema = z.looseObject(
  collectionFileSchema.pick({ id: true, coreVersion: true }).shape
);
export type MigrateCollectionProps = z.infer<typeof migrateCollectionSchema>;

export const resolveCollectionIdSchema = z.object({
  projectId: uuidSchema.readonly(),
  idOrSlug: z.string(),
});
export type ResolveCollectionIdProps = z.infer<
  typeof resolveCollectionIdSchema
>;
