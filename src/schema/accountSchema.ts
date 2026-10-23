import { z } from '@hono/zod-openapi';
import { uuidSchema } from './baseSchema.js';
import { cloudTokenSchema } from './cloudSchema.js';
import { baseUserSchema } from './userSchema.js';

/**
 * The password of an elek.io account, 12 to 128 long
 *
 * A length counts Unicode code points, the way Zod counts them, so a smiling
 * face emoji counts as one while a flag counts as two. elek.io Cloud holds
 * limits of its own, so a password Core accepts can still be refused there.
 */
export const accountPasswordSchema = z.string().min(12).max(128);

/**
 * An elek.io account, as the session Core holds belongs to it
 *
 * The name and the address carry the caps a User does, so an account always
 * fits the `cloud` User signing in makes of it.
 */
export const cloudAccountSchema = z.object({
  id: uuidSchema,
  name: baseUserSchema.shape.name,
  email: baseUserSchema.shape.email,
});
export type CloudAccount = z.infer<typeof cloudAccountSchema>;

/**
 * A session Core signed in to: the bearer token every later call using it
 * carries, and the account it belongs to
 *
 * Core keeps the token in memory only. A host that wants the session to
 * outlive the process persists the token and passes it back as `cloud.token`.
 */
export const cloudSessionSchema = z.object({
  token: cloudTokenSchema,
  account: cloudAccountSchema,
});
export type CloudSession = z.infer<typeof cloudSessionSchema>;

export const signUpSchema = z.object({
  name: baseUserSchema.shape.name,
  email: baseUserSchema.shape.email,
  password: accountPasswordSchema,
});
export type SignUpProps = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: baseUserSchema.shape.email,
  /**
   * Not held to the 12 a new password needs, so a wrong one is refused by
   * elek.io Cloud as a wrong password rather than by Core as too short
   */
  password: z.string().min(1).max(128),
});
export type SignInProps = z.infer<typeof signInSchema>;

/**
 * What signing up came to: a `session` Core signed in to, or the
 * `verification` an address needs before anybody can sign in with it
 */
export const signUpOutcomeSchema = z.enum(['session', 'verification']);
export type SignUpOutcome = z.infer<typeof signUpOutcomeSchema>;

export const signUpResultSchema = z.discriminatedUnion('outcome', [
  cloudSessionSchema.extend({
    outcome: z.literal(signUpOutcomeSchema.enum.session),
  }),
  /**
   * No account, because elek.io Cloud answers the same for a new address and
   * for one an account already holds, with an account made up for the latter
   */
  z.object({
    outcome: z.literal(signUpOutcomeSchema.enum.verification),
  }),
]);
export type SignUpResult = z.infer<typeof signUpResultSchema>;

/**
 * The part of what signing in answers that Core reads. The token arrives in
 * a header rather than in the body
 */
export const signInResponseSchema = z.object({
  user: cloudAccountSchema,
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;

/**
 * The part of what signing up answers that Core reads. A null `token` means
 * the address has to be verified, and the `user` beside it is then not read
 */
export const signUpResponseSchema = z.union([
  z.object({ token: z.null() }),
  z.object({ token: z.string(), user: cloudAccountSchema }),
]);
export type SignUpResponse = z.infer<typeof signUpResponseSchema>;

/**
 * The part of a session read that Core reads, or null when the token is not
 * a live session
 */
export const sessionResponseSchema = z
  .object({ user: cloudAccountSchema })
  .nullable();
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
