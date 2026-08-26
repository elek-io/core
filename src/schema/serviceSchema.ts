import { z } from '@hono/zod-openapi';
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
  'Reference',
  'Report',
]);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export interface PaginatedList<T> {
  total: number;
  limit: number;
  offset: number;
  list: T[];
}

/**
 * The zod counterpart of the `PaginatedList<T>` interface above.
 *
 * The local API describes its list responses with it in OpenAPI, and the
 * generated API client parses responses through it, so the two shapes have to
 * stay in step.
 *
 * `total` is how many objects exist, not how many `list` holds.
 */
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
 * `props: never` is deliberate. It lets every implementing service declare
 * its own props type while this interface pins only the method names and the
 * return types.
 */
export interface CrudService<T> {
  create: (props: never) => Promise<T>;
  read: (props: never) => Promise<T>;
  update: (props: never) => Promise<T>;
  delete: (props: never) => Promise<void>;
}

/**
 * A service that can also page through its objects: `list` returns a
 * `PaginatedList` while `count` reports the whole set.
 */
export interface CrudServiceWithListCount<T> extends CrudService<T> {
  /**
   * One page, and the contract every implementation owes its own block,
   * because a concrete block replaces this one in the consumer's editor
   * rather than adding to it.
   *
   * `limit` defaults to 15 and `limit: 0` returns everything from `offset`.
   * `total` counts the references on disk rather than the page. Anything that
   * fails to read, a missing file, an IO error or a schema rejection, is
   * dropped with a logged warning instead of failing the call, so `list` can
   * be shorter than both `limit` and `total`.
   */
  list: (...props: never[]) => Promise<PaginatedList<T>>;
  /**
   * Counts file references without reading or validating one, so it reports
   * the same number `list` returns as `total` and includes objects `list`
   * silently skips. The two can therefore disagree.
   */
  count: (...props: never[]) => Promise<number>;
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
