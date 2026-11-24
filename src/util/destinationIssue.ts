import type { SupportedLanguage, Uuid } from '../schema/baseSchema.js';

/**
 * Why a Destination cannot take what the Project holds.
 *
 * The first three are about the Mapping and hold for every Entry, the last
 * two about one Entry's Values. They are spelled like the matching
 * `EntryIssueType`, so an editor words both the same way.
 *
 * @see ./entryIssue.ts
 */
export type DestinationIssueType =
  | 'collection_not_mapped'
  | 'field_not_mapped'
  | 'reference_not_mapped'
  | 'missing_required'
  | 'constraint_violation';

/** What every issue of a Destination carries */
export interface DestinationIssueBase {
  destinationId: Uuid;
  /** The Collection of the Contract the issue is about */
  contractCollectionId: Uuid;
  message: string;
}

/**
 * The Mapping does not fill what the Contract needs, whatever the Entries
 * hold. `contractFieldDefinitionId` is absent only for
 * `collection_not_mapped`, which is about the whole Collection.
 */
export interface DestinationMappingIssue extends DestinationIssueBase {
  issue: 'collection_not_mapped' | 'field_not_mapped' | 'reference_not_mapped';
  contractFieldDefinitionId?: Uuid;
}

/**
 * One Entry's Value does not fit the field of the Contract it fills. It
 * names both sides, so an editor can open the Project's own field.
 */
export interface DestinationValueIssue extends DestinationIssueBase {
  issue: 'missing_required' | 'constraint_violation';
  contractFieldDefinitionId: Uuid;
  contractFieldSlug: string;
  entryId: Uuid;
  collectionId: Uuid;
  fieldDefinitionId: Uuid;
  fieldSlug: string;
  /** Absent for an issue that is not about one language */
  language?: SupportedLanguage;
}

/**
 * Everything one check reports. Branch on `issue`, which is exhaustive over
 * `DestinationIssueType`.
 */
export type DestinationIssue = DestinationMappingIssue | DestinationValueIssue;
