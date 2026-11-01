import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { ComponentItem, Value } from '../schema/valueSchema.js';
import { CoreError } from './shared.js';

/**
 * What one Entry's resolutions answer for a Component update: a corrected
 * Value per field slug, per Component item id.
 */
export type ComponentItemResolutions = Record<string, Record<string, Value>>;

/**
 * Rejects a resolution naming a field the new definitions do not declare,
 * before anything on disk is touched.
 *
 * Throwing from inside the cascade instead would fail with some Entries
 * rewritten and some not. The message carries ids and a field slug, both of
 * which a log file may hold.
 *
 * @see ../../docs/schema-changes.md
 */
export function assertComponentResolutionSlugsAreKnown(
  resolutions: Record<string, ComponentItemResolutions> | undefined,
  newFieldDefinitions: FieldDefinition[]
): void {
  if (resolutions === undefined) {
    return;
  }

  const declared = new Set(
    newFieldDefinitions.map((fieldDefinition) => fieldDefinition.slug)
  );

  for (const [entryId, itemResolutions] of Object.entries(resolutions)) {
    for (const [itemId, fieldResolutions] of Object.entries(itemResolutions)) {
      for (const fieldSlug of Object.keys(fieldResolutions)) {
        if (declared.has(fieldSlug)) {
          continue;
        }
        throw CoreError.badRequest(
          `Resolution for Component item "${itemId}" of Entry "${entryId}" names field "${fieldSlug}", which the new field definitions do not declare`
        );
      }
    }
  }
}

/**
 * The Component item carrying `itemId`, wherever it sits in an Entry's
 * values, or `undefined` when the Entry holds no such item.
 *
 * An item's own values hold Values again, so the search walks every
 * component-valued field it meets, at any depth. Pure and non-throwing.
 */
export function findComponentItem(
  values: Record<string, Value>,
  itemId: string
): ComponentItem | undefined {
  for (const value of Object.values(values)) {
    if (value.valueType !== 'component') {
      continue;
    }
    for (const item of value.content) {
      if (item.id === itemId) {
        return item;
      }
      const nested = findComponentItem(item.values, itemId);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

/**
 * The Entry's values with each named Component item's fields replaced by the
 * Values given for it, as a new tree at every level.
 *
 * An item's resolution goes in before the walk continues into it, so a
 * resolution for an item inside a Component Value another resolution replaces
 * still lands. It is spent once applied, so a Value naming the item it
 * replaces is not walked forever.
 *
 * Nothing is mutated: the tree shares items with the stored Entry, and the
 * comparison that decides whether to write it would miss the change.
 */
export function withComponentItemValues(
  values: Record<string, Value>,
  itemResolutions: ComponentItemResolutions
): Record<string, Value> {
  const next: Record<string, Value> = {};

  for (const [fieldSlug, value] of Object.entries(values)) {
    if (value.valueType !== 'component') {
      next[fieldSlug] = value;
      continue;
    }
    next[fieldSlug] = {
      ...value,
      content: value.content.map((item) => {
        const resolved = itemResolutions[item.id];
        if (!resolved) {
          return {
            ...item,
            values: withComponentItemValues(item.values, itemResolutions),
          };
        }
        const { [item.id]: _spent, ...rest } = itemResolutions;
        return {
          ...item,
          values: withComponentItemValues(
            { ...item.values, ...resolved },
            rest
          ),
        };
      }),
    };
  }

  return next;
}
