import { z } from '@hono/zod-openapi';
import { supportedLanguageSchema, uuidSchema } from './baseSchema.js';
import { gitSignatureSchema } from './gitSchema.js';

export const userTypeSchema = z.enum(['local', 'cloud']);

export const baseUserSchema = gitSignatureSchema.extend({
  userType: userTypeSchema,
  language: supportedLanguageSchema,
  localApi: z.object({
    /**
     * Whether the local API should be started automatically. Stored for
     * elek.io clients to act on (elek.io Desktop auto-starts the local API on
     * launch). Core itself does not act on this flag.
     */
    isEnabled: z.boolean(),
    /**
     * The port the local API should use
     */
    port: z.number(),
  }),
});
export type BaseUser = z.infer<typeof baseUserSchema>;

export const localUserSchema = baseUserSchema.extend({
  userType: z.literal(userTypeSchema.enum.local),
});
export type LocalUser = z.infer<typeof localUserSchema>;

export const cloudUserSchema = baseUserSchema.extend({
  userType: z.literal(userTypeSchema.enum.cloud),
  id: uuidSchema,
});
export type CloudUser = z.infer<typeof cloudUserSchema>;

export const userFileSchema = z.union([localUserSchema, cloudUserSchema]);
export type UserFile = z.infer<typeof userFileSchema>;

export const userSchema = userFileSchema;
export type User = z.infer<typeof userSchema>;

export const setUserSchema = userSchema;
export type SetUserProps = z.infer<typeof setUserSchema>;
