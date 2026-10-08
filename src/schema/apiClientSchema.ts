import { z } from '@hono/zod-openapi';

/**
 * Pagination for the generated API client. The whole object is optional so
 * `entries.list()` can be called with no arguments at all.
 *
 * Omitting them leaves the API's own defaults in place, `limit` 15 and
 * `offset` 0. `limit: 0` returns everything from `offset` on.
 */
export const paginationSchema = z
  .object({
    limit: z.number().optional(),
    offset: z.number().optional(),
  })
  .optional();
export type PaginationProps = z.infer<typeof paginationSchema>;

/**
 * Constructor props for the generated `apiClient({ baseUrl, apiKey })`, which
 * parses them at construction. A `baseUrl` that is not a URL therefore throws
 * there rather than on the first request.
 *
 * `apiKey` is sent as an `Authorization: Bearer` header on every call.
 */
export const apiClientSchema = z.object({
  baseUrl: z.url(),
  apiKey: z.string(),
});
export type ApiClientProps = z.infer<typeof apiClientSchema>;
