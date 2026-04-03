import type { SupportedLanguage, Uuid } from '../schema/baseSchema.js';
import { isDeepStrictEqual } from 'node:util';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { ComponentResolver } from '../schema/schemaFromFieldDefinition.js';
import type { Value } from '../schema/valueSchema.js';
import { buildDefaultValue } from './defaultValueBuilder.js';
import type { EntryIssue, TransformResult } from './entryTransform.js';
import type { FieldChange } from './fieldDefinitionDiff.js';
import { getValueSchemaFromFieldDefinition } from '../schema/schemaFromFieldDefinition.js';
import type { EntryIssueType } from './entryTransform.js';

/**
 * Transforms component item values within an entry when a Component's
 * fieldDefinitions change. Traverses all dynamic fields that reference
 * the changed component and rebuilds the nested values using UUID-based mapping.
 *
 * Handles nested components recursively with cycle protection.
 */
export function transformComponentValues(
  entryId: Uuid,
  collectionId: Uuid,
  entryValues: Record<string, Value>,
  componentId: Uuid,
  oldComponentFieldDefinitions: FieldDefinition[],
  newComponentFieldDefinitions: FieldDefinition[],
  changes: FieldChange[],
  referencingDynamicFieldSlugs: string[],
  languages: SupportedLanguage[],
  componentResolver?: ComponentResolver,
  visited: Set<string> = new Set()
): TransformResult {
  const issues: EntryIssue[] = [];
  let changed = false;

  // Cycle protection: track component types we've recursed *through*
  // (not the target componentId itself - we always need to process that)

  const newValues = { ...entryValues };

  // Build UUID lookup maps for the component's field definitions
  const oldSlugToUuid = new Map(
    oldComponentFieldDefinitions.map((fieldDefinition) => [
      fieldDefinition.slug,
      fieldDefinition.id,
    ])
  );
  const uuidToNewFieldDef = new Map(
    newComponentFieldDefinitions.map((fieldDefinition) => [
      fieldDefinition.id,
      fieldDefinition,
    ])
  );

  const updatedFieldIds = new Set(
    changes
      .filter(
        (change): change is Extract<FieldChange, { kind: 'updated' }> =>
          change.kind === 'updated'
      )
      .map((change) => change.newFieldDefinition.id)
  );
  const addedFieldIds = new Set(
    changes
      .filter(
        (change): change is Extract<FieldChange, { kind: 'added' }> =>
          change.kind === 'added'
      )
      .map((change) => change.fieldDefinition.id)
  );

  for (const dynamicSlug of referencingDynamicFieldSlugs) {
    const dynamicValue = newValues[dynamicSlug];
    if (!dynamicValue || dynamicValue.valueType !== 'component') continue;

    const newContent = dynamicValue.content.map((item) => {
      if (item.componentId !== componentId) {
        // Not the component we're transforming - recurse into nested items
        // Cycle protection: skip if we've already recursed through this component type
        if (visited.has(item.componentId)) {
          return item;
        }
        const nestedVisited = new Set(visited);
        nestedVisited.add(item.componentId);
        const nestedResult = transformNestedComponentItems(
          entryId,
          collectionId,
          item.values,
          componentId,
          oldComponentFieldDefinitions,
          newComponentFieldDefinitions,
          changes,
          languages,
          componentResolver,
          nestedVisited
        );
        if (nestedResult.changed) {
          changed = true;
          issues.push(...nestedResult.issues);
          return { ...item, values: nestedResult.values };
        }
        issues.push(...nestedResult.issues);
        return item;
      }

      // This item matches the component - rebuild its values
      const rebuiltValues: Record<string, Value> = {};
      const itemIssues: EntryIssue[] = [];

      // Map existing values to new slugs via UUID
      for (const [oldSlug, value] of Object.entries(item.values)) {
        const fieldUuid = oldSlugToUuid.get(oldSlug);
        if (!fieldUuid) continue; // Orphaned
        const newFieldDef = uuidToNewFieldDef.get(fieldUuid);
        if (!newFieldDef) continue; // Removed

        const processedValue = value;

        // Validate if field was updated
        if (updatedFieldIds.has(fieldUuid)) {
          const schema = getValueSchemaFromFieldDefinition(
            newFieldDef,
            componentResolver
          );
          const result = schema.safeParse(processedValue);
          if (!result.success) {
            const oldFieldDef = oldComponentFieldDefinitions.find(
              (fieldDefinition) => fieldDefinition.id === fieldUuid
            );
            const issueType: EntryIssueType =
              oldFieldDef && oldFieldDef.valueType !== newFieldDef.valueType
                ? 'type_mismatch'
                : 'constraint_violation';

            itemIssues.push({
              entryId,
              collectionId,
              fieldDefinitionId: fieldUuid,
              fieldSlug: newFieldDef.slug,
              issue: issueType,
              currentValue: value,
              componentItemId: item.id,
              transformedValues: {}, // Filled later
            });
          }
        }

        rebuiltValues[newFieldDef.slug] = processedValue;
      }

      // Add new fields
      for (const fieldId of addedFieldIds) {
        const fieldDef = uuidToNewFieldDef.get(fieldId)!;
        const defaultValue = buildDefaultValue(fieldDef, languages);
        if (defaultValue !== null) {
          rebuiltValues[fieldDef.slug] = defaultValue;
        } else {
          itemIssues.push({
            entryId,
            collectionId,
            fieldDefinitionId: fieldId,
            fieldSlug: fieldDef.slug,
            issue: 'missing_required',
            componentItemId: item.id,
            transformedValues: {}, // Filled later
          });
        }
      }

      issues.push(...itemIssues);

      if (isDeepStrictEqual(item.values, rebuiltValues) === false) {
        changed = true;
      }

      return { ...item, values: rebuiltValues };
    });

    if (changed || issues.length > 0) {
      const value: Value = {
        ...dynamicValue,
        content: newContent,
      };
      newValues[dynamicSlug] = value;
    }
  }

  // Fill transformedValues after newValues is fully updated
  for (const issue of issues) {
    issue.transformedValues = newValues;
  }

  return { values: newValues, changed, issues };
}

/**
 * Recursively searches for and transforms nested component items
 * within a values record.
 */
function transformNestedComponentItems(
  entryId: Uuid,
  collectionId: Uuid,
  values: Record<string, Value>,
  componentId: Uuid,
  oldComponentFieldDefinitions: FieldDefinition[],
  newComponentFieldDefinitions: FieldDefinition[],
  changes: FieldChange[],
  languages: SupportedLanguage[],
  componentResolver?: ComponentResolver,
  visited: Set<string> = new Set()
): TransformResult {
  let changed = false;
  const issues: EntryIssue[] = [];
  const newValues = { ...values };

  for (const [slug, value] of Object.entries(values)) {
    if (value.valueType !== 'component') continue;

    const result = transformComponentValues(
      entryId,
      collectionId,
      { [slug]: value },
      componentId,
      oldComponentFieldDefinitions,
      newComponentFieldDefinitions,
      changes,
      [slug],
      languages,
      componentResolver,
      new Set(visited)
    );

    if (result.changed) {
      changed = true;
      newValues[slug] = result.values[slug]!;
    }
    issues.push(...result.issues);
  }

  return { values: newValues, changed, issues };
}
