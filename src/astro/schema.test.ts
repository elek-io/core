import { describe, expect, it } from 'vitest';
import { z } from '@hono/zod-openapi';
import { v4 as uuid } from 'uuid';
import type { MarkdownFeatures } from '../schema/buildMdAstSchema.js';
import type { Component } from '../schema/componentSchema.js';
import type {
  DynamicFieldDefinition,
  FieldDefinition,
} from '../schema/fieldSchema.js';
import { assetSchema } from '../schema/assetSchema.js';
import type { ProjectLanguages } from '../schema/projectSchema.js';
import {
  buildEntryValuesSchema,
  buildEntryValuesTypeString,
  buildModelDigest,
} from './schema.js';

/** Markdown features with everything disabled — tests opt in. */
const offMarkdownFeatures: MarkdownFeatures = {
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
};

function makeMarkdownFieldDef(overrides: {
  slug?: string;
  isRequired?: boolean;
  features?: Partial<MarkdownFeatures>;
  ofCollections?: string[];
  ofAssetMimeTypes?: string[];
}): FieldDefinition {
  return {
    id: uuid(),
    slug: overrides.slug ?? 'body',
    valueType: 'mdast' as const,
    fieldType: 'markdown' as const,
    label: { en: 'Body' },
    description: null,
    isRequired: overrides.isRequired ?? false,
    isDisabled: false,
    isUnique: false as const,
    inputWidth: '12' as const,
    min: null,
    max: null,
    features: { ...offMarkdownFeatures, ...overrides.features },
    ofCollections: overrides.ofCollections ?? [],
    ofAssetMimeTypes: overrides.ofAssetMimeTypes ?? [],
    defaultValue: null,
  };
}

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
          componentSlug: 'hero',
          values: { heading: { en: 'Hello' } },
        },
      ],
    };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('requires the Component slug on every component item', () => {
    const heroId = uuid();
    const hero = makeComponent({
      id: heroId,
      slug: 'hero',
      fieldDefinitions: [],
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

    expect(() =>
      schema.parse({
        sections: [{ id: uuid(), componentId: heroId, values: {} }],
      })
    ).toThrow();
    expect(() =>
      schema.parse({
        sections: [
          {
            id: uuid(),
            componentId: heroId,
            componentSlug: 'not-hero',
            values: {},
          },
        ],
      })
    ).toThrow();
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
          componentSlug: 'hero',
          values: {
            title: { en: 'Welcome', de: 'Willkommen' },
            'sub-blocks': [
              {
                id: uuid(),
                componentId: ctaId,
                componentSlug: 'cta',
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
          componentSlug: 'hero',
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
          componentSlug: 'hero',
          values: {
            title: { en: 'Welcome', de: 'Willkommen' },
            'sub-blocks': [
              {
                id: uuid(),
                componentId: ctaId,
                componentSlug: 'cta',
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
    expect(types).toContain(`Array<{ id: string; objectType: 'asset' }>`);
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
      `| { id: string; componentId: "${heroId}"; componentSlug: "hero"; values: HeroComponentValues }`
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
      `| { id: string; componentId: "${ctaId}"; componentSlug: "cta"; values: CtaComponentValues }`
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

  it('emits an empty Record values type for a referenced Component with no fields', () => {
    const spacerId = uuid();
    const spacer = makeComponent({
      id: spacerId,
      slug: 'spacer',
      fieldDefinitions: [],
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
        ofComponents: [spacerId],
        min: null,
        max: null,
      },
    ];

    const types = buildEntryValuesTypeString(
      fieldDefs,
      ['en'],
      [spacer],
      'BlogPosts'
    );
    expect(types).toContain(
      'type SpacerComponentValues = Record<string, never>;'
    );
  });

  it('emits a slug literal per member of an open dynamic field', () => {
    // ofComponents: [] resolves to every Component of the Project, so the
    // literals have to cover the resolved set, not the empty field config
    const heroId = uuid();
    const ctaId = uuid();
    const hero = makeComponent({
      id: heroId,
      slug: 'hero',
      fieldDefinitions: [],
    });
    const cta = makeComponent({
      id: ctaId,
      slug: 'cta',
      fieldDefinitions: [],
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
        ofComponents: [],
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

    expect(types).toContain(
      `| { id: string; componentId: "${heroId}"; componentSlug: "hero"; values: HeroComponentValues }`
    );
    expect(types).toContain(
      `| { id: string; componentId: "${ctaId}"; componentSlug: "cta"; values: CtaComponentValues }`
    );
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

describe('buildEntryValuesSchema dynamic field arity edge cases', () => {
  const textField = (slug: string): FieldDefinition => ({
    id: uuid(),
    slug,
    valueType: 'string',
    fieldType: 'text',
    label: { en: slug },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    defaultValue: null,
  });

  const dynamicField = (
    slug: string,
    ofComponents: string[],
    overrides: Partial<DynamicFieldDefinition> = {}
  ): FieldDefinition => ({
    id: uuid(),
    slug,
    valueType: 'component',
    fieldType: 'dynamic',
    label: { en: slug },
    description: null,
    isRequired: false,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    ofComponents,
    min: null,
    max: null,
    ...overrides,
  });

  it('accepts only an empty array for an open dynamic field when the Project has no Components', () => {
    // ofComponents: [] means "any Component"; with none in the Project the
    // item schema collapses to z.never(), so no item can ever satisfy it.
    const schema = buildEntryValuesSchema(
      [dynamicField('blocks', [])],
      ['en'],
      []
    );
    expect(schema.parse({ blocks: [] })).toEqual({ blocks: [] });
    expect(() =>
      schema.parse({
        blocks: [{ id: uuid(), componentId: uuid(), values: {} }],
      })
    ).toThrow();
  });

  it('builds a discriminated union when a dynamic field references two Components', () => {
    const alphaId = uuid();
    const betaId = uuid();
    const alpha = makeComponent({
      id: alphaId,
      slug: 'alpha',
      fieldDefinitions: [textField('a')],
    });
    const beta = makeComponent({
      id: betaId,
      slug: 'beta',
      fieldDefinitions: [textField('b')],
    });

    const schema = buildEntryValuesSchema(
      [dynamicField('blocks', [alphaId, betaId])],
      ['en'],
      [alpha, beta]
    );

    expect(
      schema.parse({
        blocks: [
          {
            id: uuid(),
            componentId: alphaId,
            componentSlug: 'alpha',
            values: { a: { en: '1' } },
          },
        ],
      })
    ).toBeTruthy();
    expect(
      schema.parse({
        blocks: [
          {
            id: uuid(),
            componentId: betaId,
            componentSlug: 'beta',
            values: { b: { en: '2' } },
          },
        ],
      })
    ).toBeTruthy();
    expect(() =>
      schema.parse({
        blocks: [
          {
            id: uuid(),
            componentId: uuid(),
            componentSlug: 'gamma',
            values: {},
          },
        ],
      })
    ).toThrow();
  });

  it('discriminates the union on the Component slug', () => {
    const alphaId = uuid();
    const betaId = uuid();
    const alpha = makeComponent({
      id: alphaId,
      slug: 'alpha',
      fieldDefinitions: [textField('a')],
    });
    const beta = makeComponent({
      id: betaId,
      slug: 'beta',
      fieldDefinitions: [textField('b')],
    });

    const schema = buildEntryValuesSchema(
      [dynamicField('blocks', [alphaId, betaId])],
      ['en'],
      [alpha, beta]
    );

    // The slug picks the member, so alpha's item is validated against
    // alpha's values and beta's are not accepted in its place
    const result = schema.safeParse({
      blocks: [
        {
          id: uuid(),
          componentId: alphaId,
          componentSlug: 'alpha',
          values: { b: { en: '2' } },
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('"a"');
  });

  it('requires at least one item for a required dynamic field with no explicit min', () => {
    const heroId = uuid();
    const hero = makeComponent({
      id: heroId,
      slug: 'hero',
      fieldDefinitions: [textField('title')],
    });

    const schema = buildEntryValuesSchema(
      [dynamicField('blocks', [heroId], { isRequired: true })],
      ['en'],
      [hero]
    );

    expect(() => schema.parse({ blocks: [] })).toThrow();
    expect(
      schema.parse({
        blocks: [
          {
            id: uuid(),
            componentId: heroId,
            componentSlug: 'hero',
            values: { title: { en: 'x' } },
          },
        ],
      })
    ).toBeTruthy();
  });
});

describe('buildEntryValuesSchema with markdown fields', () => {
  it('accepts an mdast value with a valid tree', () => {
    const fieldDefs: FieldDefinition[] = [
      makeMarkdownFieldDef({ features: { headings: [2] } }),
    ];
    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    const valid = {
      body: {
        en: {
          type: 'root',
          children: [
            {
              type: 'heading',
              depth: 2,
              children: [{ type: 'text', value: 'Hello' }],
            },
          ],
        },
      },
    };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('accepts null per language when the field is not required', () => {
    const fieldDefs: FieldDefinition[] = [makeMarkdownFieldDef({})];
    const schema = buildEntryValuesSchema(fieldDefs, ['en', 'de'], []);
    const valid = { body: { en: null, de: null } };
    expect(schema.parse(valid)).toEqual(valid);
  });

  it('rejects a tree containing a node type disabled by features', () => {
    const fieldDefs: FieldDefinition[] = [
      makeMarkdownFieldDef({ features: { tables: false } }),
    ];
    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    expect(() =>
      schema.parse({
        body: {
          en: {
            type: 'root',
            children: [
              {
                type: 'table',
                align: [null],
                children: [
                  {
                    type: 'tableRow',
                    children: [
                      {
                        type: 'tableCell',
                        children: [{ type: 'text', value: 'x' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      })
    ).toThrow();
  });

  it('rejects an entryReference whose collectionId is not in ofCollections', () => {
    const allowedCollection = uuid();
    const fieldDefs: FieldDefinition[] = [
      makeMarkdownFieldDef({
        features: { entryReferences: true },
        ofCollections: [allowedCollection],
      }),
    ];
    const schema = buildEntryValuesSchema(fieldDefs, ['en'], []);
    expect(() =>
      schema.parse({
        body: {
          en: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'entryReference',
                    collectionId: uuid(), // not in ofCollections
                    entryId: uuid(),
                    children: [{ type: 'text', value: 'x' }],
                  },
                ],
              },
            ],
          },
        },
      })
    ).toThrow();
  });
});

describe('buildEntryValuesTypeString with markdown fields', () => {
  it('imports MdAstRoot when a markdown field is present', () => {
    const types = buildEntryValuesTypeString(
      [makeMarkdownFieldDef({})],
      ['en'],
      [],
      'Articles'
    );
    expect(types).toContain(`import type { MdAstRoot } from '@elek-io/core';`);
  });

  it('does not import MdAstRoot when no markdown field exists', () => {
    const types = buildEntryValuesTypeString(
      [
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
      ['en'],
      [],
      'Articles'
    );
    expect(types).not.toContain(`from '@elek-io/core'`);
  });

  it('emits Record<ProjectLanguage, MdAstRoot | null> as the field type', () => {
    const types = buildEntryValuesTypeString(
      [makeMarkdownFieldDef({ slug: 'body' })],
      ['en'],
      [],
      'Articles'
    );
    expect(types).toContain(
      `"body": Record<ProjectLanguage, MdAstRoot | null>`
    );
  });

  it('imports MdAstRoot when a markdown field appears inside a referenced Component', () => {
    const componentId = uuid();
    const component: Component = makeComponent({
      id: componentId,
      slug: 'rich-block',
      fieldDefinitions: [makeMarkdownFieldDef({ slug: 'prose' })],
    });

    const types = buildEntryValuesTypeString(
      [
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
          ofComponents: [componentId],
          min: null,
          max: null,
        },
      ],
      ['en'],
      [component],
      'Articles'
    );
    expect(types).toContain(`import type { MdAstRoot } from '@elek-io/core';`);
  });
});

/**
 * A Value of an optional field is `null` in a language the editor left
 * empty, which the generated schema accepts. The generated type has to
 * say so, otherwise a consumer reads `entry.data.slug.de` as a string
 * and gets null at runtime.
 */
function makeTextFieldDef(slug: string, isRequired: boolean): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'string',
    fieldType: 'text',
    label: { en: 'Text' },
    description: null,
    isRequired,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    defaultValue: null,
  };
}

function makeSlugFieldDef(slug: string, isRequired: boolean): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'string',
    fieldType: 'slug',
    label: { en: 'Slug' },
    description: null,
    isRequired,
    isDisabled: false,
    isUnique: true,
    inputWidth: '12',
    defaultValue: null,
    separator: '-',
    lowercase: true,
    decamelize: true,
    ofFieldDefinitions: [],
  };
}

function makeNumberFieldDef(
  slug: string,
  isRequired: boolean
): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'number',
    fieldType: 'number',
    label: { en: 'Number' },
    description: null,
    isRequired,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    defaultValue: null,
  };
}

/** A toggle is always required, it is either true or false */
function makeToggleFieldDef(slug: string): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'boolean',
    fieldType: 'toggle',
    label: { en: 'Toggle' },
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    defaultValue: false,
  };
}

function makeAssetFieldDef(slug: string, isRequired: boolean): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'reference',
    fieldType: 'asset',
    label: { en: 'Asset' },
    description: null,
    isRequired,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    ofAssetMimeTypes: [],
  };
}

function makeEntryFieldDef(
  slug: string,
  isRequired: boolean,
  ofCollections: string[] = []
): FieldDefinition {
  return {
    id: uuid(),
    slug,
    valueType: 'reference',
    fieldType: 'entry',
    label: { en: 'Entry' },
    description: null,
    isRequired,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
    min: null,
    max: null,
    ofCollections,
  };
}

describe('buildEntryValuesTypeString reference fields', () => {
  it('names the kind an Asset reference points at', () => {
    const types = buildEntryValuesTypeString(
      [makeAssetFieldDef('image', false)],
      ['en'],
      [],
      'Articles'
    );

    expect(types).toContain(
      `"image": Record<ProjectLanguage, Array<{ id: string; objectType: 'asset' }>>`
    );
  });

  it('carries collectionId on an Entry reference', () => {
    // The store is keyed per collection, so following a reference needs
    // the Collection it belongs to, not only the Entry id
    const types = buildEntryValuesTypeString(
      [makeEntryFieldDef('related', false)],
      ['en'],
      [],
      'Articles'
    );

    expect(types).toContain(
      `"related": Record<ProjectLanguage, Array<{ id: string; objectType: 'entry'; collectionId: string }>>`
    );
  });

  it('emits the shape the schema accepts, per reference kind', () => {
    // The invariant behind both cases above. Both are generated from
    // the same field definition, so they may never disagree.
    const collectionId = uuid();
    const asset = { id: uuid(), objectType: 'asset' };
    const entry = { id: uuid(), objectType: 'entry', collectionId };

    const assetFieldSchema = buildEntryValuesSchema(
      [makeAssetFieldDef('image', false)],
      ['en'],
      []
    );
    expect(assetFieldSchema.safeParse({ image: { en: [asset] } }).success).toBe(
      true
    );
    expect(assetFieldSchema.safeParse({ image: { en: [entry] } }).success).toBe(
      false
    );

    const entrySchema = buildEntryValuesSchema(
      [makeEntryFieldDef('related', false)],
      ['en'],
      []
    );
    expect(entrySchema.safeParse({ related: { en: [entry] } }).success).toBe(
      true
    );
    // Without collectionId there is no way to reach the Entry, so the
    // schema rejects it and the type has to require it
    expect(
      entrySchema.safeParse({ related: { en: [{ id: entry.id }] } }).success
    ).toBe(false);
  });
});

describe('buildEntryValuesTypeString nullability', () => {
  it('emits string | null for an optional string field', () => {
    const types = buildEntryValuesTypeString(
      [makeTextFieldDef('subtitle', false)],
      ['en'],
      [],
      'Articles'
    );
    expect(types).toContain(
      `"subtitle": Record<ProjectLanguage, string | null>`
    );
  });

  it('emits string for a required string field', () => {
    const types = buildEntryValuesTypeString(
      [makeTextFieldDef('title', true)],
      ['en'],
      [],
      'Articles'
    );
    expect(types).toContain(`"title": Record<ProjectLanguage, string>`);
    expect(types).not.toContain(
      `"title": Record<ProjectLanguage, string | null>`
    );
  });

  it('emits string | null for an optional slug field', () => {
    // The case elekSlugPaths() exists for: an Entry without a slug in
    // a language simply has no page there
    const types = buildEntryValuesTypeString(
      [makeSlugFieldDef('slug', false)],
      ['en', 'de'],
      [],
      'Articles'
    );
    expect(types).toContain(`"slug": Record<ProjectLanguage, string | null>`);
  });

  it('emits number | null for an optional number field', () => {
    const types = buildEntryValuesTypeString(
      [makeNumberFieldDef('weight', false)],
      ['en'],
      [],
      'Articles'
    );
    expect(types).toContain(`"weight": Record<ProjectLanguage, number | null>`);
  });

  it('emits MdAstRoot without null for a required markdown field', () => {
    const types = buildEntryValuesTypeString(
      [makeMarkdownFieldDef({ slug: 'body', isRequired: true })],
      ['en'],
      [],
      'Articles'
    );
    expect(types).toContain(`"body": Record<ProjectLanguage, MdAstRoot>`);
    expect(types).not.toContain(`MdAstRoot | null`);
  });

  it('keeps boolean and reference fields non-nullable', () => {
    // Neither schema is nullable: a toggle is always true or false and
    // an empty reference field is an empty array
    const types = buildEntryValuesTypeString(
      [makeToggleFieldDef('active'), makeAssetFieldDef('image', false)],
      ['en'],
      [],
      'Articles'
    );
    expect(types).toContain(`"active": Record<ProjectLanguage, boolean>`);
    expect(types).toContain(
      `"image": Record<ProjectLanguage, Array<{ id: string; objectType: 'asset' }>>`
    );
  });

  it('applies the same rule to fields inside a referenced Component', () => {
    const componentId = uuid();
    const component = makeComponent({
      id: componentId,
      slug: 'hero',
      fieldDefinitions: [
        makeTextFieldDef('headline', true),
        makeTextFieldDef('kicker', false),
      ],
    });

    const types = buildEntryValuesTypeString(
      [
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
          ofComponents: [componentId],
          min: null,
          max: null,
        },
      ],
      ['en'],
      [component],
      'Articles'
    );

    expect(types).toContain(`"headline": Record<ProjectLanguage, string>`);
    expect(types).toContain(`"kicker": Record<ProjectLanguage, string | null>`);
  });

  it('admits null in the type exactly when the schema does', () => {
    // The invariant behind every case above. Both are generated from
    // the same field definition, so they may never disagree.
    const fieldDefs: FieldDefinition[] = [
      makeTextFieldDef('requiredText', true),
      makeTextFieldDef('optionalText', false),
      makeSlugFieldDef('requiredSlug', true),
      makeSlugFieldDef('optionalSlug', false),
      makeNumberFieldDef('requiredNumber', true),
      makeNumberFieldDef('optionalNumber', false),
      makeToggleFieldDef('toggle'),
      makeAssetFieldDef('requiredAsset', true),
      makeAssetFieldDef('optionalAsset', false),
      makeMarkdownFieldDef({ slug: 'requiredBody', isRequired: true }),
      makeMarkdownFieldDef({ slug: 'optionalBody', isRequired: false }),
    ];

    const types = buildEntryValuesTypeString(fieldDefs, ['en'], [], 'Articles');

    for (const fieldDef of fieldDefs) {
      const schema = buildEntryValuesSchema([fieldDef], ['en'], []);
      const schemaAdmitsNull = schema.safeParse({
        [fieldDef.slug]: { en: null },
      }).success;

      const line = types
        .split('\n')
        .find((candidate) => candidate.includes(`"${fieldDef.slug}":`));
      expect(line, `no emitted line for "${fieldDef.slug}"`).toBeDefined();
      const typeAdmitsNull = line?.includes('| null') ?? false;

      expect(
        typeAdmitsNull,
        `"${fieldDef.slug}" is ${schemaAdmitsNull ? '' : 'not '}nullable in the schema but ${typeAdmitsNull ? '' : 'not '}in the type: ${line}`
      ).toBe(schemaAdmitsNull);
    }
  });
});

describe('buildModelDigest', () => {
  const languages: ProjectLanguages = ['en'];

  it('is stable for the same model', () => {
    const fieldDefs = [makeTextFieldDef('title', true)];
    expect(buildModelDigest(fieldDefs, languages, [])).toBe(
      buildModelDigest(fieldDefs, languages, [])
    );
  });

  it('changes when a field definition is added', () => {
    const before = buildModelDigest(
      [makeTextFieldDef('title', true)],
      languages,
      []
    );
    const after = buildModelDigest(
      [makeTextFieldDef('title', true), makeTextFieldDef('subtitle', false)],
      languages,
      []
    );
    expect(after).not.toBe(before);
  });

  it('changes when a field definition becomes optional', () => {
    // The schema and the emitted type both depend on isRequired
    const before = buildModelDigest(
      [makeTextFieldDef('title', true)],
      languages,
      []
    );
    const after = buildModelDigest(
      [makeTextFieldDef('title', false)],
      languages,
      []
    );
    expect(after).not.toBe(before);
  });

  it('changes when a referenced Component changes', () => {
    const componentId = uuid();
    const withOneField = makeComponent({
      id: componentId,
      slug: 'hero',
      fieldDefinitions: [makeTextFieldDef('headline', true)],
    });
    const withTwoFields = makeComponent({
      id: componentId,
      slug: 'hero',
      fieldDefinitions: [
        makeTextFieldDef('headline', true),
        makeTextFieldDef('subline', false),
      ],
    });
    const fieldDefs = [makeTextFieldDef('title', true)];

    expect(buildModelDigest(fieldDefs, languages, [withTwoFields])).not.toBe(
      buildModelDigest(fieldDefs, languages, [withOneField])
    );
  });

  it('changes when the Project gains a language', () => {
    // Every translatable Value is keyed by the supported languages
    const fieldDefs = [makeTextFieldDef('title', true)];
    expect(buildModelDigest(fieldDefs, ['en', 'de'], [])).not.toBe(
      buildModelDigest(fieldDefs, ['en'], [])
    );
  });

  it('ignores the order Components happen to be listed in', () => {
    // Their order is incidental, unlike the order of field definitions
    const first = makeComponent({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'a',
      fieldDefinitions: [makeTextFieldDef('x', true)],
    });
    const second = makeComponent({
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'b',
      fieldDefinitions: [makeTextFieldDef('y', true)],
    });
    const fieldDefs = [makeTextFieldDef('title', true)];

    expect(buildModelDigest(fieldDefs, languages, [first, second])).toBe(
      buildModelDigest(fieldDefs, languages, [second, first])
    );
  });
});
