import { z } from 'zod';
import { assetSchema } from './assetSchema.js';
import { uuidSchema } from './baseSchema.js';
import { collectionSchema } from './collectionSchema.js';
import { entrySchema } from './entrySchema.js';
import { gitRepositoryPathSchema } from './gitSchema.js';
import { gitTagSchema } from './gitTagSchema.js';
import { projectSchema } from './projectSchema.js';

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
// function paginatedListOfSchema<Schema extends z.ZodTypeAny>(schema: Schema) {
//   return z.object({
//     total: z.number(),
//     limit: z.number(),
//     offset: z.number(),
//     list: z.array(schema),
//   });
// }
// const stringSchema = paginatedListOfSchema(z.string());
// type StringSchema = z.infer<typeof stringSchema>;

export interface PaginationOptions<T> {
  sort: Sort<T>[];
  filter: string;
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
export interface ExtendedCrudService<T> extends CrudService<T> {
  /**
   * Returns a filtered, sorted and paginated list
   * of this services models from given project
   *
   * @see AbstractCrudService.paginate
   *
   */
  list: (...props: any) => Promise<PaginatedList<T>>; // @todo change to "sort: Sort<T>[]" once schema.keyof() is not of type "never" anymore

  /**
   * Returns the total number of models inside given project
   */
  count: (...props: any) => Promise<number>;
}

function sortSchema<T extends z.AnyZodObject>(schema: T) {
  return z.object({
    by: schema.keyof(), // @todo schema.keyof() is of type "never" - why?
    order: z.enum(['asc', 'desc']),
  });
}
export type Sort<T> = {
  by: keyof T;
  order: 'asc' | 'desc';
};

function listSchema<T extends z.AnyZodObject>(schema: T) {
  return z.object({
    projectId: uuidSchema,
    sort: z.array(sortSchema(schema)).optional(),
    filter: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  });
}

export const listCollectionsSchema = listSchema(collectionSchema);
export type ListCollectionsProps = z.infer<typeof listCollectionsSchema>;

export const listEntriesSchema = listSchema(entrySchema).extend({
  collectionId: uuidSchema,
});
export type ListEntriesProps = z.infer<typeof listEntriesSchema>;

export const listAssetsSchema = listSchema(assetSchema);
export type ListAssetsProps = z.infer<typeof listAssetsSchema>;

// export const listSharedValuesSchema = listSchema(sharedValueSchema);
// export type ListSharedValuesProps = z.infer<typeof listSharedValuesSchema>;

export const listProjectsSchema = listSchema(projectSchema).omit({
  projectId: true,
});
export type ListProjectsProps = z.infer<typeof listProjectsSchema>;

export const listGitTagsSchema = listSchema(gitTagSchema)
  .omit({
    projectId: true,
  })
  .extend({
    path: gitRepositoryPathSchema,
  });
export type ListGitTagsProps = z.infer<typeof listGitTagsSchema>;
