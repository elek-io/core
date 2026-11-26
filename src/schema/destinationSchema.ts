import { z } from '@hono/zod-openapi';
import {
  objectTypeSchema,
  slugSchema,
  supportedLanguageSchema,
  uuidSchema,
  versionSchema,
} from './baseSchema.js';
import { baseFileSchema } from './fileSchema.js';
import {
  directBooleanValueSchema,
  directNumberValueSchema,
  directStringValueSchema,
  mdastValueSchema,
  valueSchema,
} from './valueSchema.js';

/**
 * Which languages of the Project a field is read from, in the order they are
 * tried. The first one holding a Value fills the field in every language, so
 * a theme serving one language takes a Value the editor wrote in another.
 */
export const mappingLanguagesSchema = z.object({
  order: z.array(supportedLanguageSchema).nonempty(),
});
export type MappingLanguages = z.infer<typeof mappingLanguagesSchema>;

/** What one option of a `select` field carries, which is its own Value */
export const optionValueSchema = z.union([z.string(), z.number()]);
export type OptionValue = z.infer<typeof optionValueSchema>;

/**
 * Which option of the Contract's field one option of the Project's field
 * becomes. Matched once here rather than per Entry, so an option without a
 * match is named while the Mapping is made.
 */
export const optionMatchSchema = z.object({
  from: optionValueSchema,
  to: optionValueSchema,
});
export type OptionMatch = z.infer<typeof optionMatchSchema>;

/**
 * A Value typed into the Mapping rather than read from an Entry. Every kind
 * but a reference and Component items, because both carry ids of one Project
 * that say nothing about a Contract.
 */
export const fixedValueSchema = z.union([
  directStringValueSchema,
  directNumberValueSchema,
  directBooleanValueSchema,
  mdastValueSchema,
]);
export type FixedValue = z.infer<typeof fixedValueSchema>;

/**
 * How one field of the Contract is filled. Both sides are matched by id,
 * never by slug, the rule every schema change follows.
 *
 * `fill` says which way: one field of the Project, a fixed Value, several
 * fields joined by `separator`, or one field whose options are matched onto
 * the Contract's. It defaults to `field`, so a Mapping written before the
 * other three existed reads as the one field it names.
 */
export const fieldMappingSchema = z.union([
  z.object({
    fill: z.literal('field').default('field'),
    fieldDefinitionId: uuidSchema,
    language: mappingLanguagesSchema.optional(),
  }),
  z.object({
    fill: z.literal('fixed'),
    value: fixedValueSchema,
  }),
  z.object({
    fill: z.literal('combined'),
    fieldDefinitionIds: z.array(uuidSchema).min(2),
    separator: z.string().max(16).default(' '),
    language: mappingLanguagesSchema.optional(),
  }),
  z.object({
    fill: z.literal('options'),
    fieldDefinitionId: uuidSchema,
    options: z.array(optionMatchSchema),
    language: mappingLanguagesSchema.optional(),
  }),
]);
export type FieldMapping = z.infer<typeof fieldMappingSchema>;

/**
 * One condition on which Entries a website takes, met by an Entry whose
 * Value for that field definition is one of `equals` in any language of the
 * Project.
 */
export const entryConditionSchema = z.object({
  fieldDefinitionId: uuidSchema,
  equals: z.array(z.union([z.string(), z.number(), z.boolean()])).nonempty(),
});
export type EntryCondition = z.infer<typeof entryConditionSchema>;

/**
 * Which Project Collection feeds one Collection of the Contract, which of
 * its Entries the website takes, and which of its field definitions fills
 * each field, keyed by the Contract's own ids.
 *
 * `where` holds the conditions an Entry has to meet, all of them. It
 * defaults to none, which takes every Entry of the Collection, and is what a
 * Mapping written before conditions existed reads as.
 */
export const collectionMappingSchema = z.object({
  from: z.object({
    collectionId: uuidSchema,
    where: z.array(entryConditionSchema).default([]),
  }),
  fields: z.record(uuidSchema, fieldMappingSchema),
});
export type CollectionMapping = z.infer<typeof collectionMappingSchema>;

/**
 * Which Project content fills a Contract, keyed by the Contract's Collection
 * ids. A Collection the Contract names and the Mapping does not hold is
 * unmapped, which the check reports.
 */
export const mappingSchema = z.object({
  collections: z.record(uuidSchema, collectionMappingSchema),
});
export type Mapping = z.infer<typeof mappingSchema>;

/**
 * The kinds of Destination content goes to. A website is the first, and a
 * kind added later only adds a member here.
 */
export const destinationKindSchema = z.enum(['website']);
export type DestinationKind = z.infer<typeof destinationKindSchema>;

/**
 * A newer version of the Contract that waits beside the one in use, with a
 * Mapping of its own the editor fills while the website goes on using the
 * version it uses.
 */
export const waitingVersionSchema = z.object({
  version: versionSchema,
  mapping: mappingSchema,
});
export type WaitingVersion = z.infer<typeof waitingVersionSchema>;

/**
 * `destinations/<id>/destination.json`: one place a Project's content goes,
 * the Contract it follows, the version of it in use, the Mapping that fills
 * it, and the newer version waiting beside it where one does.
 */
export const destinationFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.enum.destination).readonly(),
  name: z.string().trim().min(1).max(128),
  kind: destinationKindSchema,
  contract: z.object({ id: uuidSchema, version: versionSchema }),
  mapping: mappingSchema,
  /**
   * Defaults to none, so a Destination written before a version could wait
   * reads as one that follows the version it uses.
   */
  waiting: waitingVersionSchema.nullable().default(null),
  /**
   * What this website created from its theme, in the order it was created,
   * so an app groups those Collections under the website they came from and
   * a second Collection reuses the Components the first one needed. A
   * Collection deleted since is still named here and holds nothing, which is
   * why `createdCollections()` reads them against the Project.
   */
  createdFromTheme: z
    .object({
      collectionIds: z.array(uuidSchema),
      componentIds: z.array(uuidSchema),
    })
    .default({ collectionIds: [], componentIds: [] }),
});
export type DestinationFile = z.infer<typeof destinationFileSchema>;

export const addWebsiteSchema = z.object({
  projectId: uuidSchema.readonly(),
  name: z.string().trim().min(1).max(128),
  url: z.string().trim().min(1),
  version: versionSchema.optional(),
});
export type AddWebsiteProps = z.infer<typeof addWebsiteSchema>;

export const readDestinationSchema = z.object({
  projectId: uuidSchema.readonly(),
  id: uuidSchema.readonly(),
});
export type ReadDestinationProps = z.infer<typeof readDestinationSchema>;

export const updateDestinationSchema = z.object({
  projectId: uuidSchema.readonly(),
  id: uuidSchema.readonly(),
  name: z.string().trim().min(1).max(128).optional(),
  mapping: mappingSchema.optional(),
  /** The Mapping of the version that waits, rather than the one in use */
  waitingMapping: mappingSchema.optional(),
});
export type UpdateDestinationProps = z.infer<typeof updateDestinationSchema>;

export const deleteDestinationSchema = readDestinationSchema.extend({});
export type DeleteDestinationProps = z.infer<typeof deleteDestinationSchema>;

export const listDestinationsSchema = z.object({
  projectId: uuidSchema.readonly(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});
export type ListDestinationsProps = z.infer<typeof listDestinationsSchema>;

export const countDestinationsSchema = z.object({
  projectId: uuidSchema.readonly(),
});
export type CountDestinationsProps = z.infer<typeof countDestinationsSchema>;

export const checkDestinationSchema = readDestinationSchema.extend({
  entryId: uuidSchema,
  collectionId: uuidSchema,
  /** Checks the version that waits rather than the one in use */
  isWaitingVersion: z.boolean().optional(),
});
export type CheckDestinationProps = z.infer<typeof checkDestinationSchema>;

export const checkAllDestinationSchema = readDestinationSchema.extend({
  /** Checks the version that waits rather than the one in use */
  isWaitingVersion: z.boolean().optional(),
});
export type CheckAllDestinationProps = z.infer<
  typeof checkAllDestinationSchema
>;

export const checkMappingSchema = readDestinationSchema.extend({
  mapping: mappingSchema,
  /** Checks it against the version that waits rather than the one in use */
  isWaitingVersion: z.boolean().optional(),
});
export type CheckMappingProps = z.infer<typeof checkMappingSchema>;

export const destinationValuesSchema = readDestinationSchema.extend({
  contractCollectionId: uuidSchema,
  entryId: uuidSchema,
  /** Reads the version that waits rather than the one in use */
  isWaitingVersion: z.boolean().optional(),
});
export type DestinationValuesProps = z.infer<typeof destinationValuesSchema>;

export const createdCollectionsSchema = readDestinationSchema.extend({});
export type CreatedCollectionsProps = z.infer<typeof createdCollectionsSchema>;

export const createFromContractSchema = readDestinationSchema.extend({
  contractCollectionId: uuidSchema,
  /** Creates it for the version that waits rather than the one in use */
  isWaitingVersion: z.boolean().optional(),
});
export type CreateFromContractProps = z.infer<typeof createFromContractSchema>;

export const createContractFieldSchema = createFromContractSchema.extend({
  contractFieldDefinitionId: uuidSchema,
  /**
   * The Value of the new field per Entry of the Collection, keyed by Entry
   * id and then by the field's own slug, which a required field with no
   * default value needs, the same as a field definition change does
   */
  resolutions: z
    .record(uuidSchema, z.record(slugSchema, valueSchema))
    .optional(),
});
export type CreateContractFieldProps = z.infer<
  typeof createContractFieldSchema
>;

export const newerDestinationVersionsSchema = readDestinationSchema.extend({});
export type NewerDestinationVersionsProps = z.infer<
  typeof newerDestinationVersionsSchema
>;

export const keepDestinationVersionSchema = readDestinationSchema.extend({
  /** The newest version tagged at the theme when left out */
  version: versionSchema.optional(),
});
export type KeepDestinationVersionProps = z.infer<
  typeof keepDestinationVersionSchema
>;

export const switchDestinationVersionSchema = readDestinationSchema.extend({});
export type SwitchDestinationVersionProps = z.infer<
  typeof switchDestinationVersionSchema
>;
