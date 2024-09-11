import z from 'zod';
import {
  objectTypeSchema,
  supportedAssetExtensionSchema,
  uuidSchema,
} from './baseSchema.js';

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
   * The datetime of the file being created is set by the service of "objectType" while creating it
   */
  created: z.string().datetime().readonly(),
  /**
   * The datetime of the file being updated is set by the service of "objectType" while updating it
   */
  updated: z.string().datetime().nullable(),
});
export type BaseFile = z.infer<typeof baseFileSchema>;

export const fileReferenceSchema = z.object({
  id: uuidSchema,
  extension: supportedAssetExtensionSchema.optional(),
});
export type FileReference = z.infer<typeof fileReferenceSchema>;
