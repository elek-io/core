import { z } from 'zod';
import {
  objectTypeSchema,
  supportedLanguageSchema,
  uuidSchema,
} from './baseSchema.js';

export const searchOptionsSchema = z.object({
  caseSensitive: z.boolean(),
});
export type SearchOptions = z.infer<typeof searchOptionsSchema>;

export const searchResultExcerptSchema = z.object({
  key: z.string(),
  prefix: z.string(),
  match: z.string(),
  suffix: z.string(),
});
export type SearchResultExcerpt = z.infer<typeof searchResultExcerptSchema>;

export const searchResultSchema = z.object({
  id: uuidSchema,
  language: supportedLanguageSchema.optional(),
  name: z.string(),
  type: objectTypeSchema,
  matches: z.array(searchResultExcerptSchema),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
