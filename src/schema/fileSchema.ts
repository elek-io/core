import { z } from '@hono/zod-openapi';
import { objectTypeSchema, uuidSchema, versionSchema } from './baseSchema.js';

/**
 * A basic file structure every elek.io file on disk has to follow
 */
export const baseFileSchema = z.object({
  /**
   * The object type of the file
   */
  objectType: objectTypeSchema.readonly(),
  /**
   * The ID of the file
   *
   * The ID is part of the files name.
   */
  id: uuidSchema.readonly(),
  /**
   * The version of elek.io Core used to create or last update this file
   */
  coreVersion: versionSchema.readonly(),
  /**
   * The datetime of the file being created is set by the service of "objectType" while creating it
   */
  created: z.string().datetime().readonly(),
  /**
   * The datetime of the file being updated is set by the service of "objectType" while updating it
   */
  updated: z.string().datetime().nullable().readonly(),
});
export type BaseFile = z.infer<typeof baseFileSchema>;

export const fileReferenceSchema = z.object({
  id: uuidSchema,
  extension: z.string().optional(),
});
export type FileReference = z.infer<typeof fileReferenceSchema>;

/**
 * Schema for the collection index file (collections/index.json).
 * Maps collection UUIDs to their slug.plural values.
 * This is a local performance cache, not git-tracked.
 */
export const collectionIndexSchema = z.record(uuidSchema, z.string());
export type CollectionIndex = z.infer<typeof collectionIndexSchema>;
