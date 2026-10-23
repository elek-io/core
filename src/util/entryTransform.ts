import type { Uuid } from '../schema/baseSchema.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { ProjectLanguages } from '../schema/projectSchema.js';
import {
  type ComponentResolver,
  getValueSchemaFromFieldDefinition,
} from '../schema/schemaFromFieldDefinition.js';
import type { Value } from '../schema/valueSchema.js';
import {
  contentLossIssues,
  lossOfRemovedField,
  narrowAllowlists,
} from './contentLoss.js';
import { buildDefaultValue } from './defaultValueBuilder.js';
import type { EntryIssue, EntryIssueType } from './entryIssue.js';
import type { FieldChange } from './fieldDefinitionDiff.js';
import { isDeepStrictEqual } from 'node:util';
import { CoreError } from './shared.js';

/**
 * Rejects a resolution naming a field the new definitions do not declare,
 * before anything on disk is touched.
 *
 * Such a slug used to be written into the Entry unvalidated, and throwing
 * from inside the cascade instead would fail with some Entries rewritten and
 * some not. Failing the whole update at the boundary leaves every one of them
 * as it was.
 *
 * @see ../../docs/schema-changes.md
 */
export function assertResolutionSlugsAreKnown(
  resolutions: Record<string, Record<string, Value>> | undefined,
  newFieldDefinitions: FieldDefinition[]
): void {
  if (resolutions === undefined) {
    return;
  }

  const declared = new Set(
    newFieldDefinitions.map((fieldDefinition) => fieldDefinition.slug)
  );

  for (const [entryId, entryResolutions] of Object.entries(resolutions)) {
    for (const fieldSlug of Object.keys(entryResolutions)) {
      if (declared.has(fieldSlug)) {
        continue;
      }
      // Ids and a field slug, both of which a log file may hold
      throw CoreError.badRequest(
        `Resolution for Entry "${entryId}" names field "${fieldSlug}", which the new field definitions do not declare`
      );
    }
  }
}

export interface TransformResult {
  values: Record<string, Value>;
  changed: boolean;
  issues: EntryIssue[];
}

/**
 * Rebuilds an Entry's values record on a field definition change, matching by
 * UUID, so a slug swap or a rename plus an add with the same slug is safe.
 *
 * Three of those changes delete stored content: a value whose definition is
 * gone, and the items and Entry references a narrowed `ofComponents` or
 * `ofCollections` no longer allows. Each raises a `content_loss` issue, so
 * the caller decides rather than the transform.
 *
 * @see ../../docs/schema-changes.md
 */
export function transformEntryValues(
  entryId: Uuid,
  collectionId: Uuid,
  entryValues: Record<string, Value>,
  oldFieldDefinitions: FieldDefinition[],
  newFieldDefinitions: FieldDefinition[],
  changes: FieldChange[],
  languages: ProjectLanguages,
  componentResolver?: ComponentResolver
): TransformResult {
  const issues: EntryIssue[] = [];

  // Build UUID lookup maps
  const oldSlugToUuid = new Map(
    oldFieldDefinitions.map((fieldDefinition) => [
      fieldDefinition.slug,
      fieldDefinition.id,
    ])
  );
  const uuidToNewFieldDef = new Map(
    newFieldDefinitions.map((fieldDefinition) => [
      fieldDefinition.id,
      fieldDefinition,
    ])
  );

  // Track which changes are updates (need validation)
  const updatedFieldIds = new Set(
    changes
      .filter(
        (change): change is Extract<FieldChange, { kind: 'updated' }> =>
          change.kind === 'updated'
      )
      .map((fieldChange) => fieldChange.newFieldDefinition.id)
  );

  // Track which fields were added
  const addedFieldIds = new Set(
    changes
      .filter(
        (change): change is Extract<FieldChange, { kind: 'added' }> =>
          change.kind === 'added'
      )
      .map((change) => change.fieldDefinition.id)
  );

  const newValues: Record<string, Value> = {};

  // Step 1: Process existing values - map old slugs to new slugs via UUID
  for (const [oldSlug, value] of Object.entries(entryValues)) {
    const fieldUuid = oldSlugToUuid.get(oldSlug);
    if (!fieldUuid) {
      // No UUID mapping found - orphaned value, skip (auto-strip)
      continue;
    }

    const newFieldDef = uuidToNewFieldDef.get(fieldUuid);
    if (!newFieldDef) {
      // UUID not in new defs - the field was removed and its value goes
      issues.push(
        ...contentLossIssues(
          {
            entryId,
            collectionId,
            fieldDefinitionId: fieldUuid,
            // The new definitions declare no slug for it, so the old one
            fieldSlug: oldSlug,
            transformedValues: {},
          },
          lossOfRemovedField(value)
        )
      );
      continue;
    }

    // Place value under new slug (handles renames), minus what the new
    // allowlists no longer allow
    const narrowed = narrowAllowlists(value, newFieldDef);
    const processedValue = narrowed.value;
    issues.push(
      ...contentLossIssues(
        {
          entryId,
          collectionId,
          fieldDefinitionId: fieldUuid,
          fieldSlug: newFieldDef.slug,
          transformedValues: {},
        },
        narrowed.losses
      )
    );

    // If field was updated (any property changed), validate against new schema
    if (updatedFieldIds.has(fieldUuid)) {
      const schema = getValueSchemaFromFieldDefinition(
        newFieldDef,
        languages,
        componentResolver
      );
      const result = schema.safeParse(processedValue);
      if (!result.success) {
        // Determine issue type based on whether valueType changed
        const oldFieldDef = oldFieldDefinitions.find(
          (fieldDefinition) => fieldDefinition.id === fieldUuid
        );
        const issueType: EntryIssueType =
          oldFieldDef && oldFieldDef.valueType !== newFieldDef.valueType
            ? 'type_mismatch'
            : 'constraint_violation';

        issues.push({
          entryId,
          collectionId,
          fieldDefinitionId: fieldUuid,
          fieldSlug: newFieldDef.slug,
          issue: issueType,
          currentValue: value,
          transformedValues: {}, // Will be filled after full rebuild
        });
      }
    }

    newValues[newFieldDef.slug] = processedValue;
  }

  // Step 2: Process added fields - populate with defaults
  for (const fieldId of addedFieldIds) {
    const fieldDef = uuidToNewFieldDef.get(fieldId)!;
    const defaultValue = buildDefaultValue(fieldDef, languages);

    if (defaultValue !== null) {
      newValues[fieldDef.slug] = defaultValue;
    } else {
      // Cannot auto-resolve - required field with no default
      issues.push({
        entryId,
        collectionId,
        fieldDefinitionId: fieldId,
        fieldSlug: fieldDef.slug,
        issue: 'missing_required',
        transformedValues: {}, // Will be filled after full rebuild
      });
    }
  }

  // Fill transformedValues on all issues
  for (const issue of issues) {
    issue.transformedValues = newValues;
  }

  const changed = isDeepStrictEqual(entryValues, newValues) === false;

  return { values: newValues, changed, issues };
}
