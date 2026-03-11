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

export const releaseDiffSchema = z.object({
  project: projectSchema,
  bump: semverBumpSchema.nullable(),
  currentVersion: versionSchema,
  nextVersion: versionSchema.nullable(),
  collectionChanges: z.array(collectionChangeSchema),
  fieldChanges: z.array(fieldChangeSchema),
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

export const releaseTypeSchema = z.enum(['release', 'preview']);
export type ReleaseType = z.infer<typeof releaseTypeSchema>;

export const releaseTagMessageSchema = z.object({
  type: releaseTypeSchema,
  version: versionSchema,
});
export type ReleaseTagMessage = z.infer<typeof releaseTagMessageSchema>;

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
