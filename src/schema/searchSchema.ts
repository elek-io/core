import { z } from 'zod';
import { translatableStringSchema } from './baseSchema.js';
import {
  valueContentReferenceToAssetSchema,
  valueContentReferenceToCollectionSchema,
  valueContentReferenceToEntrySchema,
} from './valueSchema.js';

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

export const assetSearchResultSchema =
  valueContentReferenceToAssetSchema.extend({
    name: z.string(),
    matches: z.array(searchResultExcerptSchema),
  });
export type AssetSearchResult = z.infer<typeof assetSearchResultSchema>;

export const collectionSearchResultSchema =
  valueContentReferenceToCollectionSchema.extend({
    name: translatableStringSchema,
    matches: z.array(searchResultExcerptSchema),
  });
export type CollectionSearchResult = z.infer<
  typeof collectionSearchResultSchema
>;

export const entrySearchResultSchema =
  valueContentReferenceToEntrySchema.extend({
    name: z.string(),
    matches: z.array(searchResultExcerptSchema),
  });
export type EntrySearchResult = z.infer<typeof entrySearchResultSchema>;

export const searchResultSchema = z.union([
  assetSearchResultSchema,
  collectionSearchResultSchema,
  entrySearchResultSchema,
]);
export type SearchResult = z.infer<typeof searchResultSchema>;
