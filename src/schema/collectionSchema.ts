import { z } from '@hono/zod-openapi';
import {
  objectTypeSchema,
  slugSchema,
  supportedIconSchema,
  partialTranslatableStringSchema,
  uuidSchema,
} from './baseSchema.js';
import { valueSchema } from './valueSchema.js';
import { entryExportSchema } from './entrySchema.js';
import {
  fieldDefinitionOrGroupSchema,
  fieldDefinitionSlugUniquenessSuperRefinement,
  slugSourceReferencesSuperRefinement,
} from './fieldSchema.js';
import { baseFileSchema } from './fileSchema.js';

export const collectionFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.enum.collection).readonly(),
  name: z.object({
    singular: partialTranslatableStringSchema,
    plural: partialTranslatableStringSchema,
  }),
  slug: z.object({
    singular: slugSchema,
    plural: slugSchema,
  }),
  description: partialTranslatableStringSchema,
  icon: supportedIconSchema,
  /**
   * Whether the Collection is limited to one Entry, a Single Entry, which is
   * what one-off content such as contact details is kept in.
   *
   * Set when the Collection is created and never changed afterwards. It
   * defaults to false, so a Collection written before Single Entries existed
   * reads as the list it is.
   */
  isSingleEntry: z.boolean().default(false),
  fieldDefinitions: z
    .array(fieldDefinitionOrGroupSchema)
    .superRefine(fieldDefinitionSlugUniquenessSuperRefinement)
    .superRefine(slugSourceReferencesSuperRefinement),
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
    /**
     * Limits the Collection to one Entry. Left out, it holds a list, which
     * is what every Collection was before Single Entries existed.
     */
    isSingleEntry: z.boolean().optional(),
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
    /**
     * Whether the Collection is a Single Entry, which `update` can only
     * repeat. Another value than the one it was created with throws
     * `Conflict`, and leaving it out keeps what the Collection holds.
     */
    isSingleEntry: z.boolean().optional(),
    resolutions: z
      .record(uuidSchema, z.record(slugSchema, valueSchema))
      .optional(),
    acceptedContentLoss: z.array(uuidSchema).optional(),
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
