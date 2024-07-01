import { z } from 'zod';
import { uuidSchema } from './baseSchema.js';
import {
  gitCommitSchema,
  gitRepositoryPathSchema,
  gitSignatureSchema,
} from './gitSchema.js';

export const gitTagSchema = z.object({
  id: uuidSchema,
  message: z.string(),
  author: gitSignatureSchema,
  timestamp: z.number(),
});
export type GitTag = z.infer<typeof gitTagSchema>;

export const createGitTagSchema = gitTagSchema
  .pick({
    message: true,
  })
  .extend({
    path: gitRepositoryPathSchema,
    hash: gitCommitSchema.shape.hash.optional(),
  });
export type CreateGitTagProps = z.infer<typeof createGitTagSchema>;

export const readGitTagSchema = z.object({
  path: gitRepositoryPathSchema,
  id: uuidSchema.readonly(),
});
export type ReadGitTagProps = z.infer<typeof readGitTagSchema>;

export const deleteGitTagSchema = readGitTagSchema.extend({});
export type DeleteGitTagProps = z.infer<typeof deleteGitTagSchema>;

export const countGitTagsSchema = z.object({
  path: gitRepositoryPathSchema,
});
export type CountGitTagsProps = z.infer<typeof countGitTagsSchema>;
