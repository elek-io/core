import { z } from '@hono/zod-openapi';
import {
  objectTypeSchema,
  slugSchema,
  uuidSchema,
  type SupportedLanguage,
  type Uuid,
} from './baseSchema.js';
import { baseFileSchema } from './fileSchema.js';
import { valueSchema } from './valueSchema.js';

export const entryFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.enum.entry).readonly(),
  values: z.record(slugSchema, valueSchema),
});
export type EntryFile = z.infer<typeof entryFileSchema>;

export const entrySchema = entryFileSchema.openapi('Entry');
export type Entry = z.infer<typeof entrySchema>;

export const entryHistorySchema = z.object({
  id: uuidSchema.readonly(),
  projectId: uuidSchema.readonly(),
  collectionId: uuidSchema.readonly(),
});
export type EntryHistoryProps = z.infer<typeof entryHistorySchema>;

export const entryExportSchema = entrySchema.extend({});
export type EntryExport = z.infer<typeof entryExportSchema>;

export const createEntrySchema = entryFileSchema
  .omit({
    id: true,
    objectType: true,
    coreVersion: true,
    created: true,
    updated: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
    collectionId: uuidSchema.readonly(),
    values: z.record(slugSchema, valueSchema),
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
    coreVersion: true,
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

export const migrateEntrySchema = z.looseObject(
  entryFileSchema.pick({ id: true, coreVersion: true }).shape
);
export type MigrateEntryProps = z.infer<typeof migrateEntrySchema>;

export const countEntriesSchema = z.object({
  projectId: uuidSchema.readonly(),
  collectionId: uuidSchema.readonly(),
});
export type CountEntriesProps = z.infer<typeof countEntriesSchema>;

/**
 * Location of a problematic reference within an Entry's `values`.
 */
export interface EntryReferenceIssueLocation {
  /**
   * The field's slug.
   */
  fieldSlug: string;
  /**
   * Per-language slot of the field's content.
   */
  language: SupportedLanguage;
  /**
   * Path through mdast tree `children` arrays to the offending node,
   * descending from `root.children`. Empty for flat reference fields.
   */
  treePath: number[];
  /**
   * Index into the flat reference array (for flat asset/entry fields).
   * `null` for mdast refs (use `treePath`).
   */
  index: number | null;
}

/**
 * A reference points to an entity that doesn't exist on disk.
 */
export interface EntryReferenceNotFoundIssue extends EntryReferenceIssueLocation {
  kind: 'reference_not_found';
  refKind: 'asset' | 'entry';
  /**
   * The referenced entity's id (assetId or entryId).
   */
  refId: Uuid;
  /**
   * The claimed Collection (carried by entry refs for path resolution).
   * `null` for Asset refs.
   */
  collectionId: Uuid | null;
}

/**
 * An asset reference points to an Asset whose `mimeType` is not in the
 * field's `ofAssetMimeTypes` allowlist.
 */
export interface AssetMimeMismatchIssue extends EntryReferenceIssueLocation {
  kind: 'asset_mime_mismatch';
  assetId: Uuid;
  expectedMimeTypes: string[];
  actualMimeType: string;
}

export type EntryReferenceIssue =
  | EntryReferenceNotFoundIssue
  | AssetMimeMismatchIssue;
