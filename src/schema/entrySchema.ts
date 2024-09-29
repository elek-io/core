import { z } from '@hono/zod-openapi';
import { objectTypeSchema, uuidSchema } from './baseSchema.js';
import { baseFileSchema } from './fileSchema.js';
import { gitCommitSchema } from './gitSchema.js';
import { valueSchema } from './valueSchema.js';

export const entryFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.Enum.entry).readonly(),
  values: z.array(valueSchema),
});
export type EntryFile = z.infer<typeof entryFileSchema>;

export const entrySchema = entryFileSchema
  .extend({
    /**
     * Commit history of this Entry
     */
    history: z.array(gitCommitSchema),
  })
  .openapi('Entry');
export type Entry = z.infer<typeof entrySchema>;

export const entryExportSchema = entrySchema.extend({});
export type EntryExport = z.infer<typeof entryExportSchema>;

export const createEntrySchema = entryFileSchema
  .omit({
    id: true,
    objectType: true,
    created: true,
    updated: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
    collectionId: uuidSchema.readonly(),
    values: z.array(valueSchema),
  });
export type CreateEntryProps = z.infer<typeof createEntrySchema>;

export const readEntrySchema = z.object({
  id: uuidSchema.readonly(),
  projectId: uuidSchema.readonly(),
  collectionId: uuidSchema.readonly(),
  commitHash: z.string().optional().readonly(),
});
export type ReadEntryProps = z.infer<typeof readEntrySchema>;

export const updateEntrySchema = entryFileSchema
  .omit({
    objectType: true,
    created: true,
    updated: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
    collectionId: uuidSchema.readonly(),
  });
export type UpdateEntryProps = z.infer<typeof updateEntrySchema>;

export const deleteEntrySchema = readEntrySchema.extend({});
export type DeleteEntryProps = z.infer<typeof deleteEntrySchema>;

export const countEntriesSchema = z.object({
  projectId: uuidSchema.readonly(),
  collectionId: uuidSchema.readonly(),
});
export type CountEntriesProps = z.infer<typeof countEntriesSchema>;
