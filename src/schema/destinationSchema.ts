import { z } from '@hono/zod-openapi';
import { objectTypeSchema, uuidSchema, versionSchema } from './baseSchema.js';
import { baseFileSchema } from './fileSchema.js';

/**
 * Which Project field definition fills one field of the Contract. Both sides
 * are matched by id, never by slug, the rule every schema change follows.
 */
export const fieldMappingSchema = z.object({
  fieldDefinitionId: uuidSchema,
});
export type FieldMapping = z.infer<typeof fieldMappingSchema>;

/**
 * Which Project Collection feeds one Collection of the Contract, and which of
 * its field definitions fills each field, keyed by the Contract's own ids.
 */
export const collectionMappingSchema = z.object({
  from: z.object({ collectionId: uuidSchema }),
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
 * `destinations/<id>/destination.json`: one place a Project's content goes,
 * the Contract it follows, the version of it in use and the Mapping that
 * fills it.
 */
export const destinationFileSchema = baseFileSchema.extend({
  objectType: z.literal(objectTypeSchema.enum.destination).readonly(),
  name: z.string().trim().min(1).max(128),
  kind: destinationKindSchema,
  contract: z.object({ id: uuidSchema, version: versionSchema }),
  mapping: mappingSchema,
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
});
export type CheckDestinationProps = z.infer<typeof checkDestinationSchema>;

export const checkAllDestinationSchema = readDestinationSchema.extend({});
export type CheckAllDestinationProps = z.infer<
  typeof checkAllDestinationSchema
>;
