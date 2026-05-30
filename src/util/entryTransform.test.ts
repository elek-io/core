import { describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { transformEntryValues } from './entryTransform.js';
import { diffFieldDefinitions } from './fieldDefinitionDiff.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { ProjectLanguages } from '../schema/projectSchema.js';
import type {
  ComponentValue,
  ReferencedValue,
  Value,
} from '../schema/valueSchema.js';

const languages: ProjectLanguages = ['en', 'de'];
const entryId = uuid();
const collectionId = uuid();

function makeTextField(
  overrides: Partial<FieldDefinition> & { id: string; slug: string }
): FieldDefinition {
  return {
    valueType: 'string',
    fieldType: 'text',
    label: { en: overrides.slug },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    defaultValue: null,
    min: null,
    max: null,
    ...overrides,
  } as FieldDefinition;
}

function makeStringValue(content: Record<string, string | null>): Value {
  return {
    objectType: 'value',
    valueType: 'string',
    content,
  };
}

describe('transformEntryValues', () => {
  it('returns unchanged values when no changes', () => {
    const fieldId = uuid();
    const defs = [makeTextField({ id: fieldId, slug: 'title' })];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: 'Hello', de: 'Hallo' }),
    };
    const changes = diffFieldDefinitions(defs, defs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      defs,
      defs,
      changes,
      languages
    );

    expect(result.changed).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.values).toEqual(values);
  });

  it('renames slug keys based on UUID mapping', () => {
    const fieldId = uuid();
    const oldDefs = [makeTextField({ id: fieldId, slug: 'title' })];
    const newDefs = [makeTextField({ id: fieldId, slug: 'name' })];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: 'Hello', de: 'Hello' }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.changed).toBe(true);
    expect(result.values['name']).toEqual(
      makeStringValue({ en: 'Hello', de: 'Hello' })
    );
    expect(result.values['title']).toBeUndefined();
    expect(result.issues).toHaveLength(0);
  });

  it('handles slug swaps correctly (A↔B)', () => {
    const idA = uuid();
    const idB = uuid();
    const oldDefs = [
      makeTextField({ id: idA, slug: 'title' }),
      makeTextField({ id: idB, slug: 'name' }),
    ];
    const newDefs = [
      makeTextField({ id: idA, slug: 'name' }),
      makeTextField({ id: idB, slug: 'title' }),
    ];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: 'A-value', de: 'A-value' }),
      name: makeStringValue({ en: 'B-value', de: 'B-value' }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.changed).toBe(true);
    expect(result.values['name']).toEqual(
      makeStringValue({ en: 'A-value', de: 'A-value' })
    );
    expect(result.values['title']).toEqual(
      makeStringValue({ en: 'B-value', de: 'B-value' })
    );
  });

  it('handles rename + add-with-same-slug', () => {
    const idA = uuid();
    const idB = uuid();
    const oldDefs = [makeTextField({ id: idA, slug: 'title' })];
    const newDefs = [
      makeTextField({ id: idA, slug: 'name' }),
      makeTextField({ id: idB, slug: 'title', defaultValue: 'default' }),
    ];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: 'Original', de: 'Original' }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.values['name']).toEqual(
      makeStringValue({ en: 'Original', de: 'Original' })
    );
    expect(result.values['title']).toEqual(
      makeStringValue({ en: 'default', de: 'default' })
    );
    expect(result.issues).toHaveLength(0);
  });

  it('strips removed fields', () => {
    const idA = uuid();
    const idB = uuid();
    const oldDefs = [
      makeTextField({ id: idA, slug: 'title' }),
      makeTextField({ id: idB, slug: 'subtitle' }),
    ];
    const newDefs = [makeTextField({ id: idA, slug: 'title' })];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: 'Keep', de: 'Keep' }),
      subtitle: makeStringValue({ en: 'Remove', de: 'Remove' }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.changed).toBe(true);
    expect(result.values['title']).toBeDefined();
    expect(result.values['subtitle']).toBeUndefined();
    expect(result.issues).toHaveLength(0);
  });

  it('populates optional added field with null content', () => {
    const existingId = uuid();
    const newId = uuid();
    const oldDefs = [makeTextField({ id: existingId, slug: 'title' })];
    const newDefs = [
      makeTextField({ id: existingId, slug: 'title' }),
      makeTextField({ id: newId, slug: 'subtitle', isRequired: false }),
    ];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: 'Hello', de: 'Hello' }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.changed).toBe(true);
    expect(result.values['subtitle']).toEqual({
      objectType: 'value',
      valueType: 'string',
      content: { en: null, de: null },
    });
    expect(result.issues).toHaveLength(0);
  });

  it('populates added field with defaultValue', () => {
    const existingId = uuid();
    const newId = uuid();
    const oldDefs = [makeTextField({ id: existingId, slug: 'title' })];
    const newDefs = [
      makeTextField({ id: existingId, slug: 'title' }),
      makeTextField({
        id: newId,
        slug: 'subtitle',
        isRequired: true,
        defaultValue: 'Default text',
      }),
    ];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: 'Hello', de: 'Hello' }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.values['subtitle']).toEqual({
      objectType: 'value',
      valueType: 'string',
      content: { en: 'Default text', de: 'Default text' },
    });
    expect(result.issues).toHaveLength(0);
  });

  it('reports missing_required for added required field without default', () => {
    const existingId = uuid();
    const newId = uuid();
    const oldDefs = [makeTextField({ id: existingId, slug: 'title' })];
    const newDefs = [
      makeTextField({ id: existingId, slug: 'title' }),
      makeTextField({
        id: newId,
        slug: 'email',
        isRequired: true,
        fieldType: 'email' as const,
        valueType: 'string' as const,
      }),
    ];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: 'Hello', de: 'Hello' }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.issue).toBe('missing_required');
    expect(result.issues[0]!.fieldSlug).toBe('email');
    expect(result.issues[0]!.entryId).toBe(entryId);
    expect(result.issues[0]!.collectionId).toBe(collectionId);
  });

  it('reports type_mismatch when valueType changes', () => {
    const fieldId = uuid();
    const oldDefs = [makeTextField({ id: fieldId, slug: 'count' })];
    const newDefs: FieldDefinition[] = [
      {
        id: fieldId,
        slug: 'count',
        valueType: 'number' as const,
        fieldType: 'number' as const,
        label: { en: 'count', de: 'count' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12' as const,
        defaultValue: null,
        min: null,
        max: null,
      },
    ];
    const values: Record<string, Value> = {
      count: makeStringValue({ en: 'not a number', de: 'not a number' }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.issue).toBe('type_mismatch');
    expect(result.issues[0]!.currentValue).toEqual(
      makeStringValue({ en: 'not a number', de: 'not a number' })
    );
  });

  it('reports constraint_violation when value fails new constraints', () => {
    const fieldId = uuid();
    const oldDefs = [
      makeTextField({ id: fieldId, slug: 'title', isRequired: false }),
    ];
    const newDefs = [
      makeTextField({ id: fieldId, slug: 'title', isRequired: true }),
    ];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: null }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.issue).toBe('constraint_violation');
  });

  it('includes transformedValues in issues', () => {
    const existingId = uuid();
    const newId = uuid();
    const oldDefs = [makeTextField({ id: existingId, slug: 'title' })];
    const newDefs = [
      makeTextField({ id: existingId, slug: 'title' }),
      makeTextField({ id: newId, slug: 'required-field', isRequired: true }),
    ];
    const values: Record<string, Value> = {
      title: makeStringValue({ en: 'Hello', de: 'Hello' }),
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.transformedValues['title']).toEqual(
      makeStringValue({ en: 'Hello', de: 'Hello' })
    );
  });

  it('auto-strips disallowed component items when ofComponents narrows', () => {
    const fieldId = uuid();
    const compA = uuid();
    const compB = uuid();
    const oldDefs: FieldDefinition[] = [
      {
        id: fieldId,
        slug: 'blocks',
        valueType: 'component' as const,
        fieldType: 'dynamic' as const,
        label: { en: 'Blocks', de: 'Blocks' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12' as const,
        ofComponents: [compA, compB],
        min: null,
        max: null,
      },
    ];
    const newDefs: FieldDefinition[] = [
      { ...oldDefs[0]!, ofComponents: [compA] } as FieldDefinition,
    ];
    const values: Record<string, Value> = {
      blocks: {
        objectType: 'value',
        valueType: 'component',
        content: [
          { id: uuid(), componentId: compA, values: {} },
          { id: uuid(), componentId: compB, values: {} },
        ],
      },
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);
    const componentResolver = () => [];

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages,
      componentResolver
    );

    expect(result.changed).toBe(true);
    expect(result.issues).toHaveLength(0);
    const blocks = result.values['blocks'] as ComponentValue;
    expect(blocks.content).toHaveLength(1);
    expect(blocks.content[0]!.componentId).toBe(compA);
  });

  it('auto-strips disallowed collection references when ofCollections narrows', () => {
    const fieldId = uuid();
    const collA = uuid();
    const collB = uuid();
    const oldDefs: FieldDefinition[] = [
      {
        id: fieldId,
        slug: 'related',
        valueType: 'reference' as const,
        fieldType: 'entry' as const,
        label: { en: 'Related', de: 'Related' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12' as const,
        ofCollections: [collA, collB],
        min: null,
        max: null,
      },
    ];
    const newDefs: FieldDefinition[] = [
      { ...oldDefs[0]!, ofCollections: [collA] } as FieldDefinition,
    ];
    const refA = {
      id: uuid(),
      objectType: 'entry' as const,
      collectionId: collA,
    };
    const refB = {
      id: uuid(),
      objectType: 'entry' as const,
      collectionId: collB,
    };
    const values: Record<string, Value> = {
      related: {
        objectType: 'value',
        valueType: 'reference',
        content: {
          en: [refA, refB],
          de: [refA],
        },
      },
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.changed).toBe(true);
    expect(result.issues).toHaveLength(0);
    const related = result.values['related'] as ReferencedValue;
    expect(related.content.en).toHaveLength(1);
    const firstRef = related.content.en![0]!;
    expect('collectionId' in firstRef && firstRef.collectionId).toBe(collA);
    expect(related.content.de).toHaveLength(1);
  });

  it('does not strip component items when ofComponents is empty (all allowed)', () => {
    const fieldId = uuid();
    const compA = uuid();
    const oldDefs: FieldDefinition[] = [
      {
        id: fieldId,
        slug: 'blocks',
        valueType: 'component' as const,
        fieldType: 'dynamic' as const,
        label: { en: 'Blocks', de: 'Blocks' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12' as const,
        ofComponents: [] as string[],
        min: null,
        max: null,
      },
    ];
    const newDefs: FieldDefinition[] = [{ ...oldDefs[0]! }];
    const values: Record<string, Value> = {
      blocks: {
        objectType: 'value',
        valueType: 'component',
        content: [{ id: uuid(), componentId: compA, values: {} }],
      },
    };
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const result = transformEntryValues(
      entryId,
      collectionId,
      values,
      oldDefs,
      newDefs,
      changes,
      languages
    );

    expect(result.issues).toHaveLength(0);
    const blocks = result.values['blocks'] as ComponentValue;
    expect(blocks.content).toHaveLength(1);
  });
});
