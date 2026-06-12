import { supportedLanguageSchema } from '../schema/baseSchema.js';
import type { SupportedLanguage, Uuid } from '../schema/baseSchema.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { Value } from '../schema/valueSchema.js';

/**
 * A single non-null unique value held by an Entry, located by field and language.
 */
export interface UniqueFieldValue {
  fieldDefinitionId: Uuid;
  fieldSlug: string;
  language: SupportedLanguage;
  value: string;
}

/**
 * A group of Entries that share the same value for a unique field and language.
 * Reported when more than one Entry holds the value (a collision).
 */
export interface UniqueValueCollision {
  fieldDefinitionId: Uuid;
  fieldSlug: string;
  language: SupportedLanguage;
  value: string;
  /**
   * Ids of all Entries holding this value, in the order they were provided.
   */
  entryIds: Uuid[];
}

/**
 * Whether a field definition participates in uniqueness enforcement.
 * Only top-level direct-string fields qualify: a `slug` field (always unique)
 * or any string field with `isUnique: true`. Non-string types are forced to
 * `isUnique: false` by the schema, so this never matches them.
 */
export function isUniqueFieldDefinition(
  fieldDefinition: FieldDefinition
): boolean {
  return (
    fieldDefinition.valueType === 'string' &&
    (fieldDefinition.fieldType === 'slug' || fieldDefinition.isUnique === true)
  );
}

/**
 * Filters a flat list of field definitions to those that enforce uniqueness.
 */
export function getUniqueFieldDefinitions(
  fieldDefinitions: FieldDefinition[]
): FieldDefinition[] {
  return fieldDefinitions.filter(isUniqueFieldDefinition);
}

/**
 * Extracts an Entry's non-null unique values, one per (field, language).
 * Null/unset language slots are skipped (they never collide).
 */
export function extractUniqueFieldValues(
  fieldDefinitions: FieldDefinition[],
  values: Record<string, Value>
): UniqueFieldValue[] {
  const result: UniqueFieldValue[] = [];
  for (const fieldDefinition of getUniqueFieldDefinitions(fieldDefinitions)) {
    const value = values[fieldDefinition.slug];
    // Unique fields are always direct string values
    if (!value || value.valueType !== 'string') {
      continue;
    }
    for (const [language, content] of Object.entries(value.content)) {
      if (typeof content === 'string') {
        result.push({
          fieldDefinitionId: fieldDefinition.id,
          fieldSlug: fieldDefinition.slug,
          // Object.entries widens the key to string. The content is keyed by
          // SupportedLanguage and was validated upstream, so parse narrows it
          // back without a cast.
          language: supportedLanguageSchema.parse(language),
          value: content,
        });
      }
    }
  }
  return result;
}

/**
 * Separator for the composite collision key. A NUL (U+0000) can never appear
 * in a field slug or language code, so the first two segments stay unambiguous.
 * An arbitrary isUnique text value may contain a NUL, but the value is the
 * trailing segment of the key, so the key stays injective regardless. Built
 * with String.fromCharCode so this source file stays plain text rather than
 * containing a raw NUL byte.
 */
const KEY_SEPARATOR = String.fromCharCode(0);

/**
 * Composite map key for a (field, language, value) triple.
 */
function collisionKey(fieldSlug: string, language: string, value: string) {
  return `${fieldSlug}${KEY_SEPARATOR}${language}${KEY_SEPARATOR}${value}`;
}

/**
 * Detects, across a set of Entries, every (field, language, value) triple held
 * by more than one Entry. Pure and order-preserving: the first Entry to hold a
 * value appears first in `entryIds`. Used both to validate a Collection update
 * that introduces uniqueness and to flag duplicates during an index rebuild.
 */
export function detectUniqueValueCollisions(
  fieldDefinitions: FieldDefinition[],
  entries: Array<{ entryId: Uuid; values: Record<string, Value> }>
): UniqueValueCollision[] {
  const byKey = new Map<string, UniqueValueCollision>();
  for (const entry of entries) {
    for (const uniqueValue of extractUniqueFieldValues(
      fieldDefinitions,
      entry.values
    )) {
      const key = collisionKey(
        uniqueValue.fieldSlug,
        uniqueValue.language,
        uniqueValue.value
      );
      const existing = byKey.get(key);
      if (existing) {
        existing.entryIds.push(entry.entryId);
      } else {
        byKey.set(key, {
          fieldDefinitionId: uniqueValue.fieldDefinitionId,
          fieldSlug: uniqueValue.fieldSlug,
          language: uniqueValue.language,
          value: uniqueValue.value,
          entryIds: [entry.entryId],
        });
      }
    }
  }
  return [...byKey.values()].filter(
    (collision) => collision.entryIds.length > 1
  );
}
