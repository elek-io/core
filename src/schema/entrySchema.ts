import z from 'zod';
import type { Asset } from './assetSchema.js';
import {
  objectTypeSchema,
  uuidSchema,
  type SupportedLanguage,
} from './baseSchema.js';
import { baseFileSchema } from './fileSchema.js';
import {
  resolvedValueSchema,
  valueSchema,
  type DirectValue,
  type ReferencedValue,
} from './valueSchema.js';

export const entryFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.Enum.entry).readonly(),
  values: z.array(valueSchema),
});
export type EntryFile = z.infer<typeof entryFileSchema>;

// @see https://github.com/colinhacks/zod?tab=readme-ov-file#recursive-types
export type Entry = z.infer<typeof entryFileSchema> & {
  values: (
    | DirectValue
    | (ReferencedValue & {
        content: Partial<Record<SupportedLanguage, (Asset | Entry)[]>>;
      })
  )[];
};
export const entrySchema = entryFileSchema.extend({
  values: z.array(z.lazy(() => resolvedValueSchema)),
}) satisfies z.ZodType<Entry>;

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
});
export type ReadEntryProps = z.infer<typeof readEntrySchema>;

export const updateEntrySchema = entrySchema
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
