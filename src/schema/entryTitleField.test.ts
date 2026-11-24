import { describe, expect, it } from 'vitest';
import { uuid } from '../test/setup.js';
import {
  createCollectionSchema,
  collectionFileSchema,
  updateCollectionSchema,
} from './collectionSchema.js';
import {
  entryTitleFieldTypeSchema,
  fieldTypeSchema,
  type FieldType,
} from './fieldSchema.js';

const ISO = '2024-01-01T00:00:00.000Z';

/** The field types that cannot title an Entry, as the complement of the ten. */
const otherFieldTypes = fieldTypeSchema.options.filter(
  (fieldType) =>
    entryTitleFieldTypeSchema.safeParse(fieldType).success === false
);

/**
 * A field definition of the given type, with every key any of the types
 * needs. A key its own schema does not declare is stripped on parse.
 */
function makeFieldDefinition(fieldType: FieldType, id = uuid()) {
  const base = {
    id,
    slug: `a-${fieldType}-field`,
    label: { en: fieldType },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12' as const,
    min: null,
    max: null,
  };

  switch (fieldType) {
    case 'select':
      return {
        ...base,
        fieldType,
        valueType: 'string' as const,
        defaultValue: null,
        options: [{ value: 'one', label: { en: 'One' } }],
      };
    case 'slug':
      return {
        ...base,
        fieldType,
        valueType: 'string' as const,
        isUnique: true,
        defaultValue: null,
        separator: '-',
        lowercase: true,
        decamelize: true,
        ofFieldDefinitions: [],
      };
    case 'number':
      return {
        ...base,
        fieldType,
        valueType: 'number' as const,
        defaultValue: null,
      };
    case 'range':
      return {
        ...base,
        fieldType,
        valueType: 'number' as const,
        isRequired: true,
        min: 0,
        max: 10,
        defaultValue: 5,
      };
    case 'toggle':
      return {
        ...base,
        fieldType,
        valueType: 'boolean' as const,
        isRequired: true,
        defaultValue: false,
      };
    case 'asset':
      return {
        ...base,
        fieldType,
        valueType: 'reference' as const,
        ofAssetMimeTypes: [],
      };
    case 'entry':
      return {
        ...base,
        fieldType,
        valueType: 'reference' as const,
        ofCollections: [],
      };
    case 'dynamic':
      return {
        ...base,
        fieldType,
        valueType: 'component' as const,
        ofComponents: [],
      };
    case 'markdown':
      return {
        ...base,
        fieldType,
        valueType: 'mdast' as const,
        features: {
          headings: [],
          blockquotes: false,
          lists: false,
          codeBlocks: false,
          thematicBreak: false,
          rawHtml: false,
          tables: false,
          taskListItems: false,
          footnotes: false,
          emphasis: false,
          strong: false,
          inlineCode: false,
          externalLinks: false,
          entryReferences: false,
          externalImages: false,
          assetReferences: false,
          strikethrough: false,
          hardLineBreaks: false,
        },
        ofCollections: [],
        ofAssetMimeTypes: [],
        defaultValue: null,
      };
    default:
      return {
        ...base,
        fieldType,
        valueType: 'string' as const,
        defaultValue: null,
      };
  }
}

/** A stored Collection file naming the given field definition as its title. */
function makeCollectionFile(
  entryTitleFieldDefinitionId: string,
  fieldDefinitions: unknown[]
) {
  return {
    objectType: 'collection',
    id: uuid(),
    coreVersion: '1.0.0',
    created: ISO,
    updated: null,
    name: { singular: { en: 'Product' }, plural: { en: 'Products' } },
    slug: { singular: 'product', plural: 'products' },
    description: { en: 'The products' },
    icon: 'home',
    entryTitleFieldDefinitionId,
    fieldDefinitions,
  };
}

function makeGroup(fieldDefinitions: unknown[]) {
  return {
    isGroup: true,
    id: uuid(),
    label: { en: 'Group' },
    description: null,
    fieldDefinitions,
  };
}

describe('entryTitleFieldTypeSchema', () => {
  it('holds the one-line field types and nothing else', () => {
    expect(entryTitleFieldTypeSchema.options.toSorted()).toEqual(
      [
        'date',
        'datetime',
        'email',
        'ipv4',
        'select',
        'slug',
        'telephone',
        'text',
        'time',
        'url',
      ].toSorted()
    );
  });

  it('is a subset of the field types Core has', () => {
    for (const fieldType of entryTitleFieldTypeSchema.options) {
      expect(fieldTypeSchema.safeParse(fieldType).success).toBe(true);
    }
  });

  it('refuses every other field type', () => {
    expect(otherFieldTypes.toSorted()).toEqual([
      'asset',
      'dynamic',
      'entry',
      'markdown',
      'number',
      'range',
      'textarea',
      'toggle',
    ]);
  });
});

describe('the field definition a Collection file titles its Entries by', () => {
  it('accepts a field definition of every type that can title an Entry', () => {
    for (const fieldType of entryTitleFieldTypeSchema.options) {
      const fieldDefinition = makeFieldDefinition(fieldType);
      const result = collectionFileSchema.safeParse(
        makeCollectionFile(fieldDefinition.id, [fieldDefinition])
      );
      expect(
        result.success,
        `a "${fieldType}" field should title an Entry`
      ).toBe(true);
    }
  });

  it('accepts a select over numbers, which is one line too', () => {
    const fieldDefinition = {
      ...makeFieldDefinition('select'),
      valueType: 'number' as const,
      options: [{ value: 1, label: { en: 'One' } }],
      min: null,
      max: null,
      defaultValue: null,
    };
    const result = collectionFileSchema.safeParse(
      makeCollectionFile(fieldDefinition.id, [fieldDefinition])
    );
    expect(result.success).toBe(true);
  });

  it('accepts a field definition inside a group', () => {
    const fieldDefinition = makeFieldDefinition('text');
    const result = collectionFileSchema.safeParse(
      makeCollectionFile(fieldDefinition.id, [makeGroup([fieldDefinition])])
    );
    expect(result.success).toBe(true);
  });

  it('refuses a field definition of every type that cannot title an Entry', () => {
    for (const fieldType of otherFieldTypes) {
      const fieldDefinition = makeFieldDefinition(fieldType);
      const result = collectionFileSchema.safeParse(
        makeCollectionFile(fieldDefinition.id, [fieldDefinition])
      );
      expect(
        result.success,
        `a "${fieldType}" field should not title an Entry`
      ).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
          'entryTitleFieldDefinitionId',
        ]);
        expect(result.error.issues[0]?.message).toContain(fieldType);
      }
    }
  });

  it('refuses a file that names no field definition at all', () => {
    const fieldDefinition = makeFieldDefinition('text');
    const { entryTitleFieldDefinitionId: _, ...withoutTheChoice } =
      makeCollectionFile(fieldDefinition.id, [fieldDefinition]);

    const result = collectionFileSchema.safeParse(withoutTheChoice);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        'entryTitleFieldDefinitionId',
      ]);
    }
  });

  it('refuses an id no field definition of the Collection carries', () => {
    const result = collectionFileSchema.safeParse(
      makeCollectionFile(uuid(), [makeFieldDefinition('text')])
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('does not exist');
    }
  });

  it('refuses the id of a group, which is no field definition', () => {
    const group = makeGroup([makeFieldDefinition('text')]);

    const result = collectionFileSchema.safeParse(
      makeCollectionFile(group.id, [group])
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('does not exist');
    }
  });

  it('refuses a Collection with no field definitions', () => {
    const result = collectionFileSchema.safeParse(
      makeCollectionFile(uuid(), [])
    );

    expect(result.success).toBe(false);
  });
});

describe('the same rule on a create and on an update', () => {
  const fieldDefinition = makeFieldDefinition('text');
  const textarea = makeFieldDefinition('textarea');

  function createProps(
    entryTitleFieldDefinitionId: string,
    fieldDefinitions: unknown[]
  ) {
    const {
      id: _id,
      objectType: _objectType,
      coreVersion: _coreVersion,
      created: _created,
      updated: _updated,
      ...file
    } = makeCollectionFile(entryTitleFieldDefinitionId, fieldDefinitions);
    return { ...file, projectId: uuid() };
  }

  it('accepts a create naming a one-line field definition', () => {
    expect(
      createCollectionSchema.safeParse(
        createProps(fieldDefinition.id, [fieldDefinition])
      ).success
    ).toBe(true);
  });

  it('refuses a create whose field definitions do not hold the id', () => {
    expect(
      createCollectionSchema.safeParse(createProps(uuid(), [fieldDefinition]))
        .success
    ).toBe(false);
  });

  it('refuses a create naming a field definition that is no one line', () => {
    expect(
      createCollectionSchema.safeParse(createProps(textarea.id, [textarea]))
        .success
    ).toBe(false);
  });

  it('accepts an update naming a one-line field definition', () => {
    expect(
      updateCollectionSchema.safeParse({
        ...createProps(fieldDefinition.id, [fieldDefinition]),
        id: uuid(),
      }).success
    ).toBe(true);
  });

  it('refuses an update that drops the field definition it names', () => {
    expect(
      updateCollectionSchema.safeParse({
        ...createProps(fieldDefinition.id, [textarea]),
        id: uuid(),
      }).success
    ).toBe(false);
  });

  it('refuses an update that turns it into a type that cannot title an Entry', () => {
    const turned = { ...textarea, id: fieldDefinition.id };
    expect(
      updateCollectionSchema.safeParse({
        ...createProps(fieldDefinition.id, [turned]),
        id: uuid(),
      }).success
    ).toBe(false);
  });

  it('accepts an update that drops it and names another field definition', () => {
    const another = makeFieldDefinition('slug');
    expect(
      updateCollectionSchema.safeParse({
        ...createProps(another.id, [textarea, another]),
        id: uuid(),
      }).success
    ).toBe(true);
  });
});
