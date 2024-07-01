import z from 'zod';
import {
  objectTypeSchema,
  supportedAssetExtensionSchema,
  supportedAssetMimeTypeSchema,
  uuidSchema,
} from './baseSchema.js';
import { baseFileWithLanguageSchema } from './fileSchema.js';

export const assetFileSchema = baseFileWithLanguageSchema.extend({
  objectType: z.literal(objectTypeSchema.Enum.asset).readonly(),
  name: z.string(),
  description: z.string(),
  extension: supportedAssetExtensionSchema.readonly(),
  mimeType: supportedAssetMimeTypeSchema.readonly(),
  /**
   * Total size in bytes
   */
  size: z.number().readonly(),
});
export type AssetFile = z.infer<typeof assetFileSchema>;

export const assetSchema = assetFileSchema.extend({
  /**
   * Absolute path on this filesystem
   */
  absolutePath: z.string().readonly(),
});
export type Asset = z.infer<typeof assetSchema>;

export const assetExportSchema = assetSchema.extend({});
export type AssetExport = z.infer<typeof assetExportSchema>;

export const createAssetSchema = assetFileSchema
  .pick({
    name: true,
    description: true,
    language: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
    /**
     * Path of the file to add as a new Asset
     */
    filePath: z.string().readonly(),
  });
export type CreateAssetProps = z.infer<typeof createAssetSchema>;

export const readAssetSchema = assetFileSchema
  .pick({
    id: true,
    language: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
  });
export type ReadAssetProps = z.infer<typeof readAssetSchema>;

export const updateAssetSchema = assetFileSchema
  .pick({
    id: true,
    name: true,
    description: true,
    language: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
    /**
     * Path of the new file to update the Asset with
     */
    newFilePath: z.string().readonly().optional(),
  });
export type UpdateAssetProps = z.infer<typeof updateAssetSchema>;

export const deleteAssetSchema = assetFileSchema
  .pick({
    id: true,
    language: true,
    extension: true,
  })
  .extend({
    projectId: uuidSchema.readonly(),
  });
export type DeleteAssetProps = z.infer<typeof deleteAssetSchema>;

export const countAssetsSchema = z.object({ projectId: uuidSchema.readonly() });
export type CountAssetsProps = z.infer<typeof countAssetsSchema>;
