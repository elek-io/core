import type { SupportedLanguage, Uuid } from '../schema/baseSchema.js';
import type {
  ComponentValue,
  ReferencedValue,
  Value,
} from '../schema/valueSchema.js';

/**
 * Why an update to a Collection's or Component's field definitions cannot be
 * applied as sent.
 *
 * `content_loss` is the only one a caller accepts rather than resolves, the
 * other four ask for a corrected Value.
 *
 * @see ../../docs/schema-changes.md
 */
export type EntryIssueType =
  | 'missing_required'
  | 'type_mismatch'
  | 'constraint_violation'
  | 'unique_collision'
  | 'content_loss';

/**
 * Where an issue sits: the Entry, the field definition by id and by its new
 * slug, and the Component item when the field belongs to a Component.
 */
export interface EntryIssueLocation {
  entryId: Uuid;
  collectionId: Uuid;
  fieldDefinitionId: Uuid;
  fieldSlug: string;
  componentItemId?: Uuid;
  /** The Entry's values as the deterministic transforms leave them. */
  transformedValues: Record<string, Value>;
}

/**
 * A change an existing Value cannot follow on its own. The caller answers
 * with a corrected Value under `resolutions`.
 */
export interface EntryTransformIssue extends EntryIssueLocation {
  issue: 'missing_required' | 'type_mismatch' | 'constraint_violation';
  currentValue?: Value;
}

/**
 * Two Entries holding the same Value in one language, for a field that just
 * turned unique. Carries the same three fields as `UniqueValueConflict`, so
 * an editor renders both the same way.
 */
export interface UniqueCollisionIssue extends EntryIssueLocation {
  issue: 'unique_collision';
  value: string;
  language: SupportedLanguage;
  conflictingEntryId: Uuid;
}

/** What about a field definition change deletes stored content. */
export type ContentLossReason =
  'field_removed' | 'components_narrowed' | 'collections_narrowed';

/** The field definition is gone, so the whole Value goes with it. */
export interface FieldRemovedLoss {
  reason: 'field_removed';
  currentValue: Value;
}

/** `ofComponents` no longer allows Component items the Value holds. */
export interface ComponentsNarrowedLoss {
  reason: 'components_narrowed';
  /** Holds only the Component items that would go. */
  currentValue: ComponentValue;
  itemCount: number;
}

/** `ofCollections` no longer allows Entry references the Value holds. */
export interface CollectionsNarrowedLoss {
  reason: 'collections_narrowed';
  /** Holds only the Entry references that would go, under `language`. */
  currentValue: ReferencedValue;
  itemCount: number;
  language: SupportedLanguage;
}

/** One drop a field definition change would make to one stored Value. */
export type ValueLoss =
  FieldRemovedLoss | ComponentsNarrowedLoss | CollectionsNarrowedLoss;

/**
 * Stored content the update would delete for good. It is accepted rather
 * than resolved: list `fieldDefinitionId` under `acceptedContentLoss` and
 * send the same update again.
 *
 * @see ../../docs/schema-changes.md
 */
export type ContentLossIssue = EntryIssueLocation & {
  issue: 'content_loss';
} & ValueLoss;

/**
 * Everything one update reports about one Entry, thrown as the `cause` of a
 * `Conflict`. Branch on `issue`, which is exhaustive over `EntryIssueType`.
 */
export type EntryIssue =
  EntryTransformIssue | UniqueCollisionIssue | ContentLossIssue;
