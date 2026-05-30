import { z } from '@hono/zod-openapi';

/**
 * Pagination schema used by the generated API client.
 * Both limit and offset are optional - the entire object is optional too,
 * allowing `entries.list()` to be called without arguments.
 */
export const paginationSchema = z
  .object({
    limit: z.number().optional(),
    offset: z.number().optional(),
  })
  .optional();
export type PaginationProps = z.infer<typeof paginationSchema>;

/**
 * Schema for the generated API client constructor props.
 */
export const apiClientSchema = z.object({
  baseUrl: z.url(),
  apiKey: z.string(),
});
export type ApiClientProps = z.infer<typeof apiClientSchema>;
