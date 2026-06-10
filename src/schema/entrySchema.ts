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
 * A single hop through a `dynamic`/component block on the way to a nested
 * field. A reference can live inside a component item's values, which can
 * themselves nest further component items, so the path to a reference is a
 * chain of these segments (empty when the reference sits in a top-level field).
 */
export interface ReferenceComponentPathSegment {
  /**
   * Slug of the `dynamic` field whose item holds the (nested) value.
   */
  fieldSlug: string;
  /**
   * Id of the component item within that field's `content` array.
   */
  itemId: Uuid;
  /**
   * The item's Component, for resolving its inner field definitions.
   */
  componentId: Uuid;
}

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
  /**
   * Chain of `dynamic`/component hops from the Entry's top-level field down
   * to the field holding the reference. Empty when the reference sits in a
   * top-level field; `fieldSlug` above is always the leaf (innermost) field.
   */
  componentPath: ReferenceComponentPathSegment[];
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

/**
 * A value written to a unique field (or slug field) collides with the same
 * value already held by another Entry in the same Collection, for the same
 * language. Collected and reported together on Entry create/update.
 */
export interface UniqueValueConflict {
  collectionId: Uuid;
  fieldDefinitionId: Uuid;
  fieldSlug: string;
  language: SupportedLanguage;
  value: string;
  /**
   * The id of the Entry that already holds this value.
   */
  conflictingEntryId: Uuid;
}

/**
 * An Entry that still references a delete target (an Asset or another Entry).
 * Collected by `EntryService.findEntriesReferencing` and attached as the
 * `cause` of the `Conflict` error thrown when a referenced Asset/Entry delete
 * is blocked. One record per referring Entry (first match within that Entry).
 */
export interface ReferencingEntry {
  /**
   * Collection the referring Entry belongs to.
   */
  collectionId: Uuid;
  /**
   * The referring Entry's id.
   */
  entryId: Uuid;
  /**
   * Slug of the leaf field holding the reference (the innermost field when
   * the reference is nested inside `dynamic`/component blocks).
   */
  fieldSlug: string;
  /**
   * Which carrier the reference id was stored in. Nesting inside a component
   * is signalled by a non-empty `componentPath`, not by this field.
   */
  via: 'reference' | 'mdast';
  /**
   * Chain of `dynamic`/component hops down to `fieldSlug`. Empty when the
   * reference sits in a top-level field.
   */
  componentPath: ReferenceComponentPathSegment[];
}
