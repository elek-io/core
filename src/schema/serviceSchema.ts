import { z } from 'zod';
import { uuidSchema } from './baseSchema.js';

export const serviceTypeSchema = z.enum([
  'Git',
  'GitTag',
  'User',
  'Project',
  'Asset',
  'JsonFile',
  'Search',
  'Collection',
  'Entry',
  'Value',
]);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export interface PaginatedList<T> {
  total: number;
  limit: number;
  offset: number;
  list: T[];
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Implements create, read, update and delete methods
 */
export interface CrudService<T> {
  create: (props: any) => Promise<T>;
  read: (props: any) => Promise<T>;
  update: (props: any) => Promise<T>;
  delete: (props: any) => Promise<void>;
}

/**
 * Implements list and count methods additionally
 * to create, read, update and delete
 */
export interface CrudServiceWithListCount<T> extends CrudService<T> {
  /**
   * Returns a list of this services objects
   *
   * Does not return objects where the schema validation fails.
   * If that is the case, upgrade the Client and then Project to the latest version.
   */
  list: (...props: any) => Promise<PaginatedList<T>>;
  /**
   * Returns the total number of this services objects
   */
  count: (...props: any) => Promise<number>;
}

const listSchema = z.object({
  projectId: uuidSchema,
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const listCollectionsSchema = listSchema;
export type ListCollectionsProps = z.infer<typeof listCollectionsSchema>;

export const listEntriesSchema = listSchema.extend({
  collectionId: uuidSchema,
});
export type ListEntriesProps = z.infer<typeof listEntriesSchema>;

export const listAssetsSchema = listSchema;
export type ListAssetsProps = z.infer<typeof listAssetsSchema>;

// export const listSharedValuesSchema = listSchema(sharedValueSchema);
// export type ListSharedValuesProps = z.infer<typeof listSharedValuesSchema>;

export const listProjectsSchema = listSchema.omit({
  projectId: true,
});
export type ListProjectsProps = z.infer<typeof listProjectsSchema>;

export const listGitTagsSchema = z.object({
  path: z.string(),
});
export type ListGitTagsProps = z.infer<typeof listGitTagsSchema>;
