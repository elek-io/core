import { describe, expect, it } from 'vitest';
import { z } from '@hono/zod-openapi';
import { v4 as uuid } from 'uuid';
import type { Component } from '../schema/componentSchema.js';
import type { FieldDefinition } from '../schema/fieldSchema.js';
import { assetSchema } from '../schema/assetSchema.js';
import {
  buildEntryValuesSchema,
  buildEntryValuesTypeString,
} from './schema.js';

function makeComponent(
  overrides: Partial<Component> &
    Pick<Component, 'id' | 'slug' | 'fieldDefinitions'>
): Component {
  return {
    objectType: 'component',
    fileType: 'component',
    name: { en: overrides.slug, de: overrides.slug },
    description: { en: 'desc', de: 'desc' },
    created: '2026-01-01T00:00:00.000Z',
    updated: null,
    ...overrides,
  } as Component;
}

describe('buildEntryValuesSchema', () => {
  it('generates schema for a text field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'title',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Title' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    const valid = { title: { en: 'Hello' } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('generates schema for a number field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'price',
        valueType: 'number',
        fieldType: 'number',
        label: { en: 'Price' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: 0,
        max: 1000,
        defaultValue: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    const valid = { price: { en: 50 } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('rejects number outside of min/max range', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'price',
        valueType: 'number',
        fieldType: 'number',
        label: { en: 'Price' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: 0,
        max: 100,
        defaultValue: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    expect(() => schema.parse({ price: { en: 200 } })).toThrow();
  });

  it('generates schema for a boolean (toggle) field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'active',
        valueType: 'boolean',
        fieldType: 'toggle',
        label: { en: 'Active' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        defaultValue: false,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    const valid = { active: { en: true } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('rejects non-boolean for toggle field', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'active',
        valueType: 'boolean',
        fieldType: 'toggle',
        label: { en: 'Active' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        defaultValue: false,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    expect(() =>
      schema.parse({
        active: { en: 'not-boolean' },
      })
    ).toThrow();
  });

  it('generates schema for an asset reference field definition', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'image',
        valueType: 'reference',
        fieldType: 'asset',
        label: { en: 'Image' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        ofAssetMimeTypes: [],
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    const valid = {
      image: {
        en: [
          { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', objectType: 'asset' },
        ],
      },
    };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('generates schema for multiple field definitions', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'name',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Name' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
      {
        id: uuid(),
        slug: 'published',
        valueType: 'boolean',
        fieldType: 'toggle',
        label: { en: 'Published' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '6',
        defaultValue: false,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    const valid = {
      name: { en: 'Test' },
      published: { en: true },
    };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('generates schema for a component (dynamic) field definition', () => {
    const heroId = uuid();
    const hero = makeComponent({
      id: heroId,
      slug: 'hero',
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'heading',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Heading' },
          description: null,
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
          defaultValue: null,
        },
      ],
    });

    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'sections',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Sections' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [heroId],
        min: null,
        max: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en'], [hero]);
    const valid = {
      sections: [
        {
          id: uuid(),
          componentId: heroId,
          values: { heading: { en: 'Hello' } },
        },
      ],
    };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('returns empty object schema for empty field definitions', () => {
    const schema = buildEntryValuesSchema([], ['en'], []);
    expect(schema.parse({})).toEqual({});
  });
});

describe('buildEntryValuesSchema with nested components', () => {
  const ctaId = uuid();
  const heroId = uuid();
  const cta = makeComponent({
    id: ctaId,
    slug: 'cta',
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'label',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Label' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
    ],
  });
  const hero = makeComponent({
    id: heroId,
    slug: 'hero',
    fieldDefinitions: [
      {
        id: uuid(),
        slug: 'title',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Title' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
      {
        id: uuid(),
        slug: 'sub-blocks',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Sub blocks' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [ctaId],
        min: null,
        max: null,
      },
    ],
  });
  const blocksFieldDef: FieldDefinition = {
    id: uuid(),
    slug: 'blocks',
    valueType: 'component',
    fieldType: 'dynamic',
    label: { en: 'Blocks' },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    ofComponents: [heroId],
    min: null,
    max: null,
  };

  it('accepts a valid nested entry', () => {
    const schema = buildEntryValuesSchema(
      [blocksFieldDef],
      ['en', 'de'],
      [hero, cta]
    );

    const valid = {
      blocks: [
        {
          id: uuid(),
          componentId: heroId,
          values: {
            title: { en: 'Welcome', de: 'Willkommen' },
            'sub-blocks': [
              {
                id: uuid(),
                componentId: ctaId,
                values: {
                  label: { en: 'Click', de: 'Klick' },
                },
              },
            ],
          },
        },
      ],
    };

    expect(schema.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown componentId at the discriminated union', () => {
    const schema = buildEntryValuesSchema(
      [blocksFieldDef],
      ['en', 'de'],
      [hero, cta]
    );

    const invalid = {
      blocks: [
        {
          id: uuid(),
          componentId: uuid(), // not heroId
          values: {
            title: { en: 'Welcome', de: 'Willkommen' },
            'sub-blocks': [],
          },
        },
      ],
    };

    expect(() => schema.parse(invalid)).toThrow();
  });

  it('rejects a missing language inside a nested value', () => {
    const schema = buildEntryValuesSchema(
      [blocksFieldDef],
      ['en', 'de'],
      [hero, cta]
    );

    const invalid = {
      blocks: [
        {
          id: uuid(),
          componentId: heroId,
          values: {
            title: { en: 'Welcome', de: 'Willkommen' },
            'sub-blocks': [
              {
                id: uuid(),
                componentId: ctaId,
                values: {
                  // missing 'de'
                  label: { en: 'Click' },
                },
              },
            ],
          },
        },
      ],
    };

    expect(() => schema.parse(invalid)).toThrow();
  });
});

describe('buildEntryValuesSchema cycle and reference handling', () => {
  it('throws on a circular component reference', () => {
    const aId = uuid();
    const bId = uuid();
    const a = makeComponent({
      id: aId,
      slug: 'a',
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'toB',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'To B' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          ofComponents: [bId],
          min: null,
          max: null,
        },
      ],
    });
    const b = makeComponent({
      id: bId,
      slug: 'b',
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'toA',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'To A' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          ofComponents: [aId],
          min: null,
          max: null,
        },
      ],
    });
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'root',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Root' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [aId],
        min: null,
        max: null,
      },
    ];

    expect(() => buildEntryValuesSchema(fieldDefs, ['en'], [a, b])).toThrow(
      /[Cc]ircular/
    );
  });

  it('does not throw when sibling dynamic fields share an inner Component', () => {
    const innerId = uuid();
    const outerId = uuid();
    const inner = makeComponent({
      id: innerId,
      slug: 'inner',
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'leaf',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Leaf' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
          defaultValue: null,
        },
      ],
    });
    const outer = makeComponent({
      id: outerId,
      slug: 'outer',
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'first',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'First' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          ofComponents: [innerId],
          min: null,
          max: null,
        },
        {
          id: uuid(),
          slug: 'second',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'Second' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          ofComponents: [innerId],
          min: null,
          max: null,
        },
      ],
    });
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'root',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Root' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [outerId],
        min: null,
        max: null,
      },
    ];

    expect(() =>
      buildEntryValuesSchema(fieldDefs, ['en'], [outer, inner])
    ).not.toThrow();
  });

  it('throws when a referenced Component is missing', () => {
    const orphanId = uuid();
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'blocks',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Blocks' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [orphanId],
        min: null,
        max: null,
      },
    ];

    expect(() => buildEntryValuesSchema(fieldDefs, ['en'], [])).toThrow(
      `Component "${orphanId}" referenced by dynamic field "blocks" not found in Project`
    );
  });
});

describe('z.toJSONSchema() compatibility', () => {
  it('produces valid JSON Schema for entry values schema', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'title',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Title' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
      {
        id: uuid(),
        slug: 'count',
        valueType: 'number',
        fieldType: 'number',
        label: { en: 'Count' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
    ];

    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    const jsonSchema = z.toJSONSchema(schema);

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toHaveProperty('title');
    expect(jsonSchema.properties).toHaveProperty('count');
  });

  it('produces valid JSON Schema for assetSchema with .openapi() metadata', () => {
    const jsonSchema = z.toJSONSchema(assetSchema);

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe('object');
    const properties = jsonSchema.properties as Record<string, unknown>;
    expect(properties).toHaveProperty('id');
    expect(properties).toHaveProperty('extension');
    expect(properties).toHaveProperty('absolutePath');
  });

  it('produces valid JSON Schema for empty entry values schema', () => {
    const schema = buildEntryValuesSchema([], ['en'], []);
    const jsonSchema = z.toJSONSchema(schema);

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema.type).toBe('object');
  });
});

describe('buildEntryValuesTypeString', () => {
  it('generates TypeScript type string for direct field definitions', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'title',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Title' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
      {
        id: uuid(),
        slug: 'count',
        valueType: 'number',
        fieldType: 'number',
        label: { en: 'Count' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
      {
        id: uuid(),
        slug: 'active',
        valueType: 'boolean',
        fieldType: 'toggle',
        label: { en: 'Active' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        defaultValue: false,
      },
      {
        id: uuid(),
        slug: 'image',
        valueType: 'reference',
        fieldType: 'asset',
        label: { en: 'Image' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        ofAssetMimeTypes: [],
      },
    ];

    const types = buildEntryValuesTypeString(
      fieldDefs,
      ['en'],
      [],
      'BlogPosts'
    );

    expect(types).toContain('export type Entry');
    expect(types).toContain('"title"');
    expect(types).toContain('"count"');
    expect(types).toContain('"active"');
    expect(types).toContain('"image"');
    expect(types).toContain('string');
    expect(types).toContain('number');
    expect(types).toContain('boolean');
    expect(types).toContain('Array<{ id: string; objectType: string }>');
    expect(types).toContain('ProjectLanguage');
  });

  it('emits per-Component named types and prefixed collection-level Item types', () => {
    const heroId = uuid();
    const hero = makeComponent({
      id: heroId,
      slug: 'hero',
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'title',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Title' },
          description: null,
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
          defaultValue: null,
        },
      ],
    });
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'blocks',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Blocks' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [heroId],
        min: null,
        max: null,
      },
    ];

    const types = buildEntryValuesTypeString(
      fieldDefs,
      ['en'],
      [hero],
      'BlogPosts'
    );

    expect(types).toContain('type HeroComponentValues = {');
    expect(types).toContain('type BlogPostsBlocksItem =');
    expect(types).toContain(
      `| { id: string; componentId: "${heroId}"; values: HeroComponentValues }`
    );
    expect(types).toContain('"blocks": Array<BlogPostsBlocksItem>');
  });

  it('emits prefixed component-internal Item types for nested dynamic fields', () => {
    const ctaId = uuid();
    const heroId = uuid();
    const cta = makeComponent({
      id: ctaId,
      slug: 'cta',
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'label',
          valueType: 'string',
          fieldType: 'text',
          label: { en: 'Label' },
          description: null,
          isRequired: true,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          min: null,
          max: null,
          defaultValue: null,
        },
      ],
    });
    const hero = makeComponent({
      id: heroId,
      slug: 'hero',
      fieldDefinitions: [
        {
          id: uuid(),
          slug: 'sub-blocks',
          valueType: 'component',
          fieldType: 'dynamic',
          label: { en: 'Sub blocks' },
          description: null,
          isRequired: false,
          isDisabled: false,
          isUnique: false,
          inputWidth: '12',
          ofComponents: [ctaId],
          min: null,
          max: null,
        },
      ],
    });
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'blocks',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Blocks' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [heroId],
        min: null,
        max: null,
      },
    ];

    const types = buildEntryValuesTypeString(
      fieldDefs,
      ['en'],
      [hero, cta],
      'BlogPosts'
    );

    expect(types).toContain('type HeroSubBlocksItem =');
    expect(types).toContain(
      `| { id: string; componentId: "${ctaId}"; values: CtaComponentValues }`
    );
    expect(types).toContain('"sub-blocks": Array<HeroSubBlocksItem>');
  });

  it('uses project language values in the generated type', () => {
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'title',
        valueType: 'string',
        fieldType: 'text',
        label: { en: 'Title' },
        description: null,
        isRequired: true,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        min: null,
        max: null,
        defaultValue: null,
      },
    ];

    const projectLanguages = ['en', 'de'] as const;
    const types = buildEntryValuesTypeString(
      fieldDefs,
      [...projectLanguages],
      [],
      'BlogPosts'
    );

    for (const lang of projectLanguages) {
      expect(types).toContain(`"${lang}"`);
    }
    expect(types).toContain('ProjectLanguage');
    expect(types).not.toContain('SupportedLanguage');
    expect(types).toContain('Record<ProjectLanguage');
    expect(types).not.toContain('Partial<Record');
  });

  it('returns empty Record type for empty field definitions', () => {
    const types = buildEntryValuesTypeString([], ['en'], [], 'BlogPosts');
    expect(types).toContain('export type Entry = Record<string, never>;');
  });

  it('throws when a referenced Component is missing', () => {
    const orphanId = uuid();
    const fieldDefs: FieldDefinition[] = [
      {
        id: uuid(),
        slug: 'blocks',
        valueType: 'component',
        fieldType: 'dynamic',
        label: { en: 'Blocks' },
        description: null,
        isRequired: false,
        isDisabled: false,
        isUnique: false,
        inputWidth: '12',
        ofComponents: [orphanId],
        min: null,
        max: null,
      },
    ];

    expect(() =>
      buildEntryValuesTypeString(fieldDefs, ['en'], [], 'BlogPosts')
    ).toThrow(
      `Component "${orphanId}" referenced by dynamic field "blocks" not found in Project`
    );
  });
});
