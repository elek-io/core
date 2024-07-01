import z from 'zod';
import { supportedLanguageSchema, uuidSchema } from './baseSchema.js';
import { gitSignatureSchema } from './gitSchema.js';

export const UserTypeSchema = z.enum(['local', 'cloud']);

export const baseUserSchema = gitSignatureSchema.extend({
  userType: UserTypeSchema,
  language: supportedLanguageSchema,
});
export type BaseUser = z.infer<typeof baseUserSchema>;

export const localUserSchema = baseUserSchema.extend({
  userType: z.literal(UserTypeSchema.Enum.local),
});
export type LocalUser = z.infer<typeof localUserSchema>;

export const cloudUserSchema = baseUserSchema.extend({
  userType: z.literal(UserTypeSchema.Enum.cloud),
  id: uuidSchema,
});
export type CloudUser = z.infer<typeof cloudUserSchema>;

export const userFileSchema = z.union([localUserSchema, cloudUserSchema]);
export type UserFile = z.infer<typeof userFileSchema>;

export const userSchema = userFileSchema;
export type User = z.infer<typeof userSchema>;

export const setUserSchema = userSchema;
export type SetUserProps = z.infer<typeof setUserSchema>;
