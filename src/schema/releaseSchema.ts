import { z } from '@hono/zod-openapi';
import { uuidSchema, versionSchema } from './baseSchema.js';
import { gitSignatureSchema } from './gitSchema.js';
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
  'ofComponentsChanged',
  'isNotRequiredToRequired',
  'isNotUniqueToUnique',
  'labelChanged',
  'descriptionChanged',
  'defaultValueChanged',
  'inputWidthChanged',
  'isDisabledChanged',
  'minMaxLoosened',
  'slugFormatChanged',
  'ofFieldDefinitionsChanged',
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

export const collectionChangeTypeSchema = z.enum([
  'added',
  'deleted',
  'slugChanged',
]);
export type CollectionChangeType = z.infer<typeof collectionChangeTypeSchema>;

export const collectionChangeSchema = z.object({
  collectionId: uuidSchema,
  changeType: collectionChangeTypeSchema,
  bump: semverBumpSchema,
  /**
   * Whether the added or deleted Collection is a Single Entry, so a caller
   * can name it without reading a Collection one side does not hold.
   *
   * Absent on a `slugChanged`, whose Collection is there to read, and on a
   * Collection whose file this Core cannot parse.
   */
  isSingleEntry: z.boolean().optional(),
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

export const componentChangeTypeSchema = z.enum([
  'added',
  'deleted',
  'slugChanged',
]);
export type ComponentChangeType = z.infer<typeof componentChangeTypeSchema>;

export const componentChangeSchema = z.object({
  componentId: uuidSchema,
  changeType: componentChangeTypeSchema,
  bump: semverBumpSchema,
});
export type ComponentChange = z.infer<typeof componentChangeSchema>;

export const componentFieldChangeSchema = z.object({
  componentId: uuidSchema,
  fieldId: uuidSchema,
  fieldSlug: z.string(),
  changeType: fieldChangeTypeSchema,
  bump: semverBumpSchema,
});
export type ComponentFieldChange = z.infer<typeof componentFieldChangeSchema>;

export const destinationChangeTypeSchema = z.enum([
  'added',
  'deleted',
  'nameChanged',
  'versionChanged',
  'mappingChanged',
  'waitingVersionChanged',
  'createdFromThemeChanged',
]);
export type DestinationChangeType = z.infer<typeof destinationChangeTypeSchema>;

export const destinationChangeSchema = z.object({
  destinationId: uuidSchema,
  changeType: destinationChangeTypeSchema,
  bump: semverBumpSchema,
  /**
   * The version of its theme's Contract the Destination uses now, on a
   * `versionChanged`, so a caller names it without reading the released
   * side. Absent on every other change of a Destination.
   */
  version: versionSchema.optional(),
});
export type DestinationChange = z.infer<typeof destinationChangeSchema>;

export const contractChangeTypeSchema = z.enum([
  'added',
  'deleted',
  'nameChanged',
  'versionAdded',
]);
export type ContractChangeType = z.infer<typeof contractChangeTypeSchema>;

export const contractChangeSchema = z.object({
  contractId: uuidSchema,
  changeType: contractChangeTypeSchema,
  bump: semverBumpSchema,
  /**
   * The version the copy that was added carries, on a `versionAdded`.
   * Absent on every other change of a Contract.
   */
  version: versionSchema.optional(),
});
export type ContractChange = z.infer<typeof contractChangeSchema>;

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
  componentChanges: z.array(componentChangeSchema),
  componentFieldChanges: z.array(componentFieldChangeSchema),
  destinationChanges: z.array(destinationChangeSchema),
  contractChanges: z.array(contractChangeSchema),
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

export const listReleasesSchema = z.object({
  projectId: uuidSchema,
});
export type ListReleasesProps = z.infer<typeof listReleasesSchema>;

/**
 * A Release or preview Release read from its git tag
 */
export const releaseListItemSchema = z.object({
  /**
   * The git tag name carrying this Release, used to address it in git
   */
  tagId: uuidSchema,
  type: z.enum(['release', 'preview']),
  version: versionSchema,
  datetime: z.iso.datetime(),
  /**
   * Who made this Release, the author of the commit it tags
   */
  author: gitSignatureSchema,
  /**
   * What this Release moved in the Project's version against the Release
   * before it, `null` while the two versions target the same Release
   */
  bump: semverBumpSchema.nullable(),
});
export type ReleaseListItem = z.infer<typeof releaseListItemSchema>;

export const releaseChangesSchema = z.object({
  projectId: uuidSchema,
  /**
   * The git tag of the Release or preview Release to report, as
   * `releases.list()` returns it
   */
  tagId: uuidSchema,
});
export type ReleaseChangesProps = z.infer<typeof releaseChangesSchema>;
