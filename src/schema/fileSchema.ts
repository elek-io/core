import z from 'zod';
import {
  supportedAssetExtensionSchema,
  supportedLanguageSchema,
  uuidSchema,
} from './baseSchema.js';

/**
 * A basic file structure every elek.io file on disk has to follow
 */
export const baseFileSchema = z.object({
  /**
   * The ID of the file
   *
   * The ID is part of the files name.
   */
  id: uuidSchema.readonly(),
  /**
   * The timestamp of the file being created is set by the service of "objectType" while creating it
   */
  created: z.number().readonly(),
  /**
   * The timestamp of the file being updated is set by the service of "objectType" while updating it
   */
  updated: z.number().nullable(),
});
export type BaseFile = z.infer<typeof baseFileSchema>;

export const baseFileWithLanguageSchema = baseFileSchema.extend({
  /**
   * The language of the file
   *
   * The language is part of the files name and together with it's ID the only unique identifier.
   * That's why the language cannot be changed after creating the file.
   *
   * @todo Maybe remove the above restriction by implementing logic to handle changing the files language inside all services
   */
  language: supportedLanguageSchema.readonly(),
});
export type BaseFileWithLanguage = z.infer<typeof baseFileWithLanguageSchema>;

export const fileReferenceSchema = z.object({
  id: uuidSchema,
  language: supportedLanguageSchema.optional(),
  extension: supportedAssetExtensionSchema.optional(),
});
export type FileReference = z.infer<typeof fileReferenceSchema>;
