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

/**
 * A username or a token git is handed through the credential protocol,
 * which carries one value per line, so neither may hold a control character
 */
const cloudGitCredentialValueSchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[^\p{Cc}]+$/u, 'Must not contain control characters');

/** The git remote of a Project on one of elek.io Cloud's git hosts */
const cloudGitRemoteUrlSchema = z.url({ protocol: /^https?$/ });

/**
 * What `POST /management/v1/projects/{id}/git-token` answers: a new token
 * for the Project's git host, which replaces every older token the session
 * holds on that host
 *
 * @see ../../contributing/cloud.md
 */
export const cloudGitTokenResponseSchema = z.object({
  gitToken: z.object({
    username: cloudGitCredentialValueSchema,
    token: cloudGitCredentialValueSchema,
    remoteUrl: cloudGitRemoteUrlSchema,
  }),
});
export type CloudGitTokenResponse = z.infer<typeof cloudGitTokenResponseSchema>;

/**
 * What `PUT /management/v1/projects/{id}/git-access` answers: the token the
 * session already holds for the Project's git host reaches it too
 *
 * @see ../../contributing/cloud.md
 */
export const cloudGitAccessResponseSchema = z.object({
  gitAccess: z.object({
    username: cloudGitCredentialValueSchema,
    remoteUrl: cloudGitRemoteUrlSchema,
  }),
});
export type CloudGitAccessResponse = z.infer<
  typeof cloudGitAccessResponseSchema
>;
