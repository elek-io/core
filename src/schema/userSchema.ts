import { z } from '@hono/zod-openapi';
import { supportedLanguageSchema, uuidSchema } from './baseSchema.js';
import { gitSignatureSchema } from './gitSchema.js';

export const userTypeSchema = z.enum(['local', 'cloud']);

export const baseUserSchema = gitSignatureSchema.extend({
  userType: userTypeSchema,
  language: supportedLanguageSchema,
  /**
   * The elek.io account this User signed in with, or null if they have not
   *
   * Narrowed by each kind below, the same way `userType` is: a local User's
   * is always null and a Cloud User's is always set, so a User whose kind
   * and account disagree is not a shape anything can hold. The key is there
   * either way, so reading it never needs the kind checked first.
   */
  id: uuidSchema.nullable(),
});
export type BaseUser = z.infer<typeof baseUserSchema>;

export const localUserSchema = baseUserSchema.extend({
  userType: z.literal(userTypeSchema.enum.local),
  id: z.null(),
});
export type LocalUser = z.infer<typeof localUserSchema>;

export const cloudUserSchema = baseUserSchema.extend({
  userType: z.literal(userTypeSchema.enum.cloud),
  id: uuidSchema,
});
export type CloudUser = z.infer<typeof cloudUserSchema>;

export const userSettingsSchema = z.object({
  localApi: z.object({
    /**
     * Whether the local API should be started automatically. Stored for
     * elek.io clients to act on (elek.io Desktop auto-starts the local API on
     * launch). Core itself does not act on this flag.
     */
    isEnabled: z.boolean(),
    /**
     * The port the local API should use. Stored for elek.io clients to read,
     * Core never does. `core.api.start(port)` takes the port as an argument.
     */
    port: z.number(),
  }),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const userFileSchema = z.union([
  localUserSchema.extend(userSettingsSchema.shape),
  cloudUserSchema.extend(userSettingsSchema.shape),
]);
export type UserFile = z.infer<typeof userFileSchema>;

export const userSchema = userFileSchema;
export type User = z.infer<typeof userSchema>;

export const setUserSchema = userSchema;
export type SetUserProps = z.infer<typeof setUserSchema>;
