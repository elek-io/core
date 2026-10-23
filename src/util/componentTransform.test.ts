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

function makeDynamicField(overrides: {
  id: string;
  slug: string;
  ofComponents: string[];
}): FieldDefinition {
  return {
    valueType: 'component',
    fieldType: 'dynamic',
    label: { en: overrides.slug },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    ...overrides,
  };
}

function makeEntryField(overrides: {
  id: string;
  slug: string;
  ofCollections: string[];
}): FieldDefinition {
  return {
    valueType: 'reference',
    fieldType: 'entry',
    label: { en: overrides.slug },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    ...overrides,
  };
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

  it('reports content_loss for a removed field of a component item', () => {
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

    expect(result.issues).toHaveLength(1);
    const issue = result.issues[0]!;
    if (issue.issue !== 'content_loss' || issue.reason !== 'field_removed') {
      throw new Error(`expected a removed field, got ${issue.issue}`);
    }
    expect(issue.fieldDefinitionId).toBe(removeId);
    expect(issue.fieldSlug).toBe('remove');
    expect(issue.componentItemId).toBe(itemId);
    expect(issue.entryId).toBe(entryId);
    expect(issue.collectionId).toBe(collectionId);
    expect(issue.currentValue).toEqual({
      objectType: 'value',
      valueType: 'string',
      content: { en: 'Remove' },
    });
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

  it('reports content_loss for a removed field nested inside another Component', () => {
    const targetComponentId = uuid();
    const outerComponentId = uuid();
    const keepId = uuid();
    const removeId = uuid();
    const outerItemId = uuid();
    const innerItemId = uuid();

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
            id: outerItemId,
            componentId: outerComponentId,
            values: {
              inner: {
                objectType: 'value',
                valueType: 'component',
                content: [
                  {
                    id: innerItemId,
                    componentId: targetComponentId,
                    values: {
                      keep: {
                        objectType: 'value',
                        valueType: 'string',
                        content: { en: 'Keep' },
                      },
                      remove: {
                        objectType: 'value',
                        valueType: 'string',
                        content: { en: 'Nested' },
                      },
                    },
                  },
                ],
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

    expect(result.issues).toHaveLength(1);
    const issue = result.issues[0]!;
    if (issue.issue !== 'content_loss' || issue.reason !== 'field_removed') {
      throw new Error(`expected a removed field, got ${issue.issue}`);
    }
    expect(issue.componentItemId).toBe(innerItemId);
    expect(issue.fieldDefinitionId).toBe(removeId);
  });

  it('reports content_loss, not a resolution, when a Component narrows ofComponents', () => {
    const componentId = uuid();
    const fieldId = uuid();
    const itemId = uuid();
    const allowed = uuid();
    const disallowed = uuid();

    const oldDefs: FieldDefinition[] = [
      makeDynamicField({
        id: fieldId,
        slug: 'inner',
        ofComponents: [allowed, disallowed],
      }),
    ];
    const newDefs: FieldDefinition[] = [
      makeDynamicField({ id: fieldId, slug: 'inner', ofComponents: [allowed] }),
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
              inner: {
                objectType: 'value',
                valueType: 'component',
                content: [
                  { id: uuid(), componentId: allowed, values: {} },
                  { id: uuid(), componentId: disallowed, values: {} },
                ],
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
      languages,
      () => []
    );

    expect(result.issues).toHaveLength(1);
    const issue = result.issues[0]!;
    if (
      issue.issue !== 'content_loss' ||
      issue.reason !== 'components_narrowed'
    ) {
      throw new Error(`expected a narrowed ofComponents, got ${issue.issue}`);
    }
    expect(issue.componentItemId).toBe(itemId);
    expect(issue.itemCount).toBe(1);
    expect(issue.currentValue.content[0]!.componentId).toBe(disallowed);
  });

  it('reports content_loss, not a resolution, when a Component narrows ofCollections', () => {
    const componentId = uuid();
    const fieldId = uuid();
    const itemId = uuid();
    const allowed = uuid();
    const disallowed = uuid();

    const oldDefs: FieldDefinition[] = [
      makeEntryField({
        id: fieldId,
        slug: 'link',
        ofCollections: [allowed, disallowed],
      }),
    ];
    const newDefs: FieldDefinition[] = [
      makeEntryField({ id: fieldId, slug: 'link', ofCollections: [allowed] }),
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
              link: {
                objectType: 'value',
                valueType: 'reference',
                content: {
                  en: [
                    {
                      id: uuid(),
                      objectType: 'entry',
                      collectionId: allowed,
                    },
                    {
                      id: uuid(),
                      objectType: 'entry',
                      collectionId: disallowed,
                    },
                  ],
                },
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
    const issue = result.issues[0]!;
    if (
      issue.issue !== 'content_loss' ||
      issue.reason !== 'collections_narrowed'
    ) {
      throw new Error(`expected a narrowed ofCollections, got ${issue.issue}`);
    }
    expect(issue.componentItemId).toBe(itemId);
    expect(issue.language).toBe('en');
    expect(issue.itemCount).toBe(1);
  });
});
