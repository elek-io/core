import { describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { transformComponentValues } from './componentTransform.js';
import { diffFieldDefinitions } from './fieldDefinitionDiff.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import type { ProjectLanguages } from '../schema/projectSchema.js';
import type { ComponentValue, Value } from '../schema/valueSchema.js';

const languages: ProjectLanguages = ['en'];
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

describe('transformComponentValues', () => {
  it('renames slugs inside matching component items', () => {
    const componentId = uuid();
    const fieldId = uuid();
    const itemId = uuid();

    const oldDefs = [makeTextField({ id: fieldId, slug: 'old-name' })];
    const newDefs = [makeTextField({ id: fieldId, slug: 'new-name' })];
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const entryValues: Record<string, Value> = {
      blocks: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: itemId,
            componentId,
            values: {
              'old-name': {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'Hello' },
              },
            },
          },
        ],
      },
    };

    const result = transformComponentValues(
      entryId,
      collectionId,
      entryValues,
      componentId,
      oldDefs,
      newDefs,
      changes,
      ['blocks'],
      languages
    );

    expect(result.changed).toBe(true);
    const blocks = result.values['blocks'] as ComponentValue;
    expect(blocks.content[0]!.values['new-name']).toBeDefined();
    expect(blocks.content[0]!.values['old-name']).toBeUndefined();
  });

  it('strips removed fields from component items', () => {
    const componentId = uuid();
    const keepId = uuid();
    const removeId = uuid();
    const itemId = uuid();

    const oldDefs = [
      makeTextField({ id: keepId, slug: 'keep' }),
      makeTextField({ id: removeId, slug: 'remove' }),
    ];
    const newDefs = [makeTextField({ id: keepId, slug: 'keep' })];
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const entryValues: Record<string, Value> = {
      blocks: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: itemId,
            componentId,
            values: {
              keep: {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'Keep' },
              },
              remove: {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'Remove' },
              },
            },
          },
        ],
      },
    };

    const result = transformComponentValues(
      entryId,
      collectionId,
      entryValues,
      componentId,
      oldDefs,
      newDefs,
      changes,
      ['blocks'],
      languages
    );

    expect(result.changed).toBe(true);
    const blocks = result.values['blocks'] as ComponentValue;
    expect(blocks.content[0]!.values['keep']).toBeDefined();
    expect(blocks.content[0]!.values['remove']).toBeUndefined();
  });

  it('adds default values for new optional fields', () => {
    const componentId = uuid();
    const existingId = uuid();
    const newId = uuid();
    const itemId = uuid();

    const oldDefs = [makeTextField({ id: existingId, slug: 'title' })];
    const newDefs = [
      makeTextField({ id: existingId, slug: 'title' }),
      makeTextField({ id: newId, slug: 'subtitle', defaultValue: 'Default' }),
    ];
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const entryValues: Record<string, Value> = {
      blocks: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: itemId,
            componentId,
            values: {
              title: {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'Hello' },
              },
            },
          },
        ],
      },
    };

    const result = transformComponentValues(
      entryId,
      collectionId,
      entryValues,
      componentId,
      oldDefs,
      newDefs,
      changes,
      ['blocks'],
      languages
    );

    expect(result.changed).toBe(true);
    const blocks = result.values['blocks'] as ComponentValue;
    expect(blocks.content[0]!.values['subtitle']).toEqual({
      objectType: 'value',
      valueType: 'string',
      content: { en: 'Default' },
    });
  });

  it('reports missing_required for new required fields without default', () => {
    const componentId = uuid();
    const existingId = uuid();
    const newId = uuid();
    const itemId = uuid();

    const oldDefs = [makeTextField({ id: existingId, slug: 'title' })];
    const newDefs = [
      makeTextField({ id: existingId, slug: 'title' }),
      makeTextField({ id: newId, slug: 'email', isRequired: true }),
    ];
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const entryValues: Record<string, Value> = {
      blocks: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: itemId,
            componentId,
            values: {
              title: {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'Hello' },
              },
            },
          },
        ],
      },
    };

    const result = transformComponentValues(
      entryId,
      collectionId,
      entryValues,
      componentId,
      oldDefs,
      newDefs,
      changes,
      ['blocks'],
      languages
    );

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.issue).toBe('missing_required');
    expect(result.issues[0]!.componentItemId).toBe(itemId);
    expect(result.issues[0]!.fieldSlug).toBe('email');
  });

  it('skips component items that do not match the target componentId', () => {
    const targetComponentId = uuid();
    const otherComponentId = uuid();
    const fieldId = uuid();
    const itemId = uuid();

    const oldDefs = [makeTextField({ id: fieldId, slug: 'old-name' })];
    const newDefs = [makeTextField({ id: fieldId, slug: 'new-name' })];
    const changes = diffFieldDefinitions(oldDefs, newDefs);

    const entryValues: Record<string, Value> = {
      blocks: {
        objectType: 'value',
        valueType: 'component',
        content: [
          {
            id: itemId,
            componentId: otherComponentId,
            values: {
              'old-name': {
                objectType: 'value',
                valueType: 'string',
                content: { en: 'Untouched' },
              },
            },
          },
        ],
      },
    };

    const result = transformComponentValues(
      entryId,
      collectionId,
      entryValues,
      targetComponentId,
      oldDefs,
      newDefs,
      changes,
      ['blocks'],
      languages
    );

    // The item should not be modified since it belongs to a different component
    const blocks = result.values['blocks'] as ComponentValue;
    expect(blocks.content[0]!.values['old-name']).toBeDefined();
    expect(blocks.content[0]!.values['new-name']).toBeUndefined();
  });
});
