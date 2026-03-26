import { z } from '@hono/zod-openapi';
import type { CoreResult } from '../util/shared.js';
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
  'Component',
  'Entry',
  'Value',
  'Release',
]);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export interface PaginatedList<T> {
  total: number;
  limit: number;
  offset: number;
  list: T[];
}

export function paginatedListOf<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    list: z.array(schema),
  });
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Implements create, read, update and delete methods
 */
export interface CrudService<T> {
  create: (props: never) => CoreResult<T>;
  read: (props: never) => CoreResult<T>;
  update: (props: never) => CoreResult<T>;
  delete: (props: never) => CoreResult<void>;
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
  list: (...props: never[]) => CoreResult<PaginatedList<T>>;
  /**
   * Returns the total number of this services objects
   */
  count: (...props: never[]) => CoreResult<number>;
}

const listSchema = z.object({
  projectId: uuidSchema,
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const listCollectionsSchema = listSchema;
export type ListCollectionsProps = z.infer<typeof listCollectionsSchema>;

export const listComponentsSchema = listSchema;
export type ListComponentsProps = z.infer<typeof listComponentsSchema>;

export const listEntriesSchema = listSchema.extend({
  collectionId: uuidSchema,
});
export type ListEntriesProps = z.infer<typeof listEntriesSchema>;

export const listAssetsSchema = listSchema;
export type ListAssetsProps = z.infer<typeof listAssetsSchema>;

export const listProjectsSchema = listSchema.omit({
  projectId: true,
});
export type ListProjectsProps = z.infer<typeof listProjectsSchema>;

export const listGitTagsSchema = z.object({
  path: z.string(),
});
export type ListGitTagsProps = z.infer<typeof listGitTagsSchema>;
