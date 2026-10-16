import { z } from '@hono/zod-openapi';

/**
 * A bearer token for elek.io Cloud, as Core is handed it and as it sends it
 *
 * Printable ASCII with no whitespace, because it travels in an HTTP header
 * and `fetch` throws on a header value holding anything else, quoting the
 * value in its message. No message here repeats the token.
 */
export const cloudTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .regex(/^[\x21-\x7E]+$/, 'Token must be printable ASCII with no whitespace');
export type CloudToken = z.infer<typeof cloudTokenSchema>;

/**
 * The part of a refusal Core reads, to tell two refusals sharing a status
 * apart. Read to pick a `CoreError` type and never written into a message
 */
export const cloudErrorResponseSchema = z.object({
  code: z.string(),
});
export type CloudErrorResponse = z.infer<typeof cloudErrorResponseSchema>;
