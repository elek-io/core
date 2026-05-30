import type { FieldDefinition } from '../schema/fieldSchema.js';
import { isDeepStrictEqual } from 'node:util';

export interface FieldChangeAdded {
  kind: 'added';
  fieldDefinition: FieldDefinition;
}

export interface FieldChangeRemoved {
  kind: 'removed';
  oldFieldDefinition: FieldDefinition;
}

export interface FieldChangeUpdated {
  kind: 'updated';
  oldFieldDefinition: FieldDefinition;
  newFieldDefinition: FieldDefinition;
}

export type FieldChange =
  | FieldChangeAdded
  | FieldChangeRemoved
  | FieldChangeUpdated;

/**
 * Compares old and new field definitions by UUID and classifies each change.
 *
 * - UUID in old but not new → `removed`
 * - UUID in new but not old → `added`
 * - UUID in both but any property differs → `updated`
 * - UUID in both and identical → not included in output
 */
export function diffFieldDefinitions(
  oldDefinitions: FieldDefinition[],
  newDefinitions: FieldDefinition[]
): FieldChange[] {
  const changes: FieldChange[] = [];

  const oldById = new Map(
    oldDefinitions.map((fieldDefinition) => [
      fieldDefinition.id,
      fieldDefinition,
    ])
  );
  const newById = new Map(
    newDefinitions.map((fieldDefinition) => [
      fieldDefinition.id,
      fieldDefinition,
    ])
  );

  // Removed: in old but not in new
  for (const [id, oldFieldDefinition] of oldById) {
    if (!newById.has(id)) {
      changes.push({ kind: 'removed', oldFieldDefinition });
    }
  }

  // Added: in new but not in old
  for (const [id, fieldDefinition] of newById) {
    if (!oldById.has(id)) {
      changes.push({ kind: 'added', fieldDefinition });
    }
  }

  // Updated: in both but different
  for (const [id, newFieldDefinition] of newById) {
    const oldFieldDefinition = oldById.get(id);
    if (
      oldFieldDefinition &&
      isDeepStrictEqual(oldFieldDefinition, newFieldDefinition) === false
    ) {
      changes.push({
        kind: 'updated',
        oldFieldDefinition,
        newFieldDefinition,
      });
    }
  }

  return changes;
}
