import { z } from '@hono/zod-openapi';
import { uuidSchema, versionSchema } from './baseSchema.js';
import { projectSchema } from './projectSchema.js';

export const semverBumpSchema = z.enum(['major', 'minor', 'patch']);
export type SemverBump = z.infer<typeof semverBumpSchema>;

export const fieldChangeTypeSchema = z.enum([
  'added',
  'deleted',
  'valueTypeChanged',
  'fieldTypeChanged',
  'slugChanged',
  'minMaxTightened',
  'isRequiredToNotRequired',
  'isUniqueToNotUnique',
  'ofCollectionsChanged',
  'isNotRequiredToRequired',
  'isNotUniqueToUnique',
  'labelChanged',
  'descriptionChanged',
  'defaultValueChanged',
  'inputWidthChanged',
  'isDisabledChanged',
  'minMaxLoosened',
]);
export type FieldChangeType = z.infer<typeof fieldChangeTypeSchema>;

export const fieldChangeSchema = z.object({
  collectionId: uuidSchema,
  fieldId: uuidSchema,
  fieldSlug: z.string(),
  changeType: fieldChangeTypeSchema,
  bump: semverBumpSchema,
});
export type FieldChange = z.infer<typeof fieldChangeSchema>;

export const collectionChangeTypeSchema = z.enum(['added', 'deleted']);
export type CollectionChangeType = z.infer<typeof collectionChangeTypeSchema>;

export const collectionChangeSchema = z.object({
  collectionId: uuidSchema,
  changeType: collectionChangeTypeSchema,
  bump: semverBumpSchema,
});
export type CollectionChange = z.infer<typeof collectionChangeSchema>;

export const projectChangeTypeSchema = z.enum([
  'nameChanged',
  'descriptionChanged',
  'defaultLanguageChanged',
  'supportedLanguageAdded',
  'supportedLanguageRemoved',
]);
export type ProjectChangeType = z.infer<typeof projectChangeTypeSchema>;

export const projectChangeSchema = z.object({
  changeType: projectChangeTypeSchema,
  bump: semverBumpSchema,
});
export type ProjectChange = z.infer<typeof projectChangeSchema>;

export const assetChangeTypeSchema = z.enum([
  'added',
  'deleted',
  'metadataChanged',
  'binaryChanged',
]);
export type AssetChangeType = z.infer<typeof assetChangeTypeSchema>;

export const assetChangeSchema = z.object({
  assetId: uuidSchema,
  changeType: assetChangeTypeSchema,
  bump: semverBumpSchema,
});
export type AssetChange = z.infer<typeof assetChangeSchema>;

export const entryChangeTypeSchema = z.enum(['added', 'deleted', 'modified']);
export type EntryChangeType = z.infer<typeof entryChangeTypeSchema>;

export const entryChangeSchema = z.object({
  collectionId: uuidSchema,
  entryId: uuidSchema,
  changeType: entryChangeTypeSchema,
  bump: semverBumpSchema,
});
export type EntryChange = z.infer<typeof entryChangeSchema>;

export const releaseDiffSchema = z.object({
  project: projectSchema,
  bump: semverBumpSchema.nullable(),
  currentVersion: versionSchema,
  nextVersion: versionSchema.nullable(),
  projectChanges: z.array(projectChangeSchema),
  collectionChanges: z.array(collectionChangeSchema),
  fieldChanges: z.array(fieldChangeSchema),
  assetChanges: z.array(assetChangeSchema),
  entryChanges: z.array(entryChangeSchema),
});
export type ReleaseDiff = z.infer<typeof releaseDiffSchema>;

export const prepareReleaseSchema = z.object({
  projectId: uuidSchema.readonly(),
});
export type PrepareReleaseProps = z.infer<typeof prepareReleaseSchema>;

export const createReleaseSchema = z.object({
  projectId: uuidSchema.readonly(),
});
export type CreateReleaseProps = z.infer<typeof createReleaseSchema>;

export const createPreviewReleaseSchema = z.object({
  projectId: uuidSchema.readonly(),
});
export type CreatePreviewReleaseProps = z.infer<
  typeof createPreviewReleaseSchema
>;

export const releaseResultSchema = z.object({
  version: versionSchema,
  diff: releaseDiffSchema,
});
export type ReleaseResult = z.infer<typeof releaseResultSchema>;
